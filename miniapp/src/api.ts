export type BotDto = {
  id: string;
  status: "active" | "disabled" | string;
  bot_username: string;
  default_language: string;
  name: string;
  description: string;
  type?: string;
  bot_token?: string;
};

function getInitData(): string | null {
  // Telegram Mini App: prefer real initData, but allow local dev by passing
  // ?tma=<initData> or ?initData=<initData>, or storing it in localStorage.
  const fromTg = window.Telegram?.WebApp?.initData || null;
  if (fromTg) return fromTg;
  try {
    const url = new URL(window.location.href);
    const fromQuery = url.searchParams.get("tma") || url.searchParams.get("initData");
    if (fromQuery) {
      localStorage.setItem("tma_initData", fromQuery);
      return fromQuery;
    }
    const fromStore = localStorage.getItem("tma_initData");
    return fromStore || null;
  } catch {
    return null;
  }
}

async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const initData = getInitData();
  if (!initData) throw new Error("miniapp.error_missing_init_data");

  const headers: Record<string, string> = {
    ...(init.headers as any || {}),
    authorization: `tma ${initData}`,
  };

  if (!(init.body instanceof FormData)) {
    headers["content-type"] = "application/json";
  }

  const res = await fetch(path, {
    ...init,
    headers,
  });

  // Parse response as JSON
  const json = (await res.json().catch(() => ({}))) as any;
  
  if (!res.ok) {
    const errorMsg = json?.description || json?.reason || json?.error || `HTTP ${res.status}`;
    throw new Error(errorMsg);
  }
  return json as T;
}

export async function getMyBot(): Promise<BotDto | null> {
  const data = await apiFetch<{ bot: BotDto | null }>("/api/me/bot");
  return data.bot ?? null;
}

export async function getMyBots(): Promise<BotDto[]> {
  const data = await apiFetch<{ bots: BotDto[] }>("/api/me/bots");
  return data.bots ?? [];
}

export async function patchBot(botId: string, patch: Partial<BotDto>): Promise<void> {
  await apiFetch(`/api/bots/${botId}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export async function deleteBot(botId: string): Promise<void> {
  await apiFetch(`/api/bots/${botId}`, {
    method: "DELETE",
  });
}

export type QuizOptionDto = { key: string; label: string; profile_patch: Record<string, unknown> };
export type QuizItemDto = {
  id: string;
  quiz_set_id: string;
  position: number;
  question: string;
  options: QuizOptionDto[];
  created_at: number;
};
export type QuizSetDto = {
  id: string;
  bot_project_id: string;
  title: string;
  language: string;
  created_at: number;
  items: QuizItemDto[];
};

export async function getQuizSets(botId: string): Promise<QuizSetDto[]> {
  const data = await apiFetch<{ quiz_sets: QuizSetDto[] }>(`/api/bots/${botId}/quiz_sets`);
  return data.quiz_sets ?? [];
}

export async function generateQuizWithAI(
  botId: string,
  payload: { count: number; theme: string; data_to_collect: string; language?: string },
): Promise<{ id: string }> {
  const data = await apiFetch<{ ok: true; id: string }>(`/api/bots/${botId}/quiz_sets/generate`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return { id: data.id };
}

export async function patchQuizSet(
  botId: string,
  quizSetId: string,
  patch: Partial<Pick<QuizSetDto, "title" | "language">>,
): Promise<void> {
  await apiFetch(`/api/bots/${botId}/quiz_sets/${quizSetId}`, { method: "PATCH", body: JSON.stringify(patch) });
}

export async function deleteQuizSet(botId: string, quizSetId: string): Promise<void> {
  await apiFetch(`/api/bots/${botId}/quiz_sets/${quizSetId}`, { method: "DELETE" });
}

export async function createQuizItem(
  botId: string,
  quizSetId: string,
  payload: { question: string; options: QuizOptionDto[] },
): Promise<{ id: string }> {
  const data = await apiFetch<{ ok: true; id: string }>(`/api/bots/${botId}/quiz_sets/${quizSetId}/items`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return { id: data.id };
}

export async function reorderQuizItems(botId: string, quizSetId: string, itemIds: string[]): Promise<void> {
  await apiFetch(`/api/bots/${botId}/quiz_sets/${quizSetId}/items_order`, {
    method: "PUT",
    body: JSON.stringify({ item_ids: itemIds }),
  });
}

export async function patchQuizItem(
  botId: string,
  quizItemId: string,
  patch: Partial<Pick<QuizItemDto, "question" | "options" | "position">>,
): Promise<void> {
  await apiFetch(`/api/bots/${botId}/quiz_items/${quizItemId}`, { method: "PATCH", body: JSON.stringify(patch) });
}

export async function deleteQuizItem(botId: string, quizItemId: string): Promise<void> {
  await apiFetch(`/api/bots/${botId}/quiz_items/${quizItemId}`, { method: "DELETE" });
}

export async function createBot(payload: {
  bot_token: string;
  bot_prompt: string;
  default_language: string;
  type?: string;
  website_urls?: string[];
  business_context?: string;
}): Promise<{ bot: BotDto }> {
  const data = await apiFetch<{ ok: true; bot: BotDto }>("/api/me/bots", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return { bot: data.bot };
}

export async function uploadBotPhoto(botId: string, file: File): Promise<void> {
  const formData = new FormData();
  formData.append("photo", file);
  await apiFetch(`/api/bots/${botId}/photo`, {
    method: "POST",
    body: formData,
  });
}

export async function analyzeBusiness(payload: {
  urls: string[];
  language: string;
}): Promise<{
  ok: true;
  name: string;
  description: string;
  business_context: string;
}> {
  return await apiFetch<{
    ok: true;
    name: string;
    description: string;
    business_context: string;
  }>("/api/me/analyze-business", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export type BroadcastSettings = {
  id?: string;
  enabled: boolean;
  use_quiz_results: boolean;
  quiz_set_ids?: string[];
  pre_prompt: string;
  send_time_hour: number;
  sentence_count: number;
  integration_id?: string | null;
};

export async function getBroadcastSettings(botId: string): Promise<BroadcastSettings[]> {
  const data = await apiFetch<{ broadcasts: BroadcastSettings[] }>(`/api/bots/${botId}/broadcast`);
  return data.broadcasts;
}

export async function createBroadcastSettings(botId: string, settings: BroadcastSettings): Promise<{ id: string }> {
  const data = await apiFetch<{ ok: true; id: string }>(`/api/bots/${botId}/broadcast`, {
    method: "POST",
    body: JSON.stringify(settings),
  });
  return data;
}

export async function patchBroadcastSettings(botId: string, broadcastId: string, settings: Partial<BroadcastSettings>): Promise<void> {
  await apiFetch(`/api/bots/${botId}/broadcast/${broadcastId}`, {
    method: "PATCH",
    body: JSON.stringify(settings),
  });
}

export async function deleteBroadcastSettings(botId: string, broadcastId: string): Promise<void> {
  await apiFetch(`/api/bots/${botId}/broadcast/${broadcastId}`, {
    method: "DELETE",
  });
}

export async function sendBroadcastNow(
  botId: string,
  payload: {
    type: "regular" | "ai" | "quiz";
    message?: string;
    prompt?: string;
    quiz_set_ids?: string[];
    quiz_set_id?: string;
    sentence_count?: number;
    integration_id?: string | null;
  },
): Promise<{ ok: true; sent_count: number; failed_count: number }> {
  return await apiFetch<{ ok: true; sent_count: number; failed_count: number }>(`/api/bots/${botId}/broadcast/now`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

// Commands
export type CommandDto = {
  id: string;
  bot_project_id: string;
  command: string;
  description: string;
  show_in_menu: boolean;
  integration_id: string | null;
  ai_instructions: string | null;
  quiz_set_ids: string[];
  created_at: number;
  updated_at: number;
};

export async function getCommands(botId: string): Promise<CommandDto[]> {
  const data = await apiFetch<{ commands: CommandDto[] }>(`/api/bots/${botId}/commands`);
  return data.commands ?? [];
}

export async function createCommand(
  botId: string,
  payload: {
    command: string;
    description: string;
    show_in_menu?: boolean;
    integration_id?: string | null;
    ai_instructions?: string | null;
    quiz_set_ids?: string[];
  },
): Promise<{ id: string }> {
  const data = await apiFetch<{ ok: true; id: string }>(`/api/bots/${botId}/commands`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return { id: data.id };
}

export async function patchCommand(
  botId: string,
  commandId: string,
  patch: Partial<Omit<CommandDto, "id" | "bot_project_id" | "created_at" | "updated_at">>,
): Promise<void> {
  await apiFetch(`/api/bots/${botId}/commands/${commandId}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export async function deleteCommand(botId: string, commandId: string): Promise<void> {
  await apiFetch(`/api/bots/${botId}/commands/${commandId}`, { method: "DELETE" });
}

// Integrations
export type IntegrationDto = {
  id: string;
  bot_project_id: string;
  integration_type: string;
  display_name: string;
  status: string;
  is_connected: boolean;
  token_expires_at: number | null;
  settings: Record<string, unknown>;
  created_at: number;
  updated_at: number;
};

export async function getIntegrations(botId: string): Promise<IntegrationDto[]> {
  const data = await apiFetch<{ integrations: IntegrationDto[] }>(`/api/bots/${botId}/integrations`);
  return data.integrations ?? [];
}

export async function createIntegration(
  botId: string,
  payload: {
    integration_type: string;
    display_name: string;
  },
): Promise<{ id: string }> {
  const data = await apiFetch<{ ok: true; id: string }>(`/api/bots/${botId}/integrations`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return { id: data.id };
}

export async function getIntegrationOAuthUrl(botId: string, integrationId: string): Promise<{ url: string }> {
  // Add timestamp to prevent caching issues
  const url = `/api/bots/${botId}/integrations/${integrationId}/oauth-url?_t=${Date.now()}`;
  const data = await apiFetch<{ ok: true; url: string }>(url);
  return { url: data.url };
}

export async function patchIntegration(
  botId: string,
  integrationId: string,
  patch: Partial<Pick<IntegrationDto, "display_name" | "status" | "settings">>,
): Promise<void> {
  await apiFetch(`/api/bots/${botId}/integrations/${integrationId}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export async function deleteIntegration(botId: string, integrationId: string): Promise<void> {
  await apiFetch(`/api/bots/${botId}/integrations/${integrationId}`, { method: "DELETE" });
}

export async function testApiIntegration(
  botId: string,
  settings: {
    apiUrl: string;
    httpMethod: "GET" | "POST";
    authType: "none" | "bearer" | "api_key";
    authToken?: string;
    requestBody?: string;
  }
): Promise<{ ok: boolean; status: number; message?: string; error?: string }> {
  const data = await apiFetch<{ ok: boolean; status: number; message?: string; error?: string }>(
    `/api/bots/${botId}/integrations/test-api`,
    {
      method: "POST",
      body: JSON.stringify(settings),
    }
  );
  return data;
}

// Working Hours
export type WorkingHourDto = {
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_enabled: boolean;
};

export async function getWorkingHours(botId: string): Promise<WorkingHourDto[]> {
  const data = await apiFetch<{ working_hours: WorkingHourDto[] }>(`/api/bots/${botId}/working-hours`);
  return data.working_hours ?? [];
}

export async function patchWorkingHours(botId: string, hours: WorkingHourDto[]): Promise<void> {
  await apiFetch(`/api/bots/${botId}/working-hours`, {
    method: "POST",
    body: JSON.stringify({ working_hours: hours }),
  });
}

// Actions
export type ActionDto = {
  id: string;
  bot_project_id: string;
  type: string;
  settings: Record<string, unknown>;
  status: string;
  created_at: number;
  updated_at: number;
};

export async function getActions(botId: string): Promise<ActionDto[]> {
  const data = await apiFetch<{ actions: ActionDto[] }>(`/api/bots/${botId}/actions`);
  return data.actions ?? [];
}

export async function createAction(
  botId: string,
  payload: {
    type: string;
    settings?: Record<string, unknown>;
  },
): Promise<{ id: string }> {
  const data = await apiFetch<{ ok: true; id: string }>(`/api/bots/${botId}/actions`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return { id: data.id };
}

export async function patchAction(
  botId: string,
  actionId: string,
  patch: Partial<Pick<ActionDto, "settings" | "status">>,
): Promise<void> {
  await apiFetch(`/api/bots/${botId}/actions/${actionId}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export async function deleteAction(botId: string, actionId: string): Promise<void> {
  await apiFetch(`/api/bots/${botId}/actions/${actionId}`, { method: "DELETE" });
}


