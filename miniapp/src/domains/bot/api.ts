import { apiFetch } from "../../shared/api/client";
import type { BotDto } from "./types";

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

export async function analyzePrompt(payload: {
  prompt: string;
  business_context?: string;
  language: string;
}): Promise<{
  ok: true;
  config: {
    name: string;
    description: string;
    business_context: string;
    commands: Array<{
      command: string;
      description: string;
      ai_instructions: string;
      integrationDisplayName?: string;
    }>;
    quizzes?: Array<{
      title: string;
      items: Array<{
        question: string;
        options: Array<{ key: string; label: string }>;
      }>;
    }>;
    apiIntegrations?: Array<{
      displayName: string;
      apiUrl: string;
      httpMethod: "GET" | "POST";
      authType: "none" | "bearer" | "api_key";
      aiPrompt: string;
      dynamicParams?: string;
    }>;
    scheduledBroadcasts?: Array<{
      sendTimeHour: number;
      prePrompt: string;
      integrationDisplayName?: string;
      sentenceCount?: number;
    }>;
  };
}> {
  return await apiFetch<{
    ok: true;
    config: {
      name: string;
      description: string;
      business_context: string;
      commands: Array<{
        command: string;
        description: string;
        ai_instructions: string;
        integrationDisplayName?: string;
      }>;
      quizzes?: Array<{
        title: string;
        items: Array<{
          question: string;
          options: Array<{ key: string; label: string }>;
        }>;
      }>;
      apiIntegrations?: Array<{
        displayName: string;
        apiUrl: string;
        httpMethod: "GET" | "POST";
        authType: "none" | "bearer" | "api_key";
        aiPrompt: string;
      }>;
      scheduledBroadcasts?: Array<{
        sendTimeHour: number;
        prePrompt: string;
        integrationDisplayName?: string;
        sentenceCount?: number;
      }>;
    };
  }>("/api/ai/analyze-prompt", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function storeTemplate(payload: {
  originalPrompt: string;
  language: string;
  config: any;
}): Promise<{ ok: true }> {
  return await apiFetch<{ ok: true }>("/api/ai/bot-template", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function clearTemplate(): Promise<{ ok: true }> {
  return await apiFetch<{ ok: true }>("/api/ai/bot-template", {
    method: "DELETE",
  });
}
