import { Hono } from "hono";
import { Env } from "../../config/env";
import { BotRepository } from "../../repositories/bot.repository";
import { BotLogicService } from "../../services/bot-logic.service";
import { MessageRepository } from "../../repositories/message.repository";
import { initI18n } from "../../utils/i18n";
import { BotService } from "../../services/bot.service";
import { ParentBotService } from "../../services/parent-bot.service";

export const webhookRouter = new Hono<{ Bindings: Env }>();

webhookRouter.post("/setParentCommands", async (c) => {
  const i18n = await initI18n("en");
  const commands = BotService.parentBotCommands(i18n);
  await BotService.setTelegramCommands({
    token: c.env.PARENT_BOT_TOKEN,
    commands,
  });

  const miniappUrl = c.env.MINIAPP_URL || c.env.PUBLIC_BASE_URL;
  if (miniappUrl) {
    await BotService.setTelegramMenuButtonWebApp({
      token: c.env.PARENT_BOT_TOKEN,
      text: i18n.t("parent.open_miniapp"),
      url: miniappUrl,
      i18n,
    });
  }

  return c.text("Parent bot commands updated");
});

webhookRouter.post("/parent/:secret", async (c) => {
  const secret = c.req.param("secret");
  if (secret !== c.env.PARENT_WEBHOOK_SECRET) return c.text("not found", 404);
  const update = await c.req.json();
  await ParentBotService.handleParentWebhook(c.env, update);
  return c.text("ok");
});

webhookRouter.post("/child/:secret", async (c) => {
  const secret = c.req.param("secret");
  const cfg = await BotRepository.loadBotConfigByWebhookSecret(c.env, secret);
  if (!cfg) return c.text("not found", 404);

  const headerSecret = c.req.header("X-Telegram-Bot-Api-Secret-Token");
  if (!headerSecret || headerSecret !== cfg.webhookHeaderSecret) return c.text("forbidden", 403);

  const update = await c.req.json();
  await BotRepository.storeChildUpdate(c.env, cfg.botProjectId, update);

  if (cfg.status !== "active") return c.text("ok");
  if ((c.env.GLOBAL_DISABLE ?? "false").toLowerCase() === "true") return c.text("ok");

  const cb = update?.callback_query;
  const msg = update?.message ?? update?.edited_message;
  const chatId = String(msg?.chat?.id ?? cb?.message?.chat?.id ?? "");
  const userId = String(msg?.from?.id ?? cb?.from?.id ?? "");
  
  const userLang = (msg?.from?.language_code || cb?.from?.language_code || "en").split("-")[0];
  const botLang = cfg.defaultLanguage === "auto" ? userLang : (cfg.defaultLanguage || "en");
  const i18n = await initI18n(botLang);
  const token = await BotRepository.getBotToken(c.env, cfg.botProjectId);
  if (!token) return c.text("ok");
  
  if (chatId && userId) {
    await MessageRepository.ensureBotSubscriber({
      env: c.env, botProjectId: cfg.botProjectId, chatId, telegramUserId: userId,
      username: msg?.from?.username || cb?.from?.username,
      firstName: msg?.from?.first_name || cb?.from?.first_name,
      lastName: msg?.from?.last_name || cb?.from?.last_name,
      languageCode: msg?.from?.language_code || cb?.from?.language_code,
    });
  }

  await BotLogicService.handleChildWebhook(c.env, update, cfg, token, i18n);
  return c.text("ok");
});

