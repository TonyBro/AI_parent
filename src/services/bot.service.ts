import { Env } from "../config/env";
import { BotConfig } from "../types";
import { dbAll, dbRun, nowMs } from "../utils/db";
import { tgApi, tgSendMessage, tgDeleteMessage } from "../utils/telegram";
import { BotRepository } from "../repositories/bot.repository";
import { I18n } from "../utils/i18n";
import { Logger } from "../utils/logger";

export class BotService {
  static async setTelegramCommands(params: {
    token: string;
    commands: Array<{ command: string; description: string }>;
  }): Promise<void> {
    const commands = params.commands
      .map((c) => ({
        // Telegram commands must be lowercase, 1-32 chars, only a-z, 0-9, and underscores
        command: c.command
          .toLowerCase()
          .replace(/^\//, "")
          .replace(/[^a-z0-9_]/g, "_")
          .slice(0, 32),
        description: c.description.slice(0, 256),
      }))
      .filter((c) => c.command.length > 0);

    if (commands.length === 0) {
      await tgApi<any>(params.token, "deleteMyCommands", {});
    } else {
      await tgApi<any>(params.token, "setMyCommands", { commands });
    }
  }

  static async syncTelegramCommandsForBot(env: Env, botProjectId: string, token?: string): Promise<void> {
    try {
      const botToken = token || await BotRepository.getBotToken(env, botProjectId);
      if (!botToken) return;
      const commands = await dbAll<any>(
        env.DB,
        "SELECT command, description FROM bot_commands WHERE bot_project_id = ? AND show_in_menu = 1 ORDER BY created_at ASC",
        [botProjectId],
      );
      await this.setTelegramCommands({
        token: botToken,
        commands: commands.map((cmd) => ({
          command: String(cmd.command),
          description: String(cmd.description),
        })),
      });
    } catch (error: any) {
      Logger.error('BOT', `[syncTelegramCommands] Failed to sync commands for bot ${botProjectId}: ${error.message}`);
    }
  }

  static async setTelegramMenuButtonWebApp(params: { token: string; text: string; url: string; i18n: I18n; chat_id?: string; skipDescription?: boolean }): Promise<void> {
    await tgApi<any>(params.token, "setChatMenuButton", {
      chat_id: params.chat_id,
      menu_button: { type: "web_app", text: params.text, web_app: { url: params.url } },
    });
    if (!params.chat_id && !params.skipDescription) {
      await tgApi<any>(params.token, "setMyShortDescription", {
        short_description: params.i18n.t("parent.bot_short_description"),
      });
      await tgApi<any>(params.token, "setMyDescription", {
        description: params.i18n.t("parent.bot_full_description"),
      });
    }
  }

  static async syncBotMetadata(params: {
    token: string;
    name: string;
    description: string;
    language_code?: string;
  }): Promise<void> {
    // 1. setMyName (bot name) - limit 64 chars
    await tgApi<any>(params.token, "setMyName", {
      name: params.name.slice(0, 64),
      language_code: params.language_code,
    });
    // 2. setMyShortDescription (description shown on profile) - limit 120 chars
    await tgApi<any>(params.token, "setMyShortDescription", {
      short_description: params.description.slice(0, 120),
      language_code: params.language_code,
    });
    // 3. setMyDescription ("About" text) - limit 512 chars
    await tgApi<any>(params.token, "setMyDescription", {
      description: params.description.slice(0, 512),
      language_code: params.language_code,
    });
  }

  static parentBotCommands(i18n: I18n) {
    return [
      { command: "/start", description: i18n.t("child.start_cmd_desc") },
      { command: "/create_bot", description: i18n.t("parent.create_bot_desc") },
      { command: "/my_bot", description: i18n.t("parent.my_bot_desc") },
      { command: "/cancel", description: i18n.t("parent.cancel_desc") },
      { command: "/delete_my_data", description: i18n.t("parent.delete_my_data_desc") },
    ];
  }
}
