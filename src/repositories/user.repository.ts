import { Env } from "../config/env";
import { dbGet, dbRun, nowMs } from "../utils/db";

export class UserRepository {
  static async ensureUser(env: Env, telegramUserId: string): Promise<string> {
    const existing = await dbGet<any>(env.DB, "SELECT id FROM users WHERE telegram_user_id = ? AND deleted_at IS NULL", [
      telegramUserId,
    ]);
    if (existing) return String(existing.id);
    const id = crypto.randomUUID();
    await dbRun(env.DB, "INSERT INTO users (id, telegram_user_id, created_at) VALUES (?, ?, ?)", [id, telegramUserId, nowMs()]);
    return id;
  }

  static async getUserBotCount(env: Env, userId: string): Promise<number> {
    const row = await dbGet<any>(
      env.DB,
      "SELECT COUNT(*) as count FROM bot_projects WHERE owner_user_id = ? AND status != 'deleted' AND deleted_at IS NULL",
      [userId],
    );
    return Number(row?.count || 0);
  }

  static async getTelegramUserIdByInternalId(env: Env, userId: string): Promise<string | null> {
    const row = await dbGet<any>(
      env.DB,
      "SELECT telegram_user_id FROM users WHERE id = ? AND deleted_at IS NULL",
      [userId]
    );
    return row ? String(row.telegram_user_id) : null;
  }
}

