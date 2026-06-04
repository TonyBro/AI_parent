import type { Env } from "./config/env";
import { dbGet, dbRun, nowMs } from "./utils/db";
import { encryptWithDek, unwrapDekWithKek, decryptWithDek } from "./utils/crypto";
import { Logger } from "./utils/logger";

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
 * Execute a custom API integration call through Durable Object proxy
 * This ensures rate limiting and caching across all requests
 */
export async function executeCustomApiIntegration(
  env: Env,
  settings: {
    apiUrl: string;
    httpMethod: "GET" | "POST";
    authType?: "none" | "bearer" | "api_key";
    authToken?: string;
    requestBody?: string;
  },
  timeout = 10000
): Promise<any> {
  const { apiUrl, httpMethod, authType, authToken, requestBody } = settings;

  Logger.info("INTEGRATION", `[executeCustomApiIntegration] Starting API call via Durable Object`, {
    url: apiUrl,
    method: httpMethod,
    authType: authType || "none",
    hasAuthToken: !!authToken,
    hasRequestBody: !!requestBody,
    requestBodyLength: requestBody ? requestBody.length : 0,
    timeout: `${timeout}ms`
  });

  // Build headers with browser-like User-Agent to avoid bot detection
  const headers: Record<string, string> = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "*/*",
    "Accept-Language": "en-US,en;q=0.9",
  };

  // Only set Content-Type for POST requests with body
  if (httpMethod === "POST" && requestBody) {
    headers["Content-Type"] = "application/json";
  }

  if (authType === "bearer" && authToken) {
    headers["Authorization"] = `Bearer ${authToken}`;
    Logger.debug("INTEGRATION", `[executeCustomApiIntegration] Using Bearer auth`);
  } else if (authType === "api_key" && authToken) {
    headers["X-API-Key"] = authToken;
    Logger.debug("INTEGRATION", `[executeCustomApiIntegration] Using API Key auth`);
  }

  // Create cache key based on URL and method (for GET requests)
  const cacheKey = httpMethod === "GET" ? `${httpMethod}:${apiUrl}` : undefined;

  try {
    // Get Durable Object stub - use a consistent ID for the API proxy
    const doId = env.API_PROXY.idFromName("api-proxy-singleton");
    const stub = env.API_PROXY.get(doId);

    // Call the Durable Object proxy
    const startTime = Date.now();
    const response = await stub.fetch("https://api-proxy/proxy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        apiUrl,
        httpMethod,
        headers,
        requestBody,
        timeout,
        cacheKey,
        cacheTTL: 60, // Cache for 60 seconds
      }),
    });

    const duration = Date.now() - startTime;
    const cacheStatus = response.headers.get("X-Cache") || "UNKNOWN";

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: "Unknown error" }));
      Logger.error("INTEGRATION", `[executeCustomApiIntegration] Durable Object proxy error`, {
        url: apiUrl,
        status: response.status,
        duration: `${duration}ms`,
        error: errorData,
      });
      throw new Error(`API error: ${response.status} - ${JSON.stringify(errorData)}`);
    }

    Logger.info("INTEGRATION", `[executeCustomApiIntegration] Response received via Durable Object`, {
      url: apiUrl,
      duration: `${duration}ms`,
      cacheStatus,
    });

    const textData = await response.text();

    // Try to parse as JSON
    try {
      const jsonData = JSON.parse(textData);
      Logger.info("INTEGRATION", `[executeCustomApiIntegration] Successfully parsed JSON response`, {
        url: apiUrl,
        dataType: typeof jsonData,
        isArray: Array.isArray(jsonData),
        keys: typeof jsonData === 'object' && jsonData !== null ? Object.keys(jsonData).slice(0, 10) : []
      });
      return jsonData;
    } catch (e) {
      Logger.debug("INTEGRATION", `[executeCustomApiIntegration] Response is not JSON`, {
        url: apiUrl,
      });
      
      // Check content type from original response
      const contentType = response.headers.get("content-type") || "";
      if (contentType.includes("xml") || contentType.includes("rss")) {
        return { data: textData, type: "xml" };
      }
      return { data: textData, type: "text" };
    }
  } catch (error: any) {
    Logger.error("INTEGRATION", `[executeCustomApiIntegration] Request failed`, {
      url: apiUrl,
      method: httpMethod,
      error: error.message,
      errorType: error.name
    });
    throw error;
  }
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
            refresh_token_ciphertext_b64, refresh_token_iv_b64, token_expires_at, bot_project_id, settings_json
     FROM bot_integrations 
     WHERE id = ? AND status = 'active'`
  )
    .bind(integrationId)
    .first<any>();

  if (!integration) {
    throw new Error("Integration not found or inactive");
  }

  // Handle custom API integration
  if (integration.integration_type === "custom_api") {
    const settings = integration.settings_json ? JSON.parse(String(integration.settings_json)) : {};
    const quizAnswers = params.quizAnswers as Array<any> || [];
    
    // Use DynamicUrlBuilderService to construct the final URL/body
    const { DynamicUrlBuilderService } = await import('./services/dynamic-url-builder.service');
    const { finalUrl, requestBody } = await DynamicUrlBuilderService.buildApiRequest({
      env,
      baseUrl: settings.apiUrl,
      httpMethod: settings.httpMethod || "GET",
      dynamicParams: settings.dynamicParams || null,
      quizAnswers
    });
    
    // Execute with the constructed URL/body through Durable Object
    return await executeCustomApiIntegration(env, {
      apiUrl: finalUrl,
      httpMethod: settings.httpMethod || "GET",
      authType: settings.authType,
      authToken: settings.authToken,
      requestBody: requestBody
    });
  }

  // Check if token needs refresh (for OAuth integrations)
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
