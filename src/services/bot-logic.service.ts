import { Env } from "../config/env";
import { BotConfig } from "../types";
import { MessageRepository } from "../repositories/message.repository";
import { QuizService } from "./quiz.service";
import { ManagerBotService } from "./manager-bot.service";
import { BotCommandService } from "./bot-command.service";
import { BotChatService } from "./bot-chat.service";

export class BotLogicService {
  static async handleChildWebhook(env: Env, update: any, cfg: BotConfig, token: string, i18n: any): Promise<void> {
    const cb = update?.callback_query;
    const msg = update?.message ?? update?.edited_message;
    const chatId = String(msg?.chat?.id ?? cb?.message?.chat?.id ?? "");
    const userId = String(msg?.from?.id ?? cb?.from?.id ?? "");
    const replyToMessageId = msg?.message_id ? Number(msg.message_id) : undefined;

    // 1. Handle callback queries (Quizzes)
    if (cb) {
      await QuizService.handleQuizCallback({ env, cfg, token, callback: cb, i18n });
      return;
    }
    
    if (!msg) return;

    const text = msg.text ? String(msg.text) : null;
    const chatType = msg.chat?.type || "private";
    
    // 2. Store incoming message (only for private 1-on-1 chats)
    if (chatType === "private") {
      await MessageRepository.storeMessage({
        env, botProjectId: cfg.botProjectId, chatId, userId,
        messageId: msg.message_id ? Number(msg.message_id) : null,
        direction: "in", text, languageCode: msg.from?.language_code || null,
        mediaJson: this.extractMediaMetadata(msg)
      });
    }

    // 3. Handle Manager Bot type
    if (cfg.type === "manager") {
      await ManagerBotService.handleManagerBotMessage({ env, cfg, token, msg, chatId, userId, text });
      return;
    }

    if (!text) return;

    // 4. Process Commands
    const cmdCtx = await BotCommandService.processCommand({
      env, cfg, token, chatId, userId, text, i18n, msg
    });

    if (cmdCtx.stopProcessing) {
      return;
    }

    // 5. Process AI Chat
    await BotChatService.processChat({
      env, cfg, token, chatId, userId, text, i18n, msg, cmdCtx, replyToMessageId
    });
  }

  private static extractMediaMetadata(msg: any): any | null {
    const out: any = {};
    if (msg.photo) out.photo = msg.photo.map((p: any) => ({ file_id: p.file_id }));
    if (msg.document) out.document = { file_id: msg.document.file_id };
    if (msg.voice) out.voice = { file_id: msg.voice.file_id };
    return Object.keys(out).length ? out : null;
  }
}
