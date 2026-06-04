import { Env } from "../config/env";
import { dbRun, dbGet, nowMs } from "../utils/db";

export class MessageRepository {
  static async storeMessage(params: {
    env: Env;
    botProjectId: string;
    chatId: string;
    userId: string | null;
    messageId: number | null;
    direction: "in" | "out";
    text: string | null;
    languageCode: string | null;
    mediaJson: any | null;
  }): Promise<void> {
    await dbRun(
      params.env.DB,
      "INSERT INTO messages (id, bot_project_id, chat_id, user_id, message_id, direction, text, language_code, media_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [
        crypto.randomUUID(),
        params.botProjectId,
        params.chatId,
        params.userId,
        params.messageId,
        params.direction,
        params.text,
        params.languageCode,
        params.mediaJson ? JSON.stringify(params.mediaJson) : null,
        nowMs(),
      ],
    );
  }

  static async ensureBotSubscriber(params: {
    env: Env;
    botProjectId: string;
    chatId: string;
    telegramUserId: string;
    username?: string;
    firstName?: string;
    lastName?: string;
    languageCode?: string;
  }): Promise<void> {
    const existing = await dbGet<any>(
      params.env.DB,
      "SELECT id FROM bot_subscribers WHERE bot_project_id = ? AND chat_id = ? AND user_id = ?",
      [params.botProjectId, params.chatId, params.telegramUserId],
    );
    if (!existing) {
      await dbRun(
        params.env.DB,
        "INSERT INTO bot_subscribers (id, bot_project_id, chat_id, user_id, timezone_offset, subscribed, last_message_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)",
        [crypto.randomUUID(), params.botProjectId, params.chatId, params.telegramUserId, null, nowMs(), nowMs(), nowMs()],
      );
    } else {
      await dbRun(
        params.env.DB,
        "UPDATE bot_subscribers SET last_message_at = ?, updated_at = ? WHERE bot_project_id = ? AND chat_id = ? AND user_id = ?",
        [nowMs(), nowMs(), params.botProjectId, params.chatId, params.telegramUserId],
      );
    }

    // Also ensure user_profile language is updated
    if (params.languageCode) {
      const lang = params.languageCode.split("-")[0];
      await dbRun(
        params.env.DB,
        `INSERT INTO user_profiles (id, bot_project_id, chat_id, user_id, language, profile_json, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(bot_project_id, chat_id, user_id) 
         DO UPDATE SET language = excluded.language, updated_at = excluded.updated_at`,
        [crypto.randomUUID(), params.botProjectId, params.chatId, params.telegramUserId, lang, "{}", nowMs()]
      );
    }
  }
}
