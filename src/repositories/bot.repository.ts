import { Env } from "../config/env";
import { dbGet, dbAll, dbRun, nowMs } from "../utils/db";
import { BotConfig } from "../types";
import { kvGetJson } from "../utils/kv";
import { unwrapDekWithKek, decryptWithDek } from "../utils/crypto";
import { Logger } from "../utils/logger";

export class BotRepository {
  static async loadBotConfigByWebhookSecret(env: Env, webhookSecret: string): Promise<BotConfig | null> {
    const cacheKey = `botcfg:${webhookSecret}`;
    const cached = await kvGetJson<BotConfig>(env.KV, cacheKey);
    if (cached) return cached;

    const project = await dbGet<any>(
      env.DB,
      `SELECT 
        p.id as botProjectId,
        p.owner_user_id as ownerUserId,
        p.status as status,
        p.bot_telegram_id as botTelegramId,
        p.bot_username as botUsername,
        p.default_language as defaultLanguage,
        p.name as name,
        p.description as description,
        p.business_context as businessContext,
        p.allowed_topics_json as allowedTopicsJson,
        p.disallowed_topics_json as disallowedTopicsJson,
        p.webhook_header_secret as webhookHeaderSecret,
        p.timezone as timezone,
        p.type as type,
        p.welcome_image_url as welcomeImageUrl,
        pr.system_prompt as systemPrompt,
        pr.default_prompt as defaultPrompt,
        pr.moderation_prompt as moderationPrompt
      FROM bot_projects p
      JOIN bot_prompts pr ON pr.bot_project_id = p.id
      WHERE p.webhook_secret = ? AND p.deleted_at IS NULL
      LIMIT 1`,
      [webhookSecret],
    );
    if (!project) return null;

    const quizSets = await dbAll<any>(
      env.DB,
      "SELECT id FROM quiz_sets WHERE bot_project_id = ? AND parent_quiz_set_id IS NULL ORDER BY created_at ASC",
      [String(project.botProjectId)],
    );

    const cfg: BotConfig = {
      botProjectId: String(project.botProjectId),
      ownerUserId: String(project.ownerUserId),
      status: String(project.status),
      botTelegramId: String(project.botTelegramId),
      botUsername: String(project.botUsername),
      defaultLanguage: String(project.defaultLanguage),
      name: String(project.name),
      description: String(project.description),
      businessContext: project.businessContext ? String(project.businessContext) : null,
      allowedTopicsJson: project.allowedTopicsJson ? String(project.allowedTopicsJson) : null,
      disallowedTopicsJson: project.disallowedTopicsJson ? String(project.disallowedTopicsJson) : null,
      webhookHeaderSecret: String(project.webhookHeaderSecret),
      systemPrompt: String(project.systemPrompt),
      defaultPrompt: String(project.defaultPrompt),
      moderationPrompt: String(project.moderationPrompt),
      timezone: String(project.timezone || "UTC"),
      quizSetIds: quizSets.map((q) => String(q.id)),
      type: String(project.type || "assistant"),
      welcomeImageUrl: project.welcomeImageUrl ? String(project.welcomeImageUrl) : null,
    };

    await env.KV.put(cacheKey, JSON.stringify(cfg), { expirationTtl: 300 });
    return cfg;
  }

  static async invalidateBotConfigCache(env: Env, botProjectId: string): Promise<void> {
    const project = await dbGet<any>(env.DB, "SELECT webhook_secret FROM bot_projects WHERE id = ?", [botProjectId]);
    if (project?.webhook_secret) {
      await env.KV.delete(`botcfg:${project.webhook_secret}`);
    }
  }

  static async loadBotConfigById(env: Env, botId: string): Promise<BotConfig | null> {
    const project = await dbGet<any>(
      env.DB,
      `SELECT 
        p.id as botProjectId,
        p.owner_user_id as ownerUserId,
        p.status as status,
        p.bot_telegram_id as botTelegramId,
        p.bot_username as botUsername,
        p.default_language as defaultLanguage,
        p.name as name,
        p.description as description,
        p.business_context as businessContext,
        p.allowed_topics_json as allowedTopicsJson,
        p.disallowed_topics_json as disallowedTopicsJson,
        p.webhook_header_secret as webhookHeaderSecret,
        p.timezone as timezone,
        p.type as type,
        p.welcome_image_url as welcomeImageUrl,
        pr.system_prompt as systemPrompt,
        pr.default_prompt as defaultPrompt,
        pr.moderation_prompt as moderationPrompt
      FROM bot_projects p
      JOIN bot_prompts pr ON pr.bot_project_id = p.id
      WHERE p.id = ? AND p.deleted_at IS NULL
      LIMIT 1`,
      [botId],
    );
    if (!project) return null;

    const quizSets = await dbAll<any>(
      env.DB,
      "SELECT id FROM quiz_sets WHERE bot_project_id = ? AND parent_quiz_set_id IS NULL ORDER BY created_at ASC",
      [String(project.botProjectId)],
    );

    return {
      botProjectId: String(project.botProjectId),
      ownerUserId: String(project.ownerUserId),
      status: String(project.status),
      botTelegramId: String(project.botTelegramId),
      botUsername: String(project.botUsername),
      defaultLanguage: String(project.defaultLanguage),
      name: String(project.name),
      description: String(project.description),
      businessContext: project.businessContext ? String(project.businessContext) : null,
      allowedTopicsJson: project.allowedTopicsJson ? String(project.allowedTopicsJson) : null,
      disallowedTopicsJson: project.disallowedTopicsJson ? String(project.disallowedTopicsJson) : null,
      webhookHeaderSecret: String(project.webhookHeaderSecret),
      systemPrompt: String(project.systemPrompt),
      defaultPrompt: String(project.defaultPrompt),
      moderationPrompt: String(project.moderationPrompt),
      timezone: String(project.timezone || "UTC"),
      quizSetIds: quizSets.map((q) => String(q.id)),
      type: String(project.type || "assistant"),
      welcomeImageUrl: project.welcomeImageUrl ? String(project.welcomeImageUrl) : null,
    };
  }

  static async decryptChildToken(env: Env, botProjectId: string): Promise<string> {
    const cacheKey = `bottoken:${botProjectId}`;
    const cached = await env.KV.get(cacheKey);
    if (cached) return cached;

    const keyRow = await dbGet<any>(
      env.DB,
      "SELECT dek_wrapped_b64, dek_wrap_iv_b64 FROM bot_keys WHERE bot_project_id = ?",
      [botProjectId],
    );
    if (!keyRow) throw new Error("Missing bot key");
    const dek = await unwrapDekWithKek({
      dekWrappedB64: String(keyRow.dek_wrapped_b64),
      dekWrapIvB64: String(keyRow.dek_wrap_iv_b64),
      kekBase64: env.KEK_MASTER_KEY,
    });
    const tokenRow = await dbGet<any>(
      env.DB,
      "SELECT token_ciphertext_b64, token_iv_b64 FROM bot_tokens WHERE bot_project_id = ?",
      [botProjectId],
    );
    if (!tokenRow) throw new Error("Missing bot token");

    const token = await decryptWithDek({
      dekRaw: dek,
      ciphertextB64: String(tokenRow.token_ciphertext_b64),
      ivB64: String(tokenRow.token_iv_b64),
    });
    await env.KV.put(cacheKey, token, { expirationTtl: 300 });
    return token;
  }

  static async getBotToken(env: Env, botProjectId: string): Promise<string | null> {
    try {
      return await this.decryptChildToken(env, botProjectId);
    } catch (e: any) {
      Logger.error('DB', `getBotToken failed botProjectId=${botProjectId} error=${e.message}`);
      return null;
    }
  }

  static async storeChildUpdate(env: Env, botProjectId: string, update: any): Promise<void> {
    const updateId = Number(update?.update_id ?? 0);
    await dbRun(
      env.DB,
      "INSERT OR IGNORE INTO telegram_updates_raw (id, bot_project_id, update_id, received_at, update_json) VALUES (?, ?, ?, ?, ?)",
      [crypto.randomUUID(), botProjectId, updateId, nowMs(), JSON.stringify(update)],
    );
  }
}
