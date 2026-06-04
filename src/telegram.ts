import { Logger } from "./utils/logger";

export type TelegramApiResponse<T> =
  | { ok: true; result: T }
  | { ok: false; description: string; error_code?: number; parameters?: unknown };

export async function tgApi<T>(
  token: string,
  method: string,
  body: unknown,
): Promise<TelegramApiResponse<T>> {
  const url = `https://api.telegram.org/bot${token}/${method}`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body ?? {}),
    });

    const json = (await res.json()) as TelegramApiResponse<T>;

    // Telegram can return ok:false even with HTTP 200. We must log it, otherwise failures are silent.
    if (!res.ok) {
      Logger.error('API', `Telegram HTTP error method=${method} status=${res.status} statusText=${res.statusText}`);
    }
    if (!json.ok) {
      Logger.error('API', `Telegram API error method=${method} error_code=${json.error_code} description=${json.description}`);
    }
    return json;
  } catch (e: any) {
    Logger.error('API', `Telegram API request failed method=${method} error=${String(e?.message ?? e)}`);
    return { ok: false, description: "Telegram API request failed" };
  }
}

export async function tgSendMessage(params: {
  token: string;
  chat_id: number | string;
  text: string;
  reply_markup?: unknown;
  parse_mode?: "HTML" | "MarkdownV2";
}): Promise<void> {
  await tgApi(params.token, "sendMessage", {
    chat_id: params.chat_id,
    text: params.text,
    parse_mode: params.parse_mode,
    reply_markup: params.reply_markup,
  });
}

export async function tgEditMessageText(params: {
  token: string;
  chat_id: number | string;
  message_id: number;
  text: string;
  reply_markup?: unknown;
  parse_mode?: "HTML" | "MarkdownV2";
}): Promise<void> {
  await tgApi(params.token, "editMessageText", {
    chat_id: params.chat_id,
    message_id: params.message_id,
    text: params.text,
    parse_mode: params.parse_mode,
    reply_markup: params.reply_markup,
  });
}

export async function tgAnswerCallbackQuery(params: {
  token: string;
  callback_query_id: string;
  text?: string;
  show_alert?: boolean;
}): Promise<void> {
  await tgApi(params.token, "answerCallbackQuery", {
    callback_query_id: params.callback_query_id,
    text: params.text,
    show_alert: params.show_alert,
  });
}

export async function tgSendChatAction(params: {
  token: string;
  chat_id: number | string;
  action: "typing" | "upload_photo" | "record_video" | "upload_video" | "record_voice" | "upload_voice" | "upload_document" | "choose_sticker" | "find_location" | "record_video_note" | "upload_video_note";
}): Promise<void> {
  await tgApi(params.token, "sendChatAction", {
    chat_id: params.chat_id,
    action: params.action,
  });
}

export async function tgDeleteMessage(params: {
  token: string;
  chat_id: number | string;
  message_id: number;
}): Promise<void> {
  await tgApi(params.token, "deleteMessage", {
    chat_id: params.chat_id,
    message_id: params.message_id,
  });
}


