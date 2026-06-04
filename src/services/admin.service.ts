import { Env } from "../config/env";
import { dbAll, dbRun, dbGet, nowMs } from "../utils/db";
import { BotRepository } from "../repositories/bot.repository";
import { openaiChat } from "../utils/openai";
import { getLanguageName } from "../utils/language";
import { tgSendMessage, tgApi } from "../utils/telegram";
import { executeIntegration } from "../integrations";
import { processApiResponseWithAI } from "./api-integration.service";
import { Logger } from "../utils/logger";

export class AdminService {
  static async processDeletions(env: Env): Promise<void> {
    const pending = await dbAll<any>(
      env.DB,
      "SELECT id, telegram_user_id FROM deletion_requests WHERE status = 'pending' ORDER BY requested_at ASC LIMIT 5",
    );
    for (const reqRow of pending) {
      const reqId = String(reqRow.id);
      const tgUserId = String(reqRow.telegram_user_id);
      await this.processSingleDeletionRequest(env, reqId, tgUserId);
    }
  }

  private static async processSingleDeletionRequest(
    env: Env,
    reqId: string,
    tgUserId: string,
  ): Promise<void> {
    try {
      await dbRun(env.DB, "UPDATE deletion_requests SET status = 'running' WHERE id = ?", [reqId]);

      const user = await dbGet<any>(env.DB, "SELECT id FROM users WHERE telegram_user_id = ?", [tgUserId]);
      if (!user) {
        await dbRun(env.DB, "UPDATE deletion_requests SET status = 'completed', completed_at = ? WHERE id = ?", [
          nowMs(),
          reqId,
        ]);
        await env.KV.delete(`parent_wizard:${tgUserId}`);
        return;
      }

      const userDbId = String(user.id);
      const bots = await dbAll<any>(env.DB, "SELECT id, webhook_secret FROM bot_projects WHERE owner_user_id = ?", [userDbId]);
      for (const b of bots) {
        const botId = String(b.id);
        const webhookSecret = b.webhook_secret ? String(b.webhook_secret) : "";

        // Attempt to unset webhook in Telegram before deleting tokens
        try {
          const token = await BotRepository.getBotToken(env, botId);
          if (token) {
            await tgApi(token, "deleteWebhook", { drop_pending_updates: true });
            await tgApi(token, "setMyCommands", { commands: [] });
            // Reset menu button to default (commands)
            await tgApi(token, "setChatMenuButton", {
              menu_button: { type: "commands" }
            });
          }
        } catch (e: any) {
          Logger.error('ADMIN', `[AdminService.processSingleDeletionRequest] Failed to unset webhook for bot ${botId}: ${e.message}`);
        }

        await dbRun(env.DB, "DELETE FROM broadcast_deliveries WHERE broadcast_message_id IN (SELECT id FROM broadcast_messages WHERE bot_project_id = ?)", [botId]);
        await dbRun(env.DB, "DELETE FROM broadcast_messages WHERE bot_project_id = ?", [botId]);
        await dbRun(env.DB, "DELETE FROM bot_subscribers WHERE bot_project_id = ?", [botId]);
        await dbRun(env.DB, "DELETE FROM broadcast_settings WHERE bot_project_id = ?", [botId]);
        await dbRun(env.DB, "DELETE FROM scheduled_broadcasts WHERE bot_project_id = ?", [botId]);
        await dbRun(env.DB, "DELETE FROM ai_calls WHERE bot_project_id = ?", [botId]);
        await dbRun(env.DB, "DELETE FROM messages WHERE bot_project_id = ?", [botId]);
        await dbRun(env.DB, "DELETE FROM telegram_updates_raw WHERE bot_project_id = ?", [botId]);
        await dbRun(env.DB, "DELETE FROM conversation_summaries WHERE bot_project_id = ?", [botId]);
        await dbRun(env.DB, "DELETE FROM user_profiles WHERE bot_project_id = ?", [botId]);
        await dbRun(env.DB, "DELETE FROM quiz_responses WHERE session_id IN (SELECT id FROM quiz_sessions WHERE bot_project_id = ?)", [botId]);
        await dbRun(env.DB, "DELETE FROM quiz_sessions WHERE bot_project_id = ?", [botId]);
        await dbRun(env.DB, "DELETE FROM quiz_items WHERE quiz_set_id IN (SELECT id FROM quiz_sets WHERE bot_project_id = ?)", [botId]);
        await dbRun(env.DB, "DELETE FROM quiz_sets WHERE bot_project_id = ?", [botId]);
        await dbRun(env.DB, "DELETE FROM bot_commands WHERE bot_project_id = ?", [botId]);
        await dbRun(env.DB, "DELETE FROM bot_integrations WHERE bot_project_id = ?", [botId]);
        await dbRun(env.DB, "DELETE FROM bot_actions WHERE bot_project_id = ?", [botId]);
        await dbRun(env.DB, "DELETE FROM bot_working_hours WHERE bot_project_id = ?", [botId]);
        await dbRun(env.DB, "DELETE FROM bot_prompts WHERE bot_project_id = ?", [botId]);
        await dbRun(env.DB, "DELETE FROM bot_tokens WHERE bot_project_id = ?", [botId]);
        await dbRun(env.DB, "DELETE FROM bot_keys WHERE bot_project_id = ?", [botId]);
        await dbRun(env.DB, "DELETE FROM audit_events WHERE bot_project_id = ?", [botId]);
        await dbRun(env.DB, "DELETE FROM bot_projects WHERE id = ?", [botId]);

        if (webhookSecret) {
          await env.KV.delete(`botcfg:${webhookSecret}`);
        }
        await env.KV.delete(`bottoken:${botId}`);
      }

      await dbRun(env.DB, "DELETE FROM parent_updates_raw WHERE update_json LIKE ?", [`%"id":${tgUserId}%`]);
      await dbRun(env.DB, "DELETE FROM parent_updates_raw WHERE update_json LIKE ?", [`%"id": ${tgUserId}%`]);
      await dbRun(env.DB, "DELETE FROM audit_events WHERE actor_user_id = ?", [userDbId]);
      await dbRun(env.DB, "DELETE FROM users WHERE id = ?", [userDbId]);
      await env.KV.delete(`parent_wizard:${tgUserId}`);

      await dbRun(env.DB, "UPDATE deletion_requests SET status = 'completed', completed_at = ? WHERE id = ?", [
        nowMs(),
        reqId,
      ]);
    } catch (e: any) {
      Logger.error('ADMIN', `Deletion request failed reqId=${reqId} error=${e.message}`);
      await dbRun(env.DB, "UPDATE deletion_requests SET status = 'failed', error = ? WHERE id = ?", [
        e.message,
        reqId,
      ]);
    }
  }

  static async retentionCleanup(env: Env): Promise<void> {
    const cutoff = nowMs() - 30 * 24 * 3600 * 1000;
    await dbRun(env.DB, "DELETE FROM parent_updates_raw WHERE received_at < ?", [cutoff]);
    await dbRun(env.DB, "DELETE FROM telegram_updates_raw WHERE received_at < ?", [cutoff]);
    await dbRun(env.DB, "DELETE FROM messages WHERE created_at < ?", [cutoff]);
    await dbRun(env.DB, "DELETE FROM ai_calls WHERE created_at < ?", [cutoff]);
    await dbRun(env.DB, "DELETE FROM audit_events WHERE created_at < ?", [cutoff]);
    await dbRun(env.DB, "DELETE FROM quiz_responses WHERE created_at < ?", [cutoff]);

    // Clean up soft-deleted bots after 30 days
    const softDeletedBots = await dbAll<any>(
      env.DB,
      "SELECT id, webhook_secret FROM bot_projects WHERE deleted_at IS NOT NULL AND deleted_at < ?",
      [cutoff]
    );

    Logger.info('ADMIN', `Found ${softDeletedBots.length} soft-deleted bot(s) older than 30 days for cleanup`);

    for (const bot of softDeletedBots) {
      const botId = String(bot.id);
      const webhookSecret = bot.webhook_secret ? String(bot.webhook_secret) : "";

      try {
        Logger.info('ADMIN', `Cleaning up soft-deleted bot: ${botId}`);

        // Delete all related data in correct cascade order
        await dbRun(env.DB, "DELETE FROM broadcast_deliveries WHERE broadcast_message_id IN (SELECT id FROM broadcast_messages WHERE bot_project_id = ?)", [botId]);
        await dbRun(env.DB, "DELETE FROM broadcast_messages WHERE bot_project_id = ?", [botId]);
        await dbRun(env.DB, "DELETE FROM bot_subscribers WHERE bot_project_id = ?", [botId]);
        await dbRun(env.DB, "DELETE FROM broadcast_settings WHERE bot_project_id = ?", [botId]);
        await dbRun(env.DB, "DELETE FROM scheduled_broadcasts WHERE bot_project_id = ?", [botId]);
        await dbRun(env.DB, "DELETE FROM ai_calls WHERE bot_project_id = ?", [botId]);
        await dbRun(env.DB, "DELETE FROM messages WHERE bot_project_id = ?", [botId]);
        await dbRun(env.DB, "DELETE FROM telegram_updates_raw WHERE bot_project_id = ?", [botId]);
        await dbRun(env.DB, "DELETE FROM conversation_summaries WHERE bot_project_id = ?", [botId]);
        await dbRun(env.DB, "DELETE FROM user_profiles WHERE bot_project_id = ?", [botId]);
        await dbRun(env.DB, "DELETE FROM quiz_responses WHERE session_id IN (SELECT id FROM quiz_sessions WHERE bot_project_id = ?)", [botId]);
        await dbRun(env.DB, "DELETE FROM quiz_sessions WHERE bot_project_id = ?", [botId]);
        await dbRun(env.DB, "DELETE FROM quiz_items WHERE quiz_set_id IN (SELECT id FROM quiz_sets WHERE bot_project_id = ?)", [botId]);
        await dbRun(env.DB, "DELETE FROM quiz_sets WHERE bot_project_id = ?", [botId]);
        await dbRun(env.DB, "DELETE FROM bot_commands WHERE bot_project_id = ?", [botId]);
        await dbRun(env.DB, "DELETE FROM bot_integrations WHERE bot_project_id = ?", [botId]);
        await dbRun(env.DB, "DELETE FROM bot_actions WHERE bot_project_id = ?", [botId]);
        await dbRun(env.DB, "DELETE FROM bot_working_hours WHERE bot_project_id = ?", [botId]);
        await dbRun(env.DB, "DELETE FROM bot_prompts WHERE bot_project_id = ?", [botId]);
        await dbRun(env.DB, "DELETE FROM bot_tokens WHERE bot_project_id = ?", [botId]);
        await dbRun(env.DB, "DELETE FROM bot_keys WHERE bot_project_id = ?", [botId]);
        await dbRun(env.DB, "DELETE FROM audit_events WHERE bot_project_id = ?", [botId]);
        await dbRun(env.DB, "DELETE FROM bot_projects WHERE id = ?", [botId]);

        // Clear KV cache
        if (webhookSecret) {
          await env.KV.delete(`botcfg:${webhookSecret}`);
        }
        await env.KV.delete(`bottoken:${botId}`);

        Logger.info('ADMIN', `Successfully cleaned up soft-deleted bot: ${botId}`);
      } catch (e: any) {
        Logger.error('ADMIN', `Failed to cleanup soft-deleted bot ${botId}: ${e.message}`, e);
      }
    }
  }

  static async processBroadcasts(env: Env): Promise<void> {
    const now = new Date();
    const currentUtcHour = now.getUTCHours();
    
    const scheduledBroadcasts = await dbAll<any>(
      env.DB,
      `SELECT sb.id as scheduled_id, sb.bot_project_id, sb.use_quiz_results, sb.quiz_set_ids_json, sb.pre_prompt, sb.send_time_hour, sb.sentence_count, sb.integration_id,
              bp.default_language, bp.name, bp.description, bp.timezone
       FROM scheduled_broadcasts sb
       JOIN bot_projects bp ON bp.id = sb.bot_project_id
       WHERE sb.enabled = 1 AND bp.deleted_at IS NULL AND bp.status = 'active'`,
    );

    for (const sb of scheduledBroadcasts) {
      const botProjectId = String(sb.bot_project_id);
      const scheduledId = String(sb.scheduled_id);
      const sendTimeHour = Number(sb.send_time_hour ?? 9);
      const sentenceCount = Number(sb.sentence_count ?? 3);
      const botTimezone = sb.timezone || "UTC";

      // Calculate current hour in bot's timezone
      let currentBotHour = currentUtcHour;
      try {
        const formatter = new Intl.DateTimeFormat('en-US', {
          hour: 'numeric',
          hour12: false,
          timeZone: botTimezone,
        });
        const parts = formatter.formatToParts(now);
        const hourPart = parts.find(p => p.type === 'hour');
        if (hourPart) {
          currentBotHour = parseInt(hourPart.value, 10) % 24;
        }
      } catch (e) {
        Logger.error('ADMIN', `Invalid timezone ${botTimezone} for bot ${botProjectId}, falling back to UTC`);
      }

      if (currentBotHour !== sendTimeHour) continue;

      // Check if this specific scheduled broadcast was already sent in the last 20 hours
      // We use target_hour as -1 for manual ones, and for scheduled we can use the hour or something else
      // Actually, let's use generation_prompt or something to uniquely identify the schedule + day
      const existingBroadcast = await dbGet<any>(
        env.DB,
        `SELECT id FROM broadcast_messages WHERE bot_project_id = ? AND target_hour = ? AND generation_prompt = ? AND created_at > ? LIMIT 1`,
        [botProjectId, sendTimeHour, `scheduled:${scheduledId}`, nowMs() - 20 * 3600 * 1000],
      );
      if (existingBroadcast) continue;

      const subscribers = await dbAll<any>(
        env.DB,
        `SELECT DISTINCT chat_id, user_id FROM (SELECT chat_id, user_id FROM bot_subscribers WHERE bot_project_id = ? AND subscribed = 1 UNION SELECT chat_id, user_id FROM messages WHERE bot_project_id = ? AND direction = 'in' AND user_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM bot_subscribers bs WHERE bs.bot_project_id = messages.bot_project_id AND bs.chat_id = messages.chat_id AND bs.user_id = messages.user_id AND bs.subscribed = 0))`,
        [botProjectId, botProjectId],
      );
      if (!subscribers.length) continue;

      const token = await BotRepository.getBotToken(env, botProjectId);
      if (!token) continue;

      const botLanguage = String(sb.default_language || "en");
      const quizSetIdsJson = String(sb.quiz_set_ids_json || "[]");
      let quizSetIds: string[] = [];
      try {
        quizSetIds = JSON.parse(quizSetIdsJson);
      } catch (e) {}

      const broadcastId = crypto.randomUUID();
      await dbRun(env.DB, "INSERT INTO broadcast_messages (id, bot_project_id, target_hour, message_text, generation_prompt, sent_count, failed_count, created_at) VALUES (?, ?, ?, ?, ?, 0, 0, ?)", [
        broadcastId, 
        botProjectId, 
        sendTimeHour, 
        sb.pre_prompt || "Daily AI Broadcast", 
        `scheduled:${scheduledId}`, 
        nowMs()
      ]);

      let sentCount = 0;
      let failedCount = 0;
      const botCfg = await BotRepository.loadBotConfigById(env, botProjectId);
      const integrationId = sb.integration_id ? String(sb.integration_id) : null;

      // For daily broadcasts, we personalize for each user if quizzes are selected
      for (const sub of subscribers) {
        const chatId = String(sub.chat_id);
        const subUserId = String(sub.user_id);
        try {
          const profile = await dbGet<any>(env.DB, "SELECT language, profile_json FROM user_profiles WHERE bot_project_id = ? AND chat_id = ? AND user_id = ?", [botProjectId, chatId, subUserId]);
          const subLang = profile?.language || (botLanguage === "auto" ? "en" : botLanguage);
          
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
                env.DB,
                "SELECT settings_json FROM bot_integrations WHERE id = ? AND bot_project_id = ? AND status = 'active'",
                [integrationId, botProjectId]
              );
              if (integration) {
                const settings = integration.settings_json ? JSON.parse(String(integration.settings_json)) : {};
                const aiPrompt = settings.aiPrompt || "";
                
                // Call API with user's quiz answers for personalization
                const apiData = await executeIntegration(env, integrationId, "fetch", { quizAnswers });
                
                if (apiData && aiPrompt) {
                  apiContext = await processApiResponseWithAI({
                    env,
                    apiResponse: apiData,
                    aiPrompt,
                    language: subLang,
                  });
                } else if (apiData) {
                  apiContext = typeof apiData === "string" ? apiData : JSON.stringify(apiData);
                }
              }
            } catch (e: any) {
              Logger.error('ADMIN', `[AdminService.processBroadcasts] Failed to fetch API data for user ${subUserId}: ${e.message}`);
              // Continue without API data for this user
            }
          }

          const personalizedSystemPrompt = apiContext
            ? [
                `You are a broadcast message generator.`,
                `IMPORTANT: Respond ONLY in ${getLanguageName(subLang)} language.`,
                sb.pre_prompt ? `YOUR TASK: ${sb.pre_prompt}` : `YOUR TASK: Share the information from the API data.`,
                `API Data (USE THIS AS YOUR PRIMARY SOURCE):\n${apiContext}`,
                quizContext ? `User preferences:\n${quizContext}` : "",
                `Generate a short, engaging message (${sentenceCount} sentences max) based STRICTLY on the API data above.`
              ].filter(Boolean).join("\n\n")
            : [
                `You are a personalized bot assistant.`,
                `Name: ${sb.name}`,
                `Description: ${sb.description}`,
                `IMPORTANT: Respond ONLY in ${getLanguageName(subLang)} language.`,
                sb.pre_prompt ? `Broadcast directive: ${sb.pre_prompt}` : "",
                quizContext ? `User context:\n${quizContext}` : "",
                `Generate a short, engaging message (${sentenceCount} sentences max) for today's broadcast.`
              ].filter(Boolean).join("\n\n");

          const chatResponse = await openaiChat({ 
            apiKey: env.OPENAI_API_KEY, 
            model: "gpt-4o-mini", 
            messages: [{ role: "system", content: personalizedSystemPrompt }], 
            maxOutputTokens: 250 
          });
          const finalMessage = chatResponse.text || "Hello!";

          await tgSendMessage({ token, chat_id: chatId, text: finalMessage });
          await dbRun(env.DB, "INSERT INTO broadcast_deliveries (id, broadcast_message_id, chat_id, user_id, status, sent_at) VALUES (?, ?, ?, ?, 'sent', ?)", [crypto.randomUUID(), broadcastId, chatId, subUserId, nowMs()]);
          sentCount++;
        } catch (e: any) {
          Logger.error('ADMIN', `[AdminService.processBroadcasts] Failed to send to ${chatId}: ${e.message}`);
          await dbRun(env.DB, "INSERT INTO broadcast_deliveries (id, broadcast_message_id, chat_id, user_id, status, error, sent_at) VALUES (?, ?, ?, ?, 'failed', ?, ?)", [crypto.randomUUID(), broadcastId, chatId, subUserId, e.message, nowMs()]);
          failedCount++;
        }
      }

      await dbRun(env.DB, "UPDATE broadcast_messages SET sent_count = ?, failed_count = ?, completed_at = ? WHERE id = ?", [sentCount, failedCount, nowMs(), broadcastId]);
    }
  }
}
