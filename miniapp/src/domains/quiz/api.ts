import { apiFetch } from "../../shared/api/client";
import type { QuizSetDto, QuizItemDto, QuizOptionDto } from "./types";

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
