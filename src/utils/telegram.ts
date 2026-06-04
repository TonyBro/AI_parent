import { Logger } from "./logger";

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

export async function tgApiUpload<T>(
  token: string,
  method: string,
  formData: FormData,
): Promise<TelegramApiResponse<T>> {
  const url = `https://api.telegram.org/bot${token}/${method}`;
  try {
    const res = await fetch(url, {
      method: "POST",
      body: formData,
    });

    const json = (await res.json()) as TelegramApiResponse<T>;

    if (!res.ok) {
      Logger.error('API', `Telegram HTTP error (Upload) method=${method} status=${res.status} statusText=${res.statusText}`);
    }
    if (!json.ok) {
      Logger.error('API', `Telegram API error (Upload) method=${method} error_code=${json.error_code} description=${json.description}`);
    }
    return json;
  } catch (e: any) {
    Logger.error('API', `Telegram API upload request failed method=${method} error=${String(e?.message ?? e)}`);
    return { ok: false, description: "Telegram API upload request failed" };
  }
}

export async function tgSendMessage(params: {
  token: string;
  chat_id: number | string;
  text: string;
  reply_markup?: unknown;
  parse_mode?: "HTML" | "MarkdownV2";
  reply_parameters?: { message_id: number };
}): Promise<TelegramApiResponse<{ message_id: number }>> {
  return await tgApi(params.token, "sendMessage", {
    chat_id: params.chat_id,
    text: params.text,
    parse_mode: params.parse_mode,
    reply_markup: params.reply_markup,
    reply_parameters: params.reply_parameters,
  });
}

export async function tgSendMessageDraft(params: {
  token: string;
  chat_id: number | string;
  draft_id: number;
  text: string;
  message_thread_id?: number;
  parse_mode?: "HTML" | "MarkdownV2";
  reply_parameters?: { message_id: number };
}): Promise<TelegramApiResponse<any>> {
  return await tgApi(params.token, "sendMessageDraft", {
    chat_id: params.chat_id,
    draft_id: params.draft_id,
    text: params.text,
    message_thread_id: params.message_thread_id,
    parse_mode: params.parse_mode,
    reply_parameters: params.reply_parameters,
  });
}

export async function tgGetMe(token: string): Promise<TelegramApiResponse<{ has_topics_enabled?: boolean }>> {
  return await tgApi(token, "getMe", {});
}

export async function tgEditMessageText(params: {
  token: string;
  chat_id: number | string;
  message_id: number;
  text: string;
  parse_mode?: "HTML" | "MarkdownV2";
  reply_markup?: unknown;
}): Promise<TelegramApiResponse<any>> {
  return await tgApi(params.token, "editMessageText", {
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

export async function tgSendPhoto(params: {
  token: string;
  chat_id: number | string;
  photo: string | Blob;
  caption?: string;
  reply_markup?: unknown;
  parse_mode?: "HTML" | "MarkdownV2";
}): Promise<TelegramApiResponse<any>> {
  if (typeof params.photo === "string") {
    return await tgApi(params.token, "sendPhoto", {
      chat_id: params.chat_id,
      photo: params.photo,
      caption: params.caption,
      parse_mode: params.parse_mode,
      reply_markup: params.reply_markup,
    });
  } else {
    const formData = new FormData();
    formData.append("chat_id", String(params.chat_id));
    formData.append("photo", params.photo, "photo.jpg");
    if (params.caption) formData.append("caption", params.caption);
    if (params.parse_mode) formData.append("parse_mode", params.parse_mode);
    if (params.reply_markup) formData.append("reply_markup", JSON.stringify(params.reply_markup));
    return await tgApiUpload(params.token, "sendPhoto", formData);
  }
}


