import { Hono } from "hono";
import { Env } from "../../../config/env";
import { dbGet, dbAll, dbRun, nowMs } from "../../../utils/db";
import { kvPutJson } from "../../../utils/kv";

export const integrationRoutes = new Hono<{ Bindings: Env; Variables: { userId: string } }>();

integrationRoutes.get("/:botId/integrations", async (c) => {
  const userId = c.get("userId");
  const botId = c.req.param("botId");

  const bot = await dbGet<any>(
    c.env.DB,
    "SELECT id FROM bot_projects WHERE id = ? AND owner_user_id = ? AND deleted_at IS NULL",
    [botId, userId],
  );
  if (!bot) return c.json({ error: "not_found" }, 404);

  const integrations = await dbAll<any>(
    c.env.DB,
    "SELECT id, bot_project_id, integration_type, display_name, status, access_token_ciphertext_b64, token_expires_at, settings_json, created_at, updated_at FROM bot_integrations WHERE bot_project_id = ? ORDER BY created_at ASC",
    [botId],
  );

  return c.json({
    integrations: integrations.map((int) => {
      // For OAuth integrations, check if access token exists
      // For custom_api, check if settings are configured with a valid API URL
      let isConnected = false;
      if (int.integration_type === 'custom_api') {
        if (int.settings_json && int.settings_json !== '{}' && int.settings_json !== 'null') {
          try {
            const settings = JSON.parse(String(int.settings_json));
            // Check if apiUrl exists and is not empty
            isConnected = Boolean(settings.apiUrl && settings.apiUrl.trim() !== '');
          } catch (e) {
            isConnected = false;
          }
        }
      } else {
        isConnected = Boolean(int.access_token_ciphertext_b64);
      }
      
      return {
        id: String(int.id),
        bot_project_id: String(int.bot_project_id),
        integration_type: String(int.integration_type),
        display_name: String(int.display_name),
        status: String(int.status),
        is_connected: isConnected,
        token_expires_at: int.token_expires_at ? Number(int.token_expires_at) : null,
        settings: int.settings_json ? JSON.parse(String(int.settings_json)) : {},
        created_at: Number(int.created_at),
        updated_at: Number(int.updated_at),
      };
    }),
  });
});

integrationRoutes.post("/:botId/integrations", async (c) => {
  const userId = c.get("userId");
  const botId = c.req.param("botId");
  const body = await c.req.json();

  const bot = await dbGet<any>(
    c.env.DB,
    "SELECT id FROM bot_projects WHERE id = ? AND owner_user_id = ? AND deleted_at IS NULL",
    [botId, userId],
  );
  if (!bot) return c.json({ error: "not_found" }, 404);

  const integrationType = typeof body.integration_type === "string" ? body.integration_type.trim() : "";
  const displayName = typeof body.display_name === "string" ? body.display_name.trim() : "";

  if (!integrationType) return c.json({ error: "bad_request", reason: "integration_type_required" }, 400);
  if (!displayName) return c.json({ error: "bad_request", reason: "display_name_required" }, 400);

  const validTypes = ["google_calendar", "custom_api"];
  if (!validTypes.includes(integrationType)) {
    return c.json({ error: "bad_request", reason: "invalid_integration_type" }, 400);
  }

  const id = crypto.randomUUID();
  const now = nowMs();

  await dbRun(
    c.env.DB,
    "INSERT INTO bot_integrations (id, bot_project_id, integration_type, display_name, status, created_at, updated_at) VALUES (?, ?, ?, ?, 'active', ?, ?)",
    [id, botId, integrationType, displayName, now, now]
  );

  return c.json({ ok: true, id });
});

integrationRoutes.get("/:botId/integrations/:integrationId/oauth-url", async (c) => {
  const userId = c.get("userId");
  const botId = c.req.param("botId");
  const integrationId = c.req.param("integrationId");

  const integration = await dbGet<any>(
    c.env.DB,
    `SELECT bi.id, bi.integration_type, bi.bot_project_id
     FROM bot_integrations bi
     JOIN bot_projects bp ON bp.id = bi.bot_project_id
     WHERE bi.id = ? AND bi.bot_project_id = ? AND bp.owner_user_id = ? AND bp.deleted_at IS NULL
     LIMIT 1`,
    [integrationId, botId, userId],
  );
  
  if (!integration) return c.json({ error: "not_found" }, 404);

  if (String(integration.integration_type) === "google_calendar") {
    const clientId = c.env.GOOGLE_CLIENT_ID || "";
    if (!clientId) {
      return c.json({ error: "integration_not_configured", reason: "Google OAuth credentials are not set up." }, 500);
    }
    
    const state = crypto.randomUUID();
    await kvPutJson(c.env.KV, `oauth:state:${state}`, {
      botId,
      integrationId,
      creatorUserId: userId,
      timestamp: nowMs(),
    }, 600);

    const redirectUri = `${c.env.PUBLIC_BASE_URL}/oauth/google-calendar/callback`;
    const scope = "https://www.googleapis.com/auth/calendar";
    
    const oauthUrl = `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope,
      state,
      access_type: "offline",
      prompt: "consent",
    })}`;
    
    return c.json({ ok: true, url: oauthUrl });
  }

  return c.json({ error: "not_supported" }, 400);
});

integrationRoutes.patch("/:botId/integrations/:integrationId", async (c) => {
  const userId = c.get("userId");
  const botId = c.req.param("botId");
  const integrationId = c.req.param("integrationId");
  const body = await c.req.json();

  const integration = await dbGet<any>(
    c.env.DB,
    `SELECT bi.id
     FROM bot_integrations bi
     JOIN bot_projects bp ON bp.id = bi.bot_project_id
     WHERE bi.id = ? AND bi.bot_project_id = ? AND bp.owner_user_id = ? AND bp.deleted_at IS NULL
     LIMIT 1`,
    [integrationId, botId, userId],
  );
  if (!integration) return c.json({ error: "not_found" }, 404);

  const fields: string[] = [];
  const binds: any[] = [];

  if (typeof body.display_name === "string") {
    fields.push("display_name = ?");
    binds.push(body.display_name.trim());
  }
  if (typeof body.status === "string") {
    fields.push("status = ?");
    binds.push(body.status);
  }
  if (body.settings !== undefined && typeof body.settings === "object") {
    fields.push("settings_json = ?");
    binds.push(JSON.stringify(body.settings));
  }
  // Note: is_connected is computed, not stored in the database

  if (!fields.length) return c.json({ ok: true });

  fields.push("updated_at = ?");
  binds.push(nowMs());
  binds.push(integrationId);

  await dbRun(c.env.DB, `UPDATE bot_integrations SET ${fields.join(", ")} WHERE id = ?`, binds);
  return c.json({ ok: true });
});

integrationRoutes.delete("/:botId/integrations/:integrationId", async (c) => {
  const userId = c.get("userId");
  const botId = c.req.param("botId");
  const integrationId = c.req.param("integrationId");

  const integration = await dbGet<any>(
    c.env.DB,
    `SELECT bi.id
     FROM bot_integrations bi
     JOIN bot_projects bp ON bp.id = bi.bot_project_id
     WHERE bi.id = ? AND bi.bot_project_id = ? AND bp.owner_user_id = ? AND bp.deleted_at IS NULL
     LIMIT 1`,
    [integrationId, botId, userId],
  );
  if (!integration) return c.json({ error: "not_found" }, 404);

  // Clear integration references in bot_commands
  await dbRun(c.env.DB, "UPDATE bot_commands SET integration_id = NULL WHERE integration_id = ?", [integrationId]);
  
  // Clear integration references in scheduled_broadcasts
  await dbRun(c.env.DB, "UPDATE scheduled_broadcasts SET integration_id = NULL WHERE integration_id = ?", [integrationId]);
  
  // Delete the integration
  await dbRun(c.env.DB, "DELETE FROM bot_integrations WHERE id = ?", [integrationId]);

  return c.json({ ok: true });
});

// Test API integration
integrationRoutes.post("/:botId/integrations/test-api", async (c) => {
  const userId = c.get("userId");
  const botId = c.req.param("botId");
  const body = await c.req.json();

  const bot = await dbGet<any>(
    c.env.DB,
    "SELECT id FROM bot_projects WHERE id = ? AND owner_user_id = ? AND deleted_at IS NULL",
    [botId, userId],
  );
  if (!bot) return c.json({ error: "not_found" }, 404);

  const { apiUrl, httpMethod, authType, authToken, requestBody } = body;

  // Validation
  if (!apiUrl || typeof apiUrl !== "string") {
    return c.json({ ok: false, error: "API URL is required", status: 0 }, 200);
  }

  if (!apiUrl.startsWith("http://") && !apiUrl.startsWith("https://")) {
    return c.json({ ok: false, error: "Invalid URL format", status: 0 }, 200);
  }

  if ((authType === "bearer" || authType === "api_key") && !authToken) {
    return c.json({ ok: false, error: "Token is required when authentication is selected", status: 0 }, 200);
  }

  if (httpMethod === "POST" && requestBody) {
    try {
      JSON.parse(requestBody);
    } catch (e) {
      return c.json({ ok: false, error: "Request body must be valid JSON", status: 0 }, 200);
    }
  }

  // Test the API
  try {
    const { executeCustomApiIntegration } = await import("../../../integrations");
    await executeCustomApiIntegration(c.env, {
      apiUrl,
      httpMethod: httpMethod || "GET",
      authType: authType || "none",
      authToken,
      requestBody,
    }, 10000);

    return c.json({ ok: true, status: 200, message: "API test successful" });
  } catch (e: any) {
    let errorMessage = e.message || "Unknown error";
    if (errorMessage.includes("timeout")) {
      errorMessage = "Connection timeout";
    } else if (errorMessage.includes("401")) {
      errorMessage = "Invalid authentication";
    } else if (errorMessage.includes("404")) {
      errorMessage = "API endpoint not found";
    } else if (errorMessage.includes("500")) {
      errorMessage = "API server error";
    } else if (errorMessage.includes("fetch")) {
      errorMessage = "Connection failed";
    }
    return c.json({ ok: false, error: errorMessage, status: 0 }, 200);
  }
});
