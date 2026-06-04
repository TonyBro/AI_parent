import { apiFetch } from "../../shared/api/client";
import type { BroadcastSettings } from "./types";

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
