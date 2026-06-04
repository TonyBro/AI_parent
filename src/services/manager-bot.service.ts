import { Env } from "../config/env";
import { BotConfig } from "../types";
import { dbAll } from "../utils/db";
import { tgSendMessage, tgDeleteMessage } from "../utils/telegram";
import { Logger } from "../utils/logger";

export class ManagerBotService {
  static async handleManagerBotMessage(params: {
    env: Env;
    cfg: BotConfig;
    token: string;
    msg: any;
    chatId: string;
    userId: string;
    text: string | null;
  }): Promise<void> {
    const { env, cfg, token, msg, chatId, text } = params;
    if (!text) return;

    const actions = await dbAll<any>(
      env.DB,
      "SELECT id, type, settings_json FROM bot_actions WHERE bot_project_id = ? AND status = 'active' ORDER BY created_at ASC",
      [cfg.botProjectId],
    );

    for (const action of actions) {
      try {
        const settings = JSON.parse(String(action.settings_json || "{}"));
        
        if (action.type === "link_rewriter") {
          const targetUrl = String(settings.target_url || "");
          const replaceTo = String(settings.replace_to || "");
          
          if (targetUrl && text.includes(targetUrl)) {
            const messageId = msg.message_id ? Number(msg.message_id) : null;
            if (messageId) {
              try {
                await tgDeleteMessage({ token, chat_id: chatId, message_id: messageId });
              } catch {}
            }
            
            const replacedText = text.replace(new RegExp(targetUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), replaceTo);
            const userName = msg.from?.first_name ? String(msg.from.first_name) : "User";
            await tgSendMessage({ token, chat_id: chatId, text: `${userName}: ${replacedText}` });
            return;
          }
        }
      } catch (e: any) {
        Logger.error('BOT', `Failed to process action ${action.type}: ${e.message}`);
      }
    }
  }
}






