import { Env } from "../config/env";
import { BotConfig } from "../types";
import { dbGet, dbRun, nowMs } from "../utils/db";
import { AIService } from "./ai.service";
import { openaiChat } from "../utils/openai";
import { tgSendMessage } from "../utils/telegram";
import { executeIntegration, exchangeGoogleCodeForTokens, storeIntegrationCredentials } from "../integrations";
import { kvGetJson } from "../utils/kv";

export class IntegrationService {
  static async handleGoogleOAuthCallback(env: Env, req: Request): Promise<Response> {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const error = url.searchParams.get("error");

    if (error) {
      return new Response(`<h1>Authentication Error</h1><p>${error}</p>`, {
        headers: { "Content-Type": "text/html" },
      });
    }

    if (!code || !state) {
      return new Response("<h1>Invalid Request</h1>", { status: 400, headers: { "Content-Type": "text/html" } });
    }

    // Validate state
    const stateData = await kvGetJson<{
      botId: string;
      integrationId: string;
      creatorUserId: string;
    }>(env.KV, `oauth:state:${state}`);

    if (!stateData) {
      return new Response("<h1>Session Expired</h1><p>Please try again from the app.</p>", {
        status: 400,
        headers: { "Content-Type": "text/html" },
      });
    }

    // Clean up state
    await env.KV.delete(`oauth:state:${state}`);

    try {
      const redirectUri = `${env.PUBLIC_BASE_URL}/oauth/google-calendar/callback`;
      const tokens = await exchangeGoogleCodeForTokens(env, code, redirectUri);

      await storeIntegrationCredentials(env, stateData.integrationId, {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token || "",
        expiresAt: nowMs() + (tokens.expires_in * 1000),
      });

      return new Response(
        `<html>
          <body style="font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #f4f7f9;">
            <div style="background: white; padding: 40px; border-radius: 16px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); text-align: center; max-width: 400px;">
              <div style="font-size: 48px; margin-bottom: 20px;">✅</div>
              <h1 style="margin: 0 0 10px; color: #1a1a1a;">Connected!</h1>
              <p style="color: #666; line-height: 1.5; margin-bottom: 25px;">Google Calendar has been successfully linked to your bot. You can now close this window and return to the app.</p>
              <button onclick="window.close()" style="background: #2481cc; color: white; border: none; padding: 12px 24px; border-radius: 8px; font-weight: bold; cursor: pointer;">Close Window</button>
            </div>
            <script>
              // Try to close automatically if opened as popup
              setTimeout(() => {
                try { window.close(); } catch(e) {}
              }, 3000);
            </script>
          </body>
        </html>`,
        { headers: { "Content-Type": "text/html" } }
      );
    } catch (e: any) {
      console.error("OAuth Callback Error:", e);
      return new Response(`<h1>Connection Failed</h1><p>${e.message}</p>`, {
        status: 500,
        headers: { "Content-Type": "text/html" },
      });
    }
  }

  static async handleCommandWithIntegration(params: {
    env: Env;
    cfg: BotConfig;
    token: string;
    chatId: string;
    userId: string;
    command: string;
    integrationId: string;
    userMessage: string;
    i18n: any;
  }): Promise<void> {
    const { env, cfg, token, chatId, command, integrationId, userMessage, i18n } = params;

    const integration = await dbGet<any>(
      env.DB,
      "SELECT integration_type, display_name FROM bot_integrations WHERE id = ? AND bot_project_id = ?",
      [integrationId, cfg.botProjectId],
    );

    if (!integration) {
      await tgSendMessage({ token, chat_id: chatId, text: i18n.t("child.integration_not_found") });
      return;
    }

    if (String(integration.integration_type) === "google_calendar") {
      const commandDetails = await dbGet<any>(
        env.DB,
        "SELECT ai_instructions FROM bot_commands WHERE bot_project_id = ? AND command = ?",
        [cfg.botProjectId, command],
      );

      const aiInstructions = commandDetails?.ai_instructions || "Extract appointment details from the user's message and create a calendar event.";
      const extractionPrompt = `You are a JSON extraction API. ${aiInstructions}\n\nUser message: "${userMessage}"\nCurrent date: ${new Date().toISOString().split('T')[0]}\n\nExtract and return ONLY a JSON object (no other text) with these fields:\n- summary: string (appointment title)\n- description: string (optional details)\n- date: string (YYYY-MM-DD format)\n- startTime: string (HH:MM format, 24-hour)\n- duration: number (minutes, default 60)\n\nIf any required information is missing, return ONLY: {"missing": ["field1", "field2"]}`;

      try {
        const aiResponse = await openaiChat({
          apiKey: env.OPENAI_API_KEY,
          model: "gpt-4o-mini",
          messages: [{ role: "system", content: "You are a JSON extraction API. Always return only valid JSON." }, { role: "user", content: extractionPrompt }],
          maxOutputTokens: 300,
        });

        let jsonText = (aiResponse.text || "").trim().replace(/^```json\s*/, "").replace(/```\s*$/, "").replace(/^```\s*/, "");
        const extracted = JSON.parse(jsonText);

        if (extracted.missing && extracted.missing.length > 0) {
          await tgSendMessage({ token, chat_id: chatId, text: `I need more information: ${extracted.missing.join(", ")}` });
          return;
        }

        const startDateTime = `${extracted.date}T${extracted.startTime}:00`;
        const endDate = new Date(new Date(startDateTime).getTime() + (extracted.duration || 60) * 60 * 1000);
        const endDateTime = endDate.toISOString().slice(0, 16) + ":00";

        const result = await executeIntegration(env, integrationId, "create_event", {
          summary: extracted.summary,
          description: extracted.description || "",
          start: { dateTime: startDateTime, timeZone: "UTC" },
          end: { dateTime: endDateTime, timeZone: "UTC" },
        });

        await tgSendMessage({ token, chat_id: chatId, text: `✅ Appointment created!\n\n${extracted.summary}\n${extracted.date} at ${extracted.startTime}\n${result.htmlLink || ""}` });
      } catch (e: any) {
        await tgSendMessage({ token, chat_id: chatId, text: `Sorry, I couldn't create the appointment. Error: ${e.message}` });
      }
    }
  }

  static async getAvailableSlots(params: {
    env: Env;
    botProjectId: string;
    date?: string;
    slotDurationMinutes?: number;
    searchDays?: number;
  }): Promise<{ date: string; slots: string[] }[]> {
    const { env, botProjectId, date, slotDurationMinutes = 60, searchDays = 1 } = params;
    const bot = await dbGet<any>(env.DB, "SELECT timezone FROM bot_projects WHERE id = ?", [botProjectId]);
    const timezone = bot?.timezone || "UTC";
    const results: { date: string; slots: string[] }[] = [];
    const now = new Date();

    const getLocalISO = (d: Date) => {
      const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).formatToParts(d);
      const f = (t: string) => parts.find(p => p.type === t)?.value;
      return `${f('year')}-${f('month')}-${f('day')}T${f('hour')}:${f('minute')}:${f('second')}`;
    };

    const botNowISO = getLocalISO(now);
    const startSearchDateStr = date || botNowISO.split('T')[0];

    for (let i = 0; i < searchDays; i++) {
      const searchDayUTC = new Date(new Date(`${startSearchDateStr}T12:00:00Z`).getTime() + i * 24 * 60 * 60 * 1000);
      const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' }).formatToParts(searchDayUTC);
      const f = (t: string) => parts.find(p => p.type === t)?.value;
      const dateStr = `${f('year')}-${f('month')}-${f('day')}`;
      const dayMap: Record<string, number> = { 'Sun': 0, 'Mon': 1, 'Tue': 2, 'Wed': 3, 'Thu': 4, 'Fri': 5, 'Sat': 6 };
      const normalizedDayOfWeek = dayMap[f('weekday') || 'Mon'];

      const workingHours = await dbGet<any>(env.DB, "SELECT start_time, end_time FROM bot_working_hours WHERE bot_project_id = ? AND day_of_week = ? AND is_enabled = 1", [botProjectId, normalizedDayOfWeek]);
      if (!workingHours) continue;

      const integration = await dbGet<any>(env.DB, "SELECT id FROM bot_integrations WHERE bot_project_id = ? AND integration_type = 'google_calendar' AND status = 'active'", [botProjectId]);
      let busyIntervals: any[] = [];
      if (integration) {
        try {
          const freeBusy = await executeIntegration(env, integration.id, "get_freebusy", { timeMin: new Date(new Date(`${dateStr}T00:00:00Z`).getTime() - 24*60*60*1000).toISOString(), timeMax: new Date(new Date(`${dateStr}T23:59:59Z`).getTime() + 24*60*60*1000).toISOString(), items: [{ id: "primary" }] });
          busyIntervals = freeBusy.calendars?.primary?.busy || [];
        } catch {}
      }

      const slots: string[] = [];
      const [startH, startM] = workingHours.start_time.split(':').map(Number);
      const [endH, endM] = workingHours.end_time.split(':').map(Number);
      let currentSlotMinutes = startH * 60 + startM;
      const endMinutes = endH * 60 + endM;

      while (currentSlotMinutes + slotDurationMinutes <= endMinutes) {
        const h = Math.floor(currentSlotMinutes / 60);
        const m = currentSlotMinutes % 60;
        const timeStr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
        const slotLocalISO = `${dateStr}T${timeStr}:00`;
        if (slotLocalISO <= botNowISO) { currentSlotMinutes += slotDurationMinutes; continue; }

        const getUTCFromLocal = (iso: string, tz: string) => {
          const d = new Date(iso + 'Z');
          const loc = new Date(d.toLocaleString('en-US', { timeZone: tz }));
          const diff = d.getTime() - loc.getTime();
          return new Date(d.getTime() + diff);
        };

        const slotStartUTC = getUTCFromLocal(slotLocalISO, timezone).getTime();
        const slotEndUTC = slotStartUTC + slotDurationMinutes * 60 * 1000;
        const isBusy = busyIntervals.some(busy => (slotStartUTC < new Date(busy.end).getTime() && slotEndUTC > new Date(busy.start).getTime()));

        if (!isBusy) slots.push(timeStr);
        currentSlotMinutes += slotDurationMinutes;
      }
      if (slots.length > 0) {
        results.push({ date: dateStr, slots });
        if (searchDays > 1 && results.length >= 3) break;
      }
    }
    return results;
  }
}
