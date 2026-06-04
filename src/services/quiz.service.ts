import { Env } from "../config/env";
import { BotConfig } from "../types";
import { dbGet, dbRun, dbAll, nowMs } from "../utils/db";
import { I18n } from "../utils/i18n";
import { tgSendMessage, tgAnswerCallbackQuery, tgEditMessageText } from "../utils/telegram";
import { getOrCreateActiveSession, completeSession, recordResponseAndUpdateProfile, QuizOption, QuizItem } from "../utils/quiz";
import { Logger } from "../utils/logger";

export class QuizService {
  private static async getLocalizedQuizSetId(db: D1Database, quizSetId: string, lang: string): Promise<string> {
    const current = await dbGet<any>(db, "SELECT id, language, parent_quiz_set_id FROM quiz_sets WHERE id = ?", [quizSetId]);
    if (!current) return quizSetId;
    if (current.language === lang) return quizSetId;

    const parentId = current.parent_quiz_set_id || quizSetId;
    const localized = await dbGet<any>(db, 
      "SELECT id FROM quiz_sets WHERE (id = ? OR parent_quiz_set_id = ?) AND language = ? LIMIT 1", 
      [parentId, parentId, lang]
    );
    
    return localized?.id || quizSetId;
  }

  static async loadQuizItems(db: D1Database, quizSetId: string): Promise<QuizItem[]> {
    const rows = await dbAll<any>(db, "SELECT id, position, question, options_json FROM quiz_items WHERE quiz_set_id = ? ORDER BY position ASC", [quizSetId]);
    return rows.map(r => ({ id: String(r.id), position: Number(r.position), question: String(r.question), options: JSON.parse(String(r.options_json || "[]")) }));
  }

  static async handleQuizStart(params: { env: Env; cfg: BotConfig; token: string; chatId: string; userId: string; i18n: I18n }): Promise<void> {
    let quizSetId = params.cfg.quizSetIds[0];
    if (!quizSetId) {
      await tgSendMessage({ token: params.token, chat_id: params.chatId, text: params.i18n.t("child.no_quiz") });
      return;
    }

    const lang = params.i18n.language;
    const originalQuizSetId = quizSetId;
    quizSetId = await this.getLocalizedQuizSetId(params.env.DB, quizSetId, lang);

    const { sessionId, currentPosition } = await getOrCreateActiveSession({ db: params.env.DB, botProjectId: params.cfg.botProjectId, chatId: params.chatId, userId: params.userId, quizSetId });
    const items = await this.loadQuizItems(params.env.DB, quizSetId);
    
    if (items.length === 0) {
      Logger.error('BOT', `No quiz items found for quizSetId: ${quizSetId} (original: ${originalQuizSetId}, lang: ${lang})`);
      await tgSendMessage({ token: params.token, chat_id: params.chatId, text: params.i18n.t("child.no_quiz") });
      return;
    }

    const item = items[currentPosition];
    if (!item) {
      await completeSession({ db: params.env.DB, sessionId });
      await tgSendMessage({ token: params.token, chat_id: params.chatId, text: params.i18n.t("child.quiz_completed") });
      return;
    }

    await tgSendMessage({
      token: params.token, chat_id: params.chatId,
      text: params.i18n.t("child.quiz_progress", { current: currentPosition + 1, total: items.length, question: item.question }),
      reply_markup: { inline_keyboard: [...item.options.map((o, idx) => [{ text: o.label, callback_data: `qa:${sessionId}:${idx}` }]), [{ text: params.i18n.t("child.skip"), callback_data: `qskip:${sessionId}` }], [{ text: params.i18n.t("child.stop"), callback_data: `qstop:${sessionId}` }]] }
    });
  }

  static async handleQuizCallback(params: { env: Env; cfg: BotConfig; token: string; callback: any; i18n: I18n }): Promise<void> {
    try {
      const data = String(params.callback?.data ?? "");
      const cbId = String(params.callback.id);
      const message = params.callback.message;
      const chatId = String(message?.chat?.id);
      const userId = String(params.callback?.from?.id);
      const parts = data.split(":");
      const kind = parts[0];

      if (kind === "qstop") {
        const sessionId = parts[1];
        await dbRun(params.env.DB, "UPDATE quiz_sessions SET status = 'stopped', completed_at = ? WHERE id = ?", [nowMs(), sessionId]);
        await tgAnswerCallbackQuery({ token: params.token, callback_query_id: cbId, text: params.i18n.t("child.stopped") });
        if (message?.message_id) await tgEditMessageText({ token: params.token, chat_id: chatId, message_id: Number(message.message_id), text: params.i18n.t("child.stopped_msg") });
        return;
      }

      if (kind !== "qa" && kind !== "qskip") {
        await tgAnswerCallbackQuery({ token: params.token, callback_query_id: cbId });
        return;
      }

      const sessionId = parts[1];
      const sessionRow = await dbGet<any>(params.env.DB, "SELECT id, quiz_set_id, current_position, status FROM quiz_sessions WHERE id = ? LIMIT 1", [sessionId]);
      if (!sessionRow || sessionRow.status !== 'active') {
        await tgAnswerCallbackQuery({ token: params.token, callback_query_id: cbId });
        return;
      }

      let quizSetId = String(sessionRow.quiz_set_id);
      const lang = params.i18n.language;
      const localizedQuizSetId = await this.getLocalizedQuizSetId(params.env.DB, quizSetId, lang);
      
      if (localizedQuizSetId !== quizSetId) {
        quizSetId = localizedQuizSetId;
        await dbRun(params.env.DB, "UPDATE quiz_sessions SET quiz_set_id = ? WHERE id = ?", [quizSetId, sessionId]);
      }

      const items = await this.loadQuizItems(params.env.DB, quizSetId);
      const currentIdx = Number(sessionRow.current_position);
      const item = items[currentIdx];

      if (!item) {
        // Session is active but index is out of bounds, maybe quiz changed.
        await completeSession({ db: params.env.DB, sessionId });
        await tgAnswerCallbackQuery({ token: params.token, callback_query_id: cbId, text: params.i18n.t("child.quiz_completed") });
        if (message?.message_id) await tgEditMessageText({ token: params.token, chat_id: chatId, message_id: Number(message.message_id), text: params.i18n.t("child.quiz_completed") });
        return;
      }

      if (kind === "qa") {
        const optIdx = Number(parts[2]);
        const option = item.options[optIdx];
        if (option) {
          await recordResponseAndUpdateProfile({
            db: params.env.DB,
            botProjectId: params.cfg.botProjectId,
            chatId,
            userId,
            sessionId,
            quizSetId,
            quizItemId: item.id,
            question: item.question,
            option
          });
        }
      }

      const nextIdx = currentIdx + 1;
      await dbRun(params.env.DB, "UPDATE quiz_sessions SET current_position = ? WHERE id = ?", [nextIdx, sessionId]);

      const nextItem = items[nextIdx];
      if (!nextItem) {
        await completeSession({ db: params.env.DB, sessionId });
        await tgAnswerCallbackQuery({ token: params.token, callback_query_id: cbId, text: params.i18n.t("child.quiz_completed") });
        if (message?.message_id) await tgEditMessageText({ token: params.token, chat_id: chatId, message_id: Number(message.message_id), text: params.i18n.t("child.quiz_completed") });
      } else {
        await tgAnswerCallbackQuery({ token: params.token, callback_query_id: cbId });
        await tgEditMessageText({
          token: params.token, chat_id: chatId, message_id: Number(message.message_id),
          text: params.i18n.t("child.quiz_progress", { current: nextIdx + 1, total: items.length, question: nextItem.question }),
          reply_markup: {
            inline_keyboard: [
              ...nextItem.options.map((o, idx) => [{ text: o.label, callback_data: `qa:${sessionId}:${idx}` }]),
              [{ text: params.i18n.t("child.skip"), callback_data: `qskip:${sessionId}` }],
              [{ text: params.i18n.t("child.stop"), callback_data: `qstop:${sessionId}` }]
            ]
          }
        });
      }
    } catch (err: any) {
      Logger.error('BOT', `handleQuizCallback error: ${err.message || err}`);
      // Try to answer callback to stop the loading spinner
      try {
        await tgAnswerCallbackQuery({
          token: params.token,
          callback_query_id: String(params.callback.id),
          text: "Error processing quiz. Please try again or restart with /quiz."
        });
      } catch {}
    }
  }

  static async handleQuizProceed(params: { env: Env; cfg: BotConfig; token: string; chatId: string; userId: string }): Promise<void> {
    const quizSetId = params.cfg.quizSetIds[0];
    if (!quizSetId) return;
    const existing = await dbGet<any>(params.env.DB, "SELECT id, status FROM quiz_sessions WHERE bot_project_id = ? AND chat_id = ? AND user_id = ? ORDER BY started_at DESC LIMIT 1", [params.cfg.botProjectId, params.chatId, params.userId]);
    if (existing && existing.status !== "active") return;
    // Auto-proceed logic could trigger next question if appropriate
  }
}
