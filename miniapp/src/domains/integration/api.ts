import { apiFetch } from "../../shared/api/client";
import type { IntegrationDto } from "./types";

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
