import type { Env } from "../config/env";
import { dbGet, dbRun, nowMs } from "./db";
import { encryptWithDek, unwrapDekWithKek, decryptWithDek } from "./crypto";

/**
 * Store encrypted OAuth credentials for an integration
 */
export async function storeIntegrationCredentials(
  env: Env,
  integrationId: string,
  credentials: {
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
  }
): Promise<void> {
  // Get the bot_project_id for this integration
  const integration = await env.DB.prepare(
    "SELECT bot_project_id FROM bot_integrations WHERE id = ?"
  )
    .bind(integrationId)
    .first<{ bot_project_id: string }>();

  if (!integration) {
    throw new Error("Integration not found");
  }

  const botProjectId = integration.bot_project_id;

  // Load the bot's DEK
  const keyRow = await dbGet<any>(
    env.DB,
    "SELECT dek_wrapped_b64, dek_wrap_iv_b64 FROM bot_keys WHERE bot_project_id = ?",
    [botProjectId],
  );
  if (!keyRow) throw new Error("Missing bot key");
  
  const dek = await unwrapDekWithKek({
    dekWrappedB64: String(keyRow.dek_wrapped_b64),
    dekWrapIvB64: String(keyRow.dek_wrap_iv_b64),
    kekBase64: env.KEK_MASTER_KEY,
  });

  // Encrypt the tokens
  const accessTokenEncrypted = await encryptWithDek({
    dekRaw: dek,
    plaintext: credentials.accessToken,
  });
  const refreshTokenEncrypted = credentials.refreshToken
    ? await encryptWithDek({
        dekRaw: dek,
        plaintext: credentials.refreshToken,
      })
    : null;

  // Update the integration record and mark as connected
  await dbRun(
    env.DB,
    `UPDATE bot_integrations 
     SET access_token_ciphertext_b64 = ?,
         access_token_iv_b64 = ?,
         refresh_token_ciphertext_b64 = ?,
         refresh_token_iv_b64 = ?,
         token_expires_at = ?,
         updated_at = ?
     WHERE id = ?`,
    [
      accessTokenEncrypted.ciphertextB64,
      accessTokenEncrypted.ivB64,
      refreshTokenEncrypted ? refreshTokenEncrypted.ciphertextB64 : null,
      refreshTokenEncrypted ? refreshTokenEncrypted.ivB64 : null,
      credentials.expiresAt,
      nowMs(),
      integrationId,
    ]
  );
}

/**
 * Exchange Google authorization code for tokens
 */
export async function exchangeGoogleCodeForTokens(
  env: Env,
  code: string,
  redirectUri: string
): Promise<{
  access_token: string;
  refresh_token?: string;
  expires_in: number;
}> {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID || "",
      client_secret: env.GOOGLE_CLIENT_SECRET || "",
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Token exchange failed: ${errorText}`);
  }

  return await response.json();
}

/**
 * Refresh an expired Google access token
 */
export async function refreshGoogleAccessToken(
  env: Env,
  refreshToken: string
): Promise<{
  access_token: string;
  expires_in: number;
}> {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: env.GOOGLE_CLIENT_ID || "",
      client_secret: env.GOOGLE_CLIENT_SECRET || "",
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Token refresh failed: ${errorText}`);
  }

  return await response.json();
}

/**
 * Create a Google Calendar event
 */
export async function createGoogleCalendarEvent(
  accessToken: string,
  event: {
    summary: string;
    description?: string;
    start: { dateTime: string; timeZone?: string };
    end: { dateTime: string; timeZone?: string };
    attendees?: Array<{ email: string }>;
  }
): Promise<any> {
  const response = await fetch(
    "https://www.googleapis.com/calendar/v3/calendars/primary/events",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(event),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to create calendar event: ${errorText}`);
  }

  return await response.json();
}

/**
 * Get Google Calendar free/busy information
 */
export async function getGoogleCalendarFreeBusy(
  accessToken: string,
  params: {
    timeMin: string;
    timeMax: string;
    items: Array<{ id: string }>;
  }
): Promise<any> {
  const response = await fetch(
    "https://www.googleapis.com/calendar/v3/freeBusy",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(params),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to fetch free/busy: ${errorText}`);
  }

  return await response.json();
}

/**
 * Execute an integration action (e.g., create calendar event)
 */
export async function executeIntegration(
  env: Env,
  integrationId: string,
  action: string,
  params: Record<string, unknown>
): Promise<any> {
  // Load integration details
  const integration = await env.DB.prepare(
    `SELECT id, integration_type, access_token_ciphertext_b64, access_token_iv_b64, 
            refresh_token_ciphertext_b64, refresh_token_iv_b64, token_expires_at, bot_project_id
     FROM bot_integrations 
     WHERE id = ? AND status = 'active'`
  )
    .bind(integrationId)
    .first<any>();

  if (!integration) {
    throw new Error("Integration not found or inactive");
  }

  // Check if token needs refresh
  let accessToken: string;
  const now = nowMs();
  
  // Load the bot's DEK
  const keyRow = await dbGet<any>(
    env.DB,
    "SELECT dek_wrapped_b64, dek_wrap_iv_b64 FROM bot_keys WHERE bot_project_id = ?",
    [integration.bot_project_id],
  );
  if (!keyRow) throw new Error("Missing bot key");
  
  const dek = await unwrapDekWithKek({
    dekWrappedB64: String(keyRow.dek_wrapped_b64),
    dekWrapIvB64: String(keyRow.dek_wrap_iv_b64),
    kekBase64: env.KEK_MASTER_KEY,
  });

  if (integration.token_expires_at && integration.token_expires_at < now + 60000) {
    // Refresh token if it expires in less than a minute
    if (!integration.refresh_token_ciphertext_b64) {
      throw new Error("Access token expired and no refresh token available");
    }

    const refreshToken = await decryptWithDek({
      dekRaw: dek,
      ciphertextB64: integration.refresh_token_ciphertext_b64,
      ivB64: integration.refresh_token_iv_b64,
    });

    const refreshed = await refreshGoogleAccessToken(env, refreshToken);
    
    // Update stored credentials
    await storeIntegrationCredentials(env, integrationId, {
      accessToken: refreshed.access_token,
      refreshToken: refreshToken, // keep existing refresh token
      expiresAt: now + (refreshed.expires_in * 1000),
    });

    accessToken = refreshed.access_token;
  } else {
    // Decrypt access token
    accessToken = await decryptWithDek({
      dekRaw: dek,
      ciphertextB64: integration.access_token_ciphertext_b64,
      ivB64: integration.access_token_iv_b64,
    });
  }

  // Execute action based on integration type
  if (integration.integration_type === "google_calendar") {
    if (action === "create_event") {
      return await createGoogleCalendarEvent(accessToken, params as any);
    }
    if (action === "get_freebusy") {
      return await getGoogleCalendarFreeBusy(accessToken, params as any);
    }
  }

  throw new Error(`Unknown action: ${action}`);
}
