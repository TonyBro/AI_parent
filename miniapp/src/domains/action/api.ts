import { apiFetch } from "../../shared/api/client";
import type { ActionDto, WorkingHourDto } from "./types";

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

// Working Hours (related to actions)
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
