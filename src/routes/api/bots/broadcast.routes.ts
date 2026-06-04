import { Hono } from "hono";
import { Env } from "../../../config/env";
import { dbGet, dbAll, dbRun, nowMs } from "../../../utils/db";
import { BotRepository } from "../../../repositories/bot.repository";
import { tgSendMessage } from "../../../utils/telegram";
import { openaiChat } from "../../../utils/openai";
import { getLanguageName } from "../../../utils/language";
import { initI18n } from "../../../utils/i18n";
import { QuizService } from "../../../services/quiz.service";
import { executeIntegration } from "../../../integrations";
import { processApiResponseWithAI } from "../../../services/api-integration.service";

export const broadcastRoutes = new Hono<{ Bindings: Env; Variables: { userId: string } }>();

broadcastRoutes.get("/:botId/broadcast", async (c) => {
  const userId = c.get("userId");
  const botId = c.req.param("botId");

  const bot = await dbGet<any>(
    c.env.DB,
    "SELECT id FROM bot_projects WHERE id = ? AND owner_user_id = ? AND deleted_at IS NULL",
    [botId, userId],
  );
  if (!bot) return c.json({ error: "not_found" }, 404);

  const broadcasts = await dbAll<any>(
    c.env.DB,
    "SELECT id, enabled, use_quiz_results, quiz_set_ids_json, pre_prompt, send_time_hour, sentence_count, integration_id, updated_at FROM scheduled_broadcasts WHERE bot_project_id = ? ORDER BY created_at DESC",
    [botId],
  );

  return c.json({
    broadcasts: broadcasts.map(b => {
      let quizSetIds: string[] = [];
      try {
        if (b.quiz_set_ids_json) quizSetIds = JSON.parse(b.quiz_set_ids_json);
      } catch (e) {}
      return {
        id: b.id,
        enabled: Boolean(b.enabled),
        use_quiz_results: Boolean(b.use_quiz_results),
        quiz_set_ids: quizSetIds,
        pre_prompt: String(b.pre_prompt || ""),
        send_time_hour: Number(b.send_time_hour ?? 9),
        sentence_count: Number(b.sentence_count ?? 3),
        integration_id: b.integration_id ? String(b.integration_id) : null,
      };
    })
  });
});

broadcastRoutes.post("/:botId/broadcast", async (c) => {
  const userId = c.get("userId");
  const botId = c.req.param("botId");
  const body = await c.req.json();

  const bot = await dbGet<any>(
    c.env.DB,
    "SELECT id FROM bot_projects WHERE id = ? AND owner_user_id = ? AND deleted_at IS NULL",
    [botId, userId],
  );
  if (!bot) return c.json({ error: "not_found" }, 404);

  const id = crypto.randomUUID();
  const enabled = body.enabled ? 1 : 0;
  const useQuizResults = body.use_quiz_results !== false ? 1 : 0;
  const quizSetIdsJson = JSON.stringify(body.quiz_set_ids || []);
  const prePrompt = String(body.pre_prompt || "");
  const sendTimeHour = typeof body.send_time_hour === "number" ? Math.max(0, Math.min(23, Math.floor(body.send_time_hour))) : 9;
  const sentenceCount = typeof body.sentence_count === "number" ? body.sentence_count : 3;
  const integrationId = body.integration_id ? String(body.integration_id) : null;

  await dbRun(
    c.env.DB,
    "INSERT INTO scheduled_broadcasts (id, bot_project_id, enabled, use_quiz_results, quiz_set_ids_json, pre_prompt, send_time_hour, sentence_count, integration_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [id, botId, enabled, useQuizResults, quizSetIdsJson, prePrompt, sendTimeHour, sentenceCount, integrationId, nowMs(), nowMs()],
  );

  return c.json({ ok: true, id });
});

broadcastRoutes.patch("/:botId/broadcast/:id", async (c) => {
  const userId = c.get("userId");
  const botId = c.req.param("botId");
  const broadcastId = c.req.param("id");
  const body = await c.req.json();

  const bot = await dbGet<any>(
    c.env.DB,
    "SELECT id FROM bot_projects WHERE id = ? AND owner_user_id = ? AND deleted_at IS NULL",
    [botId, userId],
  );
  if (!bot) return c.json({ error: "not_found" }, 404);

  const existing = await dbGet<any>(
    c.env.DB,
    "SELECT id FROM scheduled_broadcasts WHERE id = ? AND bot_project_id = ?",
    [broadcastId, botId],
  );
  if (!existing) return c.json({ error: "not_found" }, 404);

  const fields: string[] = [];
  const binds: any[] = [];

  if (typeof body.enabled === "boolean") {
    fields.push("enabled = ?");
    binds.push(body.enabled ? 1 : 0);
  }
  if (typeof body.use_quiz_results === "boolean") {
    fields.push("use_quiz_results = ?");
    binds.push(body.use_quiz_results ? 1 : 0);
  }
  if (Array.isArray(body.quiz_set_ids)) {
    fields.push("quiz_set_ids_json = ?");
    binds.push(JSON.stringify(body.quiz_set_ids));
  }
  if (typeof body.pre_prompt === "string") {
    fields.push("pre_prompt = ?");
    binds.push(body.pre_prompt);
  }
  if (typeof body.send_time_hour === "number") {
    fields.push("send_time_hour = ?");
    binds.push(Math.max(0, Math.min(23, Math.floor(body.send_time_hour))));
  }
  if (typeof body.sentence_count === "number") {
    fields.push("sentence_count = ?");
    binds.push(body.sentence_count);
  }
  if (body.integration_id !== undefined) {
    fields.push("integration_id = ?");
    binds.push(body.integration_id ? String(body.integration_id) : null);
  }

  if (fields.length) {
    fields.push("updated_at = ?");
    binds.push(nowMs());
    binds.push(broadcastId);
    binds.push(botId);
    await dbRun(c.env.DB, `UPDATE scheduled_broadcasts SET ${fields.join(", ")} WHERE id = ? AND bot_project_id = ?`, binds);
  }

  return c.json({ ok: true });
});

broadcastRoutes.delete("/:botId/broadcast/:id", async (c) => {
  const userId = c.get("userId");
  const botId = c.req.param("botId");
  const broadcastId = c.req.param("id");

  const bot = await dbGet<any>(
    c.env.DB,
    "SELECT id FROM bot_projects WHERE id = ? AND owner_user_id = ? AND deleted_at IS NULL",
    [botId, userId],
  );
  if (!bot) return c.json({ error: "not_found" }, 404);

  await dbRun(c.env.DB, "DELETE FROM scheduled_broadcasts WHERE id = ? AND bot_project_id = ?", [broadcastId, botId]);

  return c.json({ ok: true });
});

broadcastRoutes.post("/:botId/broadcast/now", async (c) => {
  const userId = c.get("userId");
  const botId = c.req.param("botId");
  const body = await c.req.json();

  const bot = await dbGet<any>(
    c.env.DB,
    "SELECT id, default_language, name, description FROM bot_projects WHERE id = ? AND owner_user_id = ? AND deleted_at IS NULL",
    [botId, userId],
  );
  if (!bot) return c.json({ error: "not_found" }, 404);

  const type = body.type === "ai" ? "ai" : body.type === "quiz" ? "quiz" : "regular";
  const messageText = String(body.message || "").trim();
  const prompt = String(body.prompt || "").trim();
  const quizSetIds = Array.isArray(body.quiz_set_ids) ? body.quiz_set_ids : [];
  const broadcastQuizSetId = String(body.quiz_set_id || "");
  const sentenceCount = typeof body.sentence_count === "number" ? body.sentence_count : 3;
  const integrationId = body.integration_id ? String(body.integration_id) : null;

  const subscribers = await dbAll<any>(
    c.env.DB,
    `SELECT DISTINCT chat_id, user_id FROM (
      SELECT chat_id, user_id FROM bot_subscribers WHERE bot_project_id = ? AND subscribed = 1
      UNION 
      SELECT chat_id, user_id FROM messages WHERE bot_project_id = ? AND direction = 'in' AND user_id IS NOT NULL 
      AND NOT EXISTS (SELECT 1 FROM bot_subscribers bs WHERE bs.bot_project_id = messages.bot_project_id AND bs.chat_id = messages.chat_id AND bs.user_id = messages.user_id AND bs.subscribed = 0)
    )`,
    [botId, botId],
  );

  if (!subscribers.length) {
    console.log(`[Broadcast Now] No subscribers found for bot ${botId}`);
    return c.json({ ok: true, sent_count: 0, reason: "no_subscribers" });
  }

  const token = await BotRepository.getBotToken(c.env, botId);
  if (!token) return c.json({ error: "internal_error", reason: "no_bot_token" }, 500);

  const broadcastId = crypto.randomUUID();
  let displayMessage = type === "regular" ? messageText : type === "ai" ? `[AI] ${prompt}` : `[QUIZ] ${broadcastQuizSetId}`;

  await dbRun(
    c.env.DB,
    "INSERT INTO broadcast_messages (id, bot_project_id, target_hour, message_text, generation_prompt, sent_count, failed_count, created_at) VALUES (?, ?, -1, ?, ?, 0, 0, ?)",
    [broadcastId, botId, displayMessage, prompt || "", nowMs()],
  );

  let sentCount = 0;
  let failedCount = 0;
  const botCfg = await BotRepository.loadBotConfigById(c.env, botId);

  for (const sub of subscribers) {
    const chatId = String(sub.chat_id);
    const subUserId = String(sub.user_id);
    const deliveryId = crypto.randomUUID();

    try {
      const profile = await dbGet<any>(c.env.DB, "SELECT language, profile_json FROM user_profiles WHERE bot_project_id = ? AND chat_id = ? AND user_id = ?", [botId, chatId, subUserId]);
      const subLang = profile?.language || (botCfg?.defaultLanguage === "auto" ? "en" : (botCfg?.defaultLanguage || "en"));
      const subI18n = await initI18n(subLang);

      if (type === "quiz") {
        await QuizService.handleQuizStart({ env: c.env, cfg: { ...botCfg!, quizSetIds: [broadcastQuizSetId] }, token, chatId, userId: subUserId, i18n: subI18n });
      } else {
        let finalMessage = messageText;
        if (type === "ai") {
          // Load user's quiz answers as array for API integration
          let quizAnswers: any[] = [];
          let quizContext = "";
          if (profile?.profile_json) {
            const profileData = JSON.parse(String(profile.profile_json));
            let answers = Array.isArray(profileData?.quiz_answers) ? profileData.quiz_answers : [];
            if (quizSetIds.length) {
              answers = answers.filter((a: any) => quizSetIds.includes(String(a?.quiz_set_id)));
            }
            quizAnswers = answers;
            if (answers.length) {
              quizContext = answers.map((a: any) => `${a.question}: ${a.answer}`).join("\n");
            }
          }

          // Fetch API data per user with their quiz context
          let apiContext = "";
          if (integrationId) {
            try {
              const integration = await dbGet<any>(
                c.env.DB,
                "SELECT settings_json FROM bot_integrations WHERE id = ? AND bot_project_id = ? AND status = 'active'",
                [integrationId, botId]
              );
              if (integration) {
                const settings = integration.settings_json ? JSON.parse(String(integration.settings_json)) : {};
                const apiPrompt = settings.aiPrompt || "";
                
                // Call API with user's quiz answers for personalization
                const apiData = await executeIntegration(c.env, integrationId, "fetch", { quizAnswers });
                
                if (apiData && apiPrompt) {
                  apiContext = await processApiResponseWithAI({
                    env: c.env,
                    apiResponse: apiData,
                    aiPrompt: apiPrompt,
                    language: subLang,
                  });
                } else if (apiData) {
                  // No AI prompt, use raw API data as context
                  apiContext = typeof apiData === "string" ? apiData : JSON.stringify(apiData);
                }
              }
            } catch (e: any) {
              console.error(`[Broadcast Now] Failed to fetch API data for user ${subUserId}:`, e);
              // Continue without API data for this user
            }
          }

          const systemPrompt = apiContext 
            ? [
                `You are a broadcast message generator.`,
                `IMPORTANT: Respond ONLY in ${getLanguageName(subLang)} language.`,
                `YOUR TASK: ${prompt}`,
                `API Data (USE THIS AS YOUR PRIMARY SOURCE):\n${apiContext}`,
                quizContext ? `User preferences:\n${quizContext}` : "",
                `Generate a short, engaging message (${sentenceCount} sentences max) based STRICTLY on the API data above.`
              ].filter(Boolean).join("\n\n")
            : [
                `You are a personalized bot assistant.`,
                `Topic: ${bot.name}`,
                `Description: ${bot.description}`,
                `IMPORTANT: Respond ONLY in ${getLanguageName(subLang)} language.`,
                `Broadcast directive: ${prompt}`,
                quizContext ? `User context:\n${quizContext}` : "",
                `Generate a short, engaging message (${sentenceCount} sentences max).`
              ].filter(Boolean).join("\n\n");
          const aiRes = await openaiChat({ apiKey: c.env.OPENAI_API_KEY, model: "gpt-4o-mini", messages: [{ role: "system", content: systemPrompt }], maxOutputTokens: 250 });
          finalMessage = aiRes.text || "Hello!";
        }
        await tgSendMessage({ token, chat_id: chatId, text: finalMessage });
      }
      await dbRun(c.env.DB, "INSERT INTO broadcast_deliveries (id, broadcast_message_id, chat_id, user_id, status, sent_at) VALUES (?, ?, ?, ?, 'sent', ?)", [deliveryId, broadcastId, chatId, subUserId, nowMs()]);
      sentCount++;
    } catch (e: any) {
      await dbRun(c.env.DB, "INSERT INTO broadcast_deliveries (id, broadcast_message_id, chat_id, user_id, status, error, sent_at) VALUES (?, ?, ?, ?, 'failed', ?, ?)", [deliveryId, broadcastId, chatId, subUserId, e.message, nowMs()]);
      failedCount++;
    }
  }

  await dbRun(c.env.DB, "UPDATE broadcast_messages SET sent_count = ?, failed_count = ?, completed_at = ? WHERE id = ?", [sentCount, failedCount, nowMs(), broadcastId]);
  return c.json({ ok: true, sent_count: sentCount, failed_count: failedCount });
});
