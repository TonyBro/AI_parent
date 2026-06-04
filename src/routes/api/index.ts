import { Hono } from "hono";
import { Env } from "../../config/env";
import { tmaAuth } from "../../middlewares/auth.middleware";
import { dbGet, dbAll, dbRun, nowMs } from "../../utils/db";
import { AIService } from "../../services/ai.service";
import { Logger } from "../../utils/logger";
import { botRoutes } from "./bots/bot.routes";
import { broadcastRoutes } from "./bots/broadcast.routes";
import { quizRoutes } from "./bots/quiz.routes";
import { commandRoutes } from "./bots/command.routes";
import { integrationRoutes } from "./bots/integration.routes";
import { actionRoutes } from "./bots/action.routes";
import { workingHoursRoutes } from "./bots/working-hours.routes";
import { UserRepository } from "../../repositories/user.repository";
import { tgApi, tgSendPhoto } from "../../utils/telegram";
import { wrapDekWithKek, encryptWithDek } from "../../utils/crypto";
import { DEFAULT_PROMPTS } from "../../config/prompts";
import { BotService } from "../../services/bot.service";
import { initI18n } from "../../utils/i18n";
import { BotRepository } from "../../repositories/bot.repository";
import { BotAvatarService } from "../../services/bot-avatar.service";
import { BotCreationTemplate } from "../../types";

export const apiRouter = new Hono<{ Bindings: Env; Variables: { userId: string } }>();

apiRouter.use("*", tmaAuth);

apiRouter.get("/me/bot", async (c) => {
  const userId = c.get("userId");
  const bot = await dbGet<any>(
    c.env.DB,
    "SELECT id, status, bot_username, default_language, name, description, type, created_at, updated_at FROM bot_projects WHERE owner_user_id = ? AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 1",
    [userId],
  );
  return c.json({ bot });
});

apiRouter.get("/me/bots", async (c) => {
  const userId = c.get("userId");
  const bots = await dbAll<any>(
    c.env.DB,
    `SELECT 
      bp.id, bp.status, bp.bot_username, bp.default_language, 
      bp.name, bp.description, bp.type, bp.created_at, bp.updated_at,
      (
        SELECT COUNT(DISTINCT chat_id || '_' || user_id) 
        FROM (
          SELECT chat_id, user_id FROM bot_subscribers 
          WHERE bot_project_id = bp.id AND subscribed = 1
          UNION 
          SELECT chat_id, user_id FROM messages 
          WHERE bot_project_id = bp.id AND direction = 'in' AND user_id IS NOT NULL 
          AND NOT EXISTS (
            SELECT 1 FROM bot_subscribers bs 
            WHERE bs.bot_project_id = messages.bot_project_id 
            AND bs.chat_id = messages.chat_id 
            AND bs.user_id = messages.user_id 
            AND bs.subscribed = 0
          )
        )
      ) as subscriber_count
    FROM bot_projects bp 
    WHERE bp.owner_user_id = ? AND bp.deleted_at IS NULL 
    ORDER BY bp.created_at DESC`,
    [userId],
  );
  return c.json({ bots });
});

apiRouter.post("/me/bots", async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json();
  const { bot_token, bot_prompt, default_language, website_urls, business_context, timezone, type } = body;

  if (!bot_token) {
    return c.json({ error: "bad_request", reason: "missing_token" }, 400);
  }

  const lang = default_language || "en";
  const botType = type === "manager" ? "manager" : "assistant";

  const freeLimit = parseInt(c.env.FREE_PLAN_BOT_LIMIT || "1", 10);
  const userBotCount = await UserRepository.getUserBotCount(c.env, userId);
  if (userBotCount >= freeLimit) {
    const i18n = await initI18n(lang);
    return c.json({ error: "limit_reached", reason: i18n.t("parent.free_limit", { count: freeLimit }) }, 400);
  }

  const getMe = await tgApi<any>(bot_token, "getMe", {});
  if (!getMe.ok) return c.json({ error: "invalid_token", reason: getMe.description }, 400);

  const childBotId = String(getMe.result.id);
  const childBotUsername = String(getMe.result.username || "");

  // AI design if bot_prompt provided
  let finalName = body.name || "My Bot";
  let finalDesc = body.description || "";
  let finalContext = business_context || "";
  let finalTimezone = timezone || "UTC";
  let suggestedCommands: any[] = [];
  let suggestedQuizzes: any[] = [];
  let suggestedApiIntegrations: any[] = [];
  let suggestedScheduledBroadcasts: any[] = [];

  if (bot_prompt) {
    // Check if a template exists for this user
    let usedTemplate = false;
    try {
      const templateJson = await c.env.KV.get(`bot_template:${userId}`);
      if (templateJson) {
        const template: BotCreationTemplate = JSON.parse(templateJson);
        
        // Verify the template matches the current prompt
        if (template.originalPrompt === bot_prompt) {
          Logger.info('API', `Using stored template for bot creation (userId: ${userId})`);
          
          // Use template config
          finalName = template.config.name;
          finalDesc = template.config.description;
          finalContext = template.config.business_context;
          if (!timezone && template.config.timezone) {
            finalTimezone = template.config.timezone;
          }
          suggestedCommands = template.config.commands || [];
          suggestedQuizzes = template.config.quizzes || [];
          suggestedApiIntegrations = template.config.apiIntegrations || [];
          suggestedScheduledBroadcasts = template.config.scheduledBroadcasts || [];
          
          usedTemplate = true;
          
          // Delete template after use
          await c.env.KV.delete(`bot_template:${userId}`);
        } else {
          Logger.info('API', `Template prompt mismatch, will call AI fresh (userId: ${userId})`);
        }
      }
    } catch (e: any) {
      Logger.warn('API', `Failed to retrieve template, will call AI fresh: ${e.message}`);
    }
    
    // If no template was used, call AI as before
    if (!usedTemplate) {
      try {
        const config = await AIService.generateBotConfigWithAI({
          env: c.env,
          prompt: bot_prompt,
          businessContext: finalContext,
          language: lang,
        });
        finalName = config.name;
        finalDesc = config.description;
        finalContext = config.business_context;
        if (!timezone && config.timezone) {
          finalTimezone = config.timezone;
        }
        suggestedCommands = config.commands || [];
        suggestedQuizzes = config.quizzes || [];
        suggestedApiIntegrations = config.apiIntegrations || [];
        suggestedScheduledBroadcasts = config.scheduledBroadcasts || [];
      } catch (e: any) {
        Logger.error("AI", `AI Bot Design failed: ${e.message}`, e);
        // Fallback to name/desc from body if AI fails
      }
    }
  }

  if (!finalName || !finalDesc) {
    return c.json({ error: "bad_request", reason: "missing_required_fields" }, 400);
  }

  // 1. PRE-TEST suggested API integrations with fallback mechanism
  const integrationMap = new Map<string, string>();
  const verifiedIntegrations: Array<{ integrationId: string, displayName: string, settings: any }> = [];
  const { executeCustomApiIntegration } = await import("../../integrations");

  for (let apiInt of suggestedApiIntegrations) {
    const sortedAlternatives = apiInt.alternatives.sort((a: any, b: any) => a.priority - b.priority);
    let successfulAlt = null;
    
    Logger.info("API", `[Bot Creation] Testing integration "${apiInt.displayName}" with ${sortedAlternatives.length} alternative(s)`);
    
    // Test each alternative
    for (const alt of sortedAlternatives) {
      try {
        Logger.info("API", `[Bot Creation] Testing "${apiInt.displayName}" (priority ${alt.priority})`, {
          apiUrl: alt.apiUrl,
          httpMethod: alt.httpMethod || "GET",
          authType: alt.authType || "none"
        });
        
        // Build test URL with default parameters from dynamicParams
        let testUrl = alt.apiUrl;
        
        if (alt.dynamicParams) {
          const defaultMatch = alt.dynamicParams.match(/[Dd]efault[^:]*:\s*([?&][^\s.]+)/);
          if (defaultMatch) {
            const defaultParams = defaultMatch[1];
            testUrl = alt.apiUrl + defaultParams;
            Logger.info("API", `[Bot Creation] Using default params: ${defaultParams}`);
          }
        }
        
        // Test with 5s timeout
        const testRes = await executeCustomApiIntegration(c.env, {
          apiUrl: testUrl,
          httpMethod: alt.httpMethod || "GET",
          authType: alt.authType || "none",
          authToken: "",
          requestBody: "",
        }, 5000);
        
        if (testRes) {
          Logger.info("API", `[Bot Creation] ✓ Integration "${apiInt.displayName}" working (priority ${alt.priority})`);
          successfulAlt = alt;
          break;  // Found working API, stop
        }
      } catch (e: any) {
        Logger.warn("API", `[Bot Creation] ✗ Alternative ${alt.priority} failed for "${apiInt.displayName}"`, {
          url: alt.apiUrl,
          error: e.message
        });
        continue;
      }
    }
    
    if (successfulAlt) {
      // ✅ Create integration in DB with ONLY the single working URL
      const integrationId = crypto.randomUUID();
      const settings = {
        apiUrl: successfulAlt.apiUrl,        // Single URL only
        httpMethod: successfulAlt.httpMethod || "GET",
        authType: successfulAlt.authType || "none",
        authToken: "",
        requestBody: "",
        dynamicParams: successfulAlt.dynamicParams,
        aiPrompt: apiInt.aiPrompt || "",
      };
      
      verifiedIntegrations.push({
        integrationId,
        displayName: apiInt.displayName,
        settings
      });
      
      integrationMap.set(apiInt.displayName, integrationId);
      
      Logger.info("API", `[Bot Creation] ✅ Successfully added integration: ${apiInt.displayName}`, {
        finalUrl: successfulAlt.apiUrl,
        priority: successfulAlt.priority
      });
    } else {
      Logger.warn("API", `[Bot Creation] ✗ All ${sortedAlternatives.length} alternative(s) failed for "${apiInt.displayName}", skipping integration`);
    }
  }

  const botProjectId = crypto.randomUUID();
  const webhookSecret = crypto.randomUUID();
  const webhookHeaderSecret = crypto.randomUUID();

  const dek = new Uint8Array(32);
  crypto.getRandomValues(dek);
  const wrapped = await wrapDekWithKek({ dekRaw: dek, kekBase64: c.env.KEK_MASTER_KEY });
  const encToken = await encryptWithDek({ dekRaw: dek, plaintext: bot_token });

  await dbRun(
    c.env.DB,
    `INSERT INTO bot_projects (id, owner_user_id, status, bot_telegram_id, bot_username, default_language, name, description, website_urls, business_context, timezone, type, webhook_secret, webhook_header_secret, created_at, updated_at) VALUES (?, ?, 'active', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [botProjectId, userId, childBotId, childBotUsername, lang, finalName.trim(), finalDesc.trim(), Array.isArray(website_urls) ? JSON.stringify(website_urls) : null, finalContext || null, finalTimezone, botType, webhookSecret, webhookHeaderSecret, nowMs(), nowMs()]
  );

  await dbRun(c.env.DB, "INSERT INTO bot_keys (bot_project_id, dek_wrapped_b64, dek_wrap_iv_b64, dek_version, kek_version, created_at) VALUES (?, ?, ?, ?, ?, ?)", [botProjectId, wrapped.dekWrappedB64, wrapped.dekWrapIvB64, 1, c.env.KEK_VERSION || "v1", nowMs()]);
  await dbRun(c.env.DB, "INSERT INTO bot_tokens (bot_project_id, token_ciphertext_b64, token_iv_b64, token_version, created_at) VALUES (?, ?, ?, ?, ?)", [botProjectId, encToken.ciphertextB64, encToken.ivB64, 1, nowMs()]);

  if (botType === "assistant") {
    await dbRun(c.env.DB, "INSERT INTO bot_prompts (bot_project_id, system_prompt, default_prompt, moderation_prompt, updated_at) VALUES (?, ?, ?, ?, ?)", [botProjectId, DEFAULT_PROMPTS.system, DEFAULT_PROMPTS.bot, DEFAULT_PROMPTS.moderation, nowMs()]);
  } else {
    await dbRun(c.env.DB, "INSERT INTO bot_prompts (bot_project_id, system_prompt, default_prompt, moderation_prompt, updated_at) VALUES (?, ?, ?, ?, ?)", [botProjectId, "", "", "", nowMs()]);
  }

  // 2. Create verified integrations
  for (const vi of verifiedIntegrations) {
    await dbRun(
      c.env.DB,
      "INSERT INTO bot_integrations (id, bot_project_id, integration_type, display_name, status, settings_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [vi.integrationId, botProjectId, "custom_api", vi.displayName, "active", JSON.stringify(vi.settings), nowMs(), nowMs()]
    );
  }

  // 3. Create suggested quizzes and get their IDs
  const quizMap = new Map<string, string>();
  for (const suggestedQuiz of suggestedQuizzes) {
    const quizSetId = crypto.randomUUID();
    await dbRun(
      c.env.DB,
      "INSERT INTO quiz_sets (id, bot_project_id, title, language, parent_quiz_set_id, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      [quizSetId, botProjectId, suggestedQuiz.title, lang, null, nowMs()],
    );
    for (let i = 0; i < suggestedQuiz.items.length; i++) {
      const item = suggestedQuiz.items[i];
      await dbRun(
        c.env.DB,
        "INSERT INTO quiz_items (id, quiz_set_id, position, question, options_json, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        [crypto.randomUUID(), quizSetId, i, item.question, JSON.stringify(item.options), nowMs()],
      );
    }
    quizMap.set(suggestedQuiz.title, quizSetId);
  }

  // 2. Validate command and broadcast references BEFORE creating them (referential integrity)
  for (const cmd of suggestedCommands) {
    if (cmd.integrationDisplayName && !integrationMap.has(cmd.integrationDisplayName)) {
      Logger.warn("API", `[Bot Creation] Command "${cmd.command}" references non-existent integration "${cmd.integrationDisplayName}", removing reference`);
      delete cmd.integrationDisplayName;
    }
  }
  
  for (const broadcast of suggestedScheduledBroadcasts) {
    if (broadcast.integrationDisplayName && !integrationMap.has(broadcast.integrationDisplayName)) {
      Logger.warn("API", `[Bot Creation] Broadcast references non-existent integration "${broadcast.integrationDisplayName}", removing reference`);
      delete broadcast.integrationDisplayName;
    }
  }
  
  Logger.info("API", `[Bot Creation] Referential integrity check complete`);

  // 3. Create suggested commands and link to integrations & quizzes if applicable
  const existingCommands = new Set(suggestedCommands.map(c => c.command.toLowerCase().replace(/^\//, "")));
  
  // Ensure /start is always present if not suggested
  if (!existingCommands.has("start")) {
    suggestedCommands.unshift({
      command: "start",
      description: "Start the bot",
      ai_instructions: "Welcome the user and introduce yourself."
    });
  }

  for (const cmd of suggestedCommands) {
    const cmdId = crypto.randomUUID();
    const cmdName = cmd.command.toLowerCase().replace(/^\//, "").replace(/[^a-z0-9_]/g, "_").slice(0, 32);
    const integrationId = cmd.integrationDisplayName ? integrationMap.get(cmd.integrationDisplayName) : null;
    
    // Link to quizzes by title
    const linkedQuizIds: string[] = [];
    if (cmd.quizTitles && Array.isArray(cmd.quizTitles)) {
      for (const title of cmd.quizTitles) {
        const qid = quizMap.get(title);
        if (qid) linkedQuizIds.push(qid);
      }
    }

    await dbRun(
      c.env.DB,
      "INSERT INTO bot_commands (id, bot_project_id, command, description, show_in_menu, integration_id, ai_instructions, quiz_set_ids_json, use_quiz_results, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [
        cmdId, 
        botProjectId, 
        cmdName, 
        cmd.description, 
        1, 
        integrationId || null, 
        cmd.ai_instructions || null, 
        JSON.stringify(linkedQuizIds),
        cmd.use_quiz_results !== false ? 1 : 0, // default to 1 (true)
        nowMs(), 
        nowMs()
      ]
    );
  }

  // 4. Create suggested scheduled broadcasts
  for (const b of suggestedScheduledBroadcasts) {
    const broadcastId = crypto.randomUUID();
    const integrationId = b.integrationDisplayName ? integrationMap.get(b.integrationDisplayName) : null;
    
    // Link to quizzes by title if suggested
    const linkedQuizIds: string[] = [];
    if (b.quizTitles && Array.isArray(b.quizTitles)) {
      for (const title of b.quizTitles) {
        const qid = quizMap.get(title);
        if (qid) linkedQuizIds.push(qid);
      }
    }

    await dbRun(
      c.env.DB,
      "INSERT INTO scheduled_broadcasts (id, bot_project_id, enabled, use_quiz_results, quiz_set_ids_json, pre_prompt, send_time_hour, sentence_count, integration_id, created_at, updated_at) VALUES (?, ?, 1, 1, ?, ?, ?, ?, ?, ?, ?)",
      [
        broadcastId, 
        botProjectId, 
        JSON.stringify(linkedQuizIds), 
        b.prePrompt, 
        typeof b.sendTimeHour === 'number' ? Math.max(0, Math.min(23, b.sendTimeHour)) : 9, 
        b.sentenceCount || 3, 
        integrationId || null, 
        nowMs(), 
        nowMs()
      ]
    );
  }

  // Move heavy asset generation and Telegram sync to background
  const performBackgroundSync = async () => {
    // 1. CRITICAL SYNC: Webhook, Commands, and Metadata first
    try {
      // 1.1. Set Webhook (Most important for responsiveness)
      const webhookUrl = `${c.env.PUBLIC_BASE_URL.replace(/\/$/, "")}/webhooks/child/${webhookSecret}`;
      const webhookRes = await tgApi(bot_token, "setWebhook", { 
        url: webhookUrl, 
        secret_token: webhookHeaderSecret,
        allowed_updates: ["message", "callback_query", "edited_message"]
      });
      
      if (!webhookRes.ok) {
        Logger.error("API", `[apiRouter.post(/me/bots)] Failed to set webhook: ${webhookRes.description}`);
      }

      // 1.2. Sync commands
      await BotService.syncTelegramCommandsForBot(c.env, botProjectId, bot_token);

      // 1.3. Sync metadata (Name, Description, About)
      await BotService.syncBotMetadata({
        token: bot_token,
        name: finalName.trim(),
        description: finalDesc.trim(),
      });

      // 1.4. Ensure no menu button is set for child bots (reset to default)
      await tgApi(bot_token, "setChatMenuButton", {
        menu_button: { type: "commands" }
      });
    } catch (e: any) {
      Logger.error("API", `[apiRouter.post(/me/bots)] Critical Telegram sync failed: ${e.message}`, e);
    }

    // 2. HEAVY SYNC: AI Assets (Avatar, Welcome Image)
    if (bot_prompt) {
      try {
        const avatarBuffer = await AIService.generateBotAvatarWithAI({
          env: c.env,
          botName: finalName,
          botDescription: finalDesc,
          businessContext: finalContext,
        });
        await BotAvatarService.updateBotPhoto(c.env, bot_token, avatarBuffer);

        // Generate welcome image
        const welcomeBuffer = await AIService.generateBotWelcomeImageWithAI({
          env: c.env,
          botName: finalName,
          botDescription: finalDesc,
          businessContext: finalContext,
        });

        // Send to owner to get a file_id (which we'll use in /start)
        const ownerTgId = await UserRepository.getTelegramUserIdByInternalId(c.env, userId);
        if (ownerTgId) {
          const welcomeRes = await tgSendPhoto({
            token: bot_token,
            chat_id: ownerTgId,
            photo: new Blob([welcomeBuffer], { type: "image/jpeg" }),
            caption: "Generated Welcome Image for your bot! (This will be used in /start)",
          });

          if (welcomeRes.ok) {
            // Telegram returns an array of photo sizes, we want the largest one's file_id
            const photoSizes = welcomeRes.result.photo;
            const largest = photoSizes[photoSizes.length - 1];
            await dbRun(c.env.DB, "UPDATE bot_projects SET welcome_image_url = ? WHERE id = ?", [largest.file_id, botProjectId]);
          }
        }
      } catch (e: any) {
        Logger.error("AI", `[apiRouter.post(/me/bots)] AI Asset generation failed: ${e.message}`, e);
      }
    }

    await BotRepository.invalidateBotConfigCache(c.env, botProjectId);
  };

  // Run in background if executionCtx is available (Cloudflare Workers)
  if (c.executionCtx) {
    c.executionCtx.waitUntil(performBackgroundSync());
  } else {
    // Fallback for environments without executionCtx
    performBackgroundSync().catch(e => Logger.error("API", `[apiRouter.post(/me/bots)] Background sync error: ${e.message}`, e));
  }

  return c.json({ ok: true, bot: { id: botProjectId, status: "active", bot_username: childBotUsername, default_language: lang, name: finalName.trim(), description: finalDesc.trim(), type: botType } });
});

apiRouter.post("/ai/analyze-business", async (c) => {
  const body = await c.req.json();
  const { urls, language } = body;
  if (!urls || !Array.isArray(urls)) return c.json({ error: "urls required" }, 400);
  
  try {
    const result = await AIService.analyzeBusinessFromUrls({
      env: c.env,
      urls,
      language: language || "en",
    });
    return c.json({ ok: true, ...result });
  } catch (e: any) {
    return c.json({ error: "analysis_failed", reason: e.message }, 500);
  }
});

apiRouter.post("/ai/analyze-prompt", async (c) => {
  const body = await c.req.json();
  const { prompt, business_context, language } = body;
  if (!prompt) return c.json({ error: "prompt required" }, 400);

  try {
    const config = await AIService.generateBotConfigWithAI({
      env: c.env,
      prompt,
      businessContext: business_context || "",
      language: language || "en",
    });

    // Validate API integrations with fallback testing
    const validatedIntegrations: any[] = [];
    if (config.apiIntegrations && config.apiIntegrations.length > 0) {
      const { executeCustomApiIntegration } = await import("../../integrations");
      
      Logger.info("API", `[analyze-prompt] Validating ${config.apiIntegrations.length} suggested integrations with fallback testing`);
      
      for (const integration of config.apiIntegrations) {
        let workingAlternative = null;
        
        // Sort alternatives by priority (1 = test first, 2 = test second, etc.)
        const sortedAlternatives = integration.alternatives.sort((a: any, b: any) => a.priority - b.priority);
        
        Logger.info("API", `[analyze-prompt] Testing integration "${integration.displayName}" with ${sortedAlternatives.length} alternative(s)`);
        
        // Test each alternative until we find one that works
        for (const alt of sortedAlternatives) {
          try {
            Logger.info("API", `[analyze-prompt] Testing "${integration.displayName}" (priority ${alt.priority})`, {
              apiUrl: alt.apiUrl,
              httpMethod: alt.httpMethod || "GET",
              authType: alt.authType || "none"
            });
            
            // Build test URL with default parameters from dynamicParams
            let testUrl = alt.apiUrl;
            
            if (alt.dynamicParams) {
              // Extract default parameters from dynamicParams instructions
              const defaultMatch = alt.dynamicParams.match(/[Dd]efault[^:]*:\s*([?&][^\s.]+)/);
              if (defaultMatch) {
                const defaultParams = defaultMatch[1];
                testUrl = alt.apiUrl + defaultParams;
                Logger.info("API", `[analyze-prompt] Using default params: ${defaultParams}`);
              } else {
                Logger.warn("API", `[analyze-prompt] No default params found in dynamicParams for priority ${alt.priority}`);
              }
            }
            
            // Test the API with 5s timeout
            const startTime = Date.now();
            const testRes = await executeCustomApiIntegration(c.env, {
              apiUrl: testUrl,
              httpMethod: alt.httpMethod || "GET",
              authType: alt.authType || "none",
              authToken: "",
              requestBody: "",
            }, 5000);
            const duration = Date.now() - startTime;
            
            if (testRes) {
              Logger.info("API", `[analyze-prompt] ✓ Integration "${integration.displayName}" working (priority ${alt.priority}, ${duration}ms)`, {
                url: testUrl,
                responseSize: JSON.stringify(testRes).length,
                responseSample: JSON.stringify(testRes).substring(0, 100)
              });
              
              workingAlternative = alt;
              break; // ✅ FOUND WORKING API - STOP TESTING, USE THIS ONE
            } else {
              Logger.warn("API", `[analyze-prompt] ✗ Alternative ${alt.priority} returned empty response for "${integration.displayName}"`);
            }
          } catch (e: any) {
            Logger.warn("API", `[analyze-prompt] ✗ Alternative ${alt.priority} failed for "${integration.displayName}"`, {
              url: alt.apiUrl,
              error: e.message
            });
            continue; // Try next alternative
          }
        }
        
        if (workingAlternative) {
          // ✅ Save ONLY the single working URL (flatten back to single API format)
          validatedIntegrations.push({
            displayName: integration.displayName,
            apiUrl: workingAlternative.apiUrl,           // Single URL
            httpMethod: workingAlternative.httpMethod,   // Single method
            authType: workingAlternative.authType,       // Single auth type
            dynamicParams: workingAlternative.dynamicParams,
            aiPrompt: integration.aiPrompt
          });
          Logger.info("API", `[analyze-prompt] ✅ Integration "${integration.displayName}" validated and saved`);
        } else {
          Logger.warn("API", `[analyze-prompt] ✗ All ${sortedAlternatives.length} alternative(s) failed for "${integration.displayName}", skipping integration`);
          // Integration is NOT added to validatedIntegrations (skipped)
        }
      }
      
      Logger.info("API", `[analyze-prompt] Validation complete: ${validatedIntegrations.length}/${config.apiIntegrations.length} integrations working`);
    }

    // Add post-validation for referential integrity
    const validIntegrationNames = new Set(validatedIntegrations.map((int: any) => int.displayName));
    
    // Clean up orphaned command references
    if (config.commands) {
      for (const cmd of config.commands) {
        if (cmd.integrationDisplayName && !validIntegrationNames.has(cmd.integrationDisplayName)) {
          Logger.warn("API", `[analyze-prompt] Command "${cmd.command}" references missing integration "${cmd.integrationDisplayName}", removing reference`);
          delete cmd.integrationDisplayName;
        }
      }
    }
    
    // Clean up orphaned broadcast references
    if (config.scheduledBroadcasts) {
      for (const broadcast of config.scheduledBroadcasts) {
        if (broadcast.integrationDisplayName && !validIntegrationNames.has(broadcast.integrationDisplayName)) {
          Logger.warn("API", `[analyze-prompt] Broadcast references missing integration "${broadcast.integrationDisplayName}", removing reference`);
          delete broadcast.integrationDisplayName;
        }
      }
    }
    
    Logger.info("API", `[analyze-prompt] Referential integrity check complete`);

    // Return config with only validated integrations
    const validatedConfig = {
      ...config,
      apiIntegrations: validatedIntegrations,
    };

    return c.json({ ok: true, config: validatedConfig });
  } catch (e: any) {
    return c.json({ error: "analysis_failed", reason: e.message }, 500);
  }
});

// Template storage endpoints
apiRouter.post("/ai/bot-template", async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json();
  const { originalPrompt, language, config } = body;

  if (!originalPrompt || !config) {
    return c.json({ error: "missing_required_fields" }, 400);
  }

  try {
    const template: BotCreationTemplate = {
      originalPrompt,
      language: language || "en",
      config,
      createdAt: Date.now(),
    };

    // Store in KV with 1 hour expiration
    await c.env.KV.put(
      `bot_template:${userId}`,
      JSON.stringify(template),
      { expirationTtl: 3600 } // 1 hour
    );

    return c.json({ ok: true });
  } catch (e: any) {
    Logger.error('API', `Failed to store bot template: ${e.message}`, e);
    return c.json({ error: "storage_failed", reason: e.message }, 500);
  }
});

apiRouter.delete("/ai/bot-template", async (c) => {
  const userId = c.get("userId");

  try {
    await c.env.KV.delete(`bot_template:${userId}`);
    return c.json({ ok: true });
  } catch (e: any) {
    Logger.error('API', `Failed to delete bot template: ${e.message}`, e);
    return c.json({ error: "deletion_failed", reason: e.message }, 500);
  }
});

// Sub-routes for bot management
apiRouter.route("/bots", botRoutes);
apiRouter.route("/bots", broadcastRoutes);
apiRouter.route("/bots", quizRoutes);
apiRouter.route("/bots", commandRoutes);
apiRouter.route("/bots", integrationRoutes);
apiRouter.route("/bots", actionRoutes);
apiRouter.route("/bots", workingHoursRoutes);
