import { Hono } from "hono";
import { Env } from "../../../config/env";
import { dbGet, dbRun, nowMs } from "../../../utils/db";
import { UserRepository } from "../../../repositories/user.repository";
import { tgApi } from "../../../utils/telegram";
import { wrapDekWithKek, encryptWithDek } from "../../../utils/crypto";
import { DEFAULT_PROMPTS } from "../../../config/prompts";
import { AIService } from "../../../services/ai.service";
import { initI18n } from "../../../utils/i18n";
import { BotService } from "../../../services/bot.service";
import { BotAvatarService } from "../../../services/bot-avatar.service";
import { BotRepository } from "../../../repositories/bot.repository";
import { Logger } from "../../../utils/logger";

export const botRoutes = new Hono<{ Bindings: Env; Variables: { userId: string } }>();

// Original: PATCH /api/bots/:botId
botRoutes.patch("/:botId", async (c) => {
  const userId = c.get("userId");
  const botId = c.req.param("botId");
  const body = await c.req.json();

  const bot = await dbGet<any>(
    c.env.DB,
    "SELECT id FROM bot_projects WHERE id = ? AND owner_user_id = ? AND deleted_at IS NULL",
    [botId, userId],
  );
  if (!bot) return c.json({ error: "not_found" }, 404);

  const fields: string[] = [];
  const binds: any[] = [];
  
  if (typeof body.status === "string") {
    fields.push("status = ?");
    binds.push(body.status);
    if (body.status === "disabled") {
      fields.push("disabled_at = ?");
      binds.push(nowMs());
    }
  }
  if (typeof body.default_language === "string") {
    fields.push("default_language = ?");
    binds.push(body.default_language);
  }
  if (typeof body.name === "string") {
    fields.push("name = ?");
    binds.push(body.name);
  }
  if (typeof body.description === "string") {
    fields.push("description = ?");
    binds.push(body.description);
  }
  if (typeof body.timezone === "string") {
    fields.push("timezone = ?");
    binds.push(body.timezone);
  }

  if (!fields.length) return c.json({ ok: true });

  fields.push("updated_at = ?");
  binds.push(nowMs());
  binds.push(botId);

  await dbRun(c.env.DB, `UPDATE bot_projects SET ${fields.join(", ")} WHERE id = ?`, binds);

  // Sync bot metadata if name or description changed
  if (typeof body.name === "string" || typeof body.description === "string") {
    try {
      const fullBot = await dbGet<any>(
        c.env.DB,
        "SELECT name, description FROM bot_projects WHERE id = ?",
        [botId]
      );
      const token = await BotRepository.getBotToken(c.env, botId);
      if (token && fullBot) {
        await BotService.syncBotMetadata({
          token,
          name: fullBot.name,
          description: fullBot.description,
        });
      }
    } catch (e: any) {
      Logger.error('API', `[botRoutes.patch] Failed to sync metadata for bot ${botId}: ${e.message}`);
    }
  }

  return c.json({ ok: true });
});

botRoutes.post("/:botId/sync", async (c) => {
  const userId = c.get("userId");
  const botId = c.req.param("botId");

  const bot = await dbGet<any>(
    c.env.DB,
    "SELECT id, name, description, webhook_secret, webhook_header_secret FROM bot_projects WHERE id = ? AND owner_user_id = ? AND deleted_at IS NULL",
    [botId, userId],
  );
  if (!bot) return c.json({ error: "not_found" }, 404);

  const token = await BotRepository.getBotToken(c.env, botId);
  if (!token) return c.json({ error: "missing_token" }, 500);

  try {
    // 1. Sync commands
    await BotService.syncTelegramCommandsForBot(c.env, botId, token);

    // 2. Set Webhook
    const webhookUrl = `${c.env.PUBLIC_BASE_URL.replace(/\/$/, "")}/webhooks/child/${bot.webhook_secret}`;
    await tgApi(token, "setWebhook", { 
      url: webhookUrl, 
      secret_token: bot.webhook_header_secret,
      allowed_updates: ["message", "callback_query", "edited_message"]
    });

    // 3. Sync metadata
    await BotService.syncBotMetadata({
      token,
      name: bot.name,
      description: bot.description,
    });

    // 4. Ensure no menu button is set for child bots (reset to default)
    await tgApi(token, "setChatMenuButton", {
      menu_button: { type: "commands" }
    });

    await BotRepository.invalidateBotConfigCache(c.env, botId);

    return c.json({ ok: true });
  } catch (e: any) {
    Logger.error('API', `[botRoutes.post.sync] Failed to sync bot ${botId}: ${e.message}`);
    return c.json({ error: "sync_failed", description: e.message }, 500);
  }
});

botRoutes.delete("/:botId", async (c) => {
  const userId = c.get("userId");
  const botId = c.req.param("botId");

  const bot = await dbGet<any>(
    c.env.DB,
    "SELECT id, webhook_secret FROM bot_projects WHERE id = ? AND owner_user_id = ? AND deleted_at IS NULL",
    [botId, userId],
  );
  if (!bot) return c.json({ error: "not_found" }, 404);

  // Attempt to unset webhook in Telegram before deleting
  try {
    const token = await BotRepository.getBotToken(c.env, botId);
    if (token) {
      await tgApi(token, "deleteWebhook", { drop_pending_updates: true });
      await tgApi(token, "setMyCommands", { commands: [] });
      // Reset menu button to default (commands)
      await tgApi(token, "setChatMenuButton", {
        menu_button: { type: "commands" }
      });
    }
  } catch (e: any) {
    Logger.error('API', `[botRoutes.delete] Failed to unset webhook for bot ${botId}: ${e.message}`);
  }

  await dbRun(
    c.env.DB,
    "UPDATE bot_projects SET deleted_at = ?, updated_at = ? WHERE id = ?",
    [nowMs(), nowMs(), botId]
  );

  // Clear cache if exists
  if (bot.webhook_secret) {
    await c.env.KV.delete(`botcfg:${bot.webhook_secret}`);
  }
  await c.env.KV.delete(`bottoken:${botId}`);

  return c.json({ ok: true });
});

// Original: POST /api/bots/:botId/photo
botRoutes.post("/:botId/photo", async (c) => {
  const userId = c.get("userId");
  const botId = c.req.param("botId");

  const bot = await dbGet<any>(
    c.env.DB,
    "SELECT id FROM bot_projects WHERE id = ? AND owner_user_id = ? AND deleted_at IS NULL",
    [botId, userId],
  );
  if (!bot) return c.json({ error: "not_found" }, 404);

  try {
    const formData = await c.req.formData();
    const photo = formData.get("photo");

    if (!photo || !(photo instanceof File)) {
      return c.json({ error: "missing_photo", description: "Please upload a photo file." }, 400);
    }

    // Get the bot token
    const botToken = await BotRepository.getBotToken(c.env, botId);
    if (!botToken) {
      return c.json({ error: "missing_token", description: "Bot token not found or could not be decrypted." }, 500);
    }

    // Convert File to ArrayBuffer
    const arrayBuffer = await photo.arrayBuffer();

    // Update photo via MTProto (GramJS)
    await BotAvatarService.updateBotPhoto(c.env, botToken, arrayBuffer);

    return c.json({ ok: true });
  } catch (error: any) {
    const errorMsg = error.message || String(error);
    Logger.error('API', `[botRoutes.post.photo] Failed to update photo for bot ${botId}: ${errorMsg}`);
    return c.json({
      error: "update_failed",
      description: errorMsg
    }, 500);
  }
});
