import { apiFetch } from "../../shared/api/client";
import type { CommandDto } from "./types";

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
