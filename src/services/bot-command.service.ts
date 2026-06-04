import { Env } from "../config/env";
import { BotConfig, CommandContext } from "../types";
import { dbGet } from "../utils/db";
import { Logger } from "../utils/logger";
import { tgSendPhoto, tgSendMessage } from "../utils/telegram";
import { executeIntegration } from "../integrations";
import { processApiResponseWithAI } from "./api-integration.service";
import { IntegrationService } from "./integration.service";

export class BotCommandService {
  static async processCommand(params: {
    env: Env;
    cfg: BotConfig;
    token: string;
    chatId: string;
    userId: string;
    text: string;
    i18n: any;
    msg: any;
  }): Promise<CommandContext> {
    const { env, cfg, token, chatId, userId, text, i18n, msg } = params;
    const trimmed = text.trim();
    
    // Command detection
    const childCmd = trimmed.startsWith("/") ? trimmed.split(/\s+/)[0].split("@")[0].toLowerCase() : "";
    const cleanCmd = childCmd.replace(/^\//, "");
    
    if (!cleanCmd) {
      return { isCommand: false, commandName: null, customCommand: null, apiDataText: "", stopProcessing: false };
    }

    Logger.info('BOT', `Detected command: "${cleanCmd}"`);

    // 1. Built-in command: /start
    if (cleanCmd === "start") {
      if (cfg.welcomeImageUrl) {
        await tgSendPhoto({
          token,
          chat_id: chatId,
          photo: cfg.welcomeImageUrl,
          caption: i18n.t("child.start_msg", { botUsername: cfg.botUsername, name: cfg.name })
        });
      } else {
        await tgSendMessage({ token, chat_id: chatId, text: i18n.t("child.start_msg", { botUsername: cfg.botUsername, name: cfg.name }) });
      }
      return { isCommand: true, commandName: "start", customCommand: null, apiDataText: "", stopProcessing: true };
    }

    // 2. Custom database commands
    const customCommand = await dbGet<any>(
      env.DB, 
      "SELECT id, command, integration_id, ai_instructions, quiz_set_ids_json, use_quiz_results FROM bot_commands WHERE bot_project_id = ? AND (LOWER(command) = ? OR LOWER(command) = ?)", 
      [cfg.botProjectId, cleanCmd, `/${cleanCmd}`]
    );

    if (!customCommand) {
      Logger.warn('BOT', `Command "${cleanCmd}" not found in database for bot ${cfg.botProjectId}`);
      return { isCommand: true, commandName: cleanCmd, customCommand: null, apiDataText: "", stopProcessing: false };
    }

    Logger.info('BOT', `Found custom command: ${customCommand.command}, has integration: ${!!customCommand.integration_id}`);

    let apiDataText = "";
    if (customCommand.integration_id) {
      const integration = await dbGet<any>(
        env.DB, 
        "SELECT integration_type, display_name, settings_json, status, bot_project_id FROM bot_integrations WHERE id = ? AND status = 'active'", 
        [customCommand.integration_id]
      );

      if (integration?.integration_type === "custom_api") {
        apiDataText = await this.handleCustomApiIntegration(env, cfg, customCommand, integration, msg);
      } else if (integration) {
        Logger.info('BOT', `Non-custom_api integration (${integration.integration_type}), delegating to IntegrationService`);
        await IntegrationService.handleCommandWithIntegration({ 
          env, cfg, token, chatId, userId, 
          command: customCommand.command, 
          integrationId: customCommand.integration_id, 
          userMessage: trimmed, 
          i18n 
        });
        return { isCommand: true, commandName: cleanCmd, customCommand, apiDataText: "", stopProcessing: true };
      }
    }

    return { 
      isCommand: true, 
      commandName: cleanCmd, 
      customCommand, 
      apiDataText, 
      stopProcessing: false 
    };
  }

  private static async handleCustomApiIntegration(env: Env, cfg: BotConfig, customCommand: any, integration: any, msg: any): Promise<string> {
    try {
      const settings = integration.settings_json ? JSON.parse(String(integration.settings_json)) : {};
      const aiPrompt = settings.aiPrompt || "";
      
      // Get user's quiz results for dynamic URL construction
      const chatId = msg?.chat?.id ? String(msg.chat.id) : "";
      const userId = msg?.from?.id ? String(msg.from.id) : "";
      const quizAnswers = await this.loadUserQuizAnswers(env, cfg.botProjectId, chatId, userId, customCommand);
      
      const apiData = await executeIntegration(env, customCommand.integration_id, "fetch", { quizAnswers });
      if (!apiData) return "";

      const rawDataStr = typeof apiData === "string" ? apiData : JSON.stringify(apiData);
      
      if (aiPrompt) {
        const userLang = (msg?.from?.language_code || "en").split("-")[0];
        try {
          return await processApiResponseWithAI({
            env,
            apiResponse: apiData,
            aiPrompt,
            language: cfg.defaultLanguage === "auto" ? userLang : cfg.defaultLanguage,
          });
        } catch (aiError: any) {
          Logger.error('BOT', `AI processing failed, falling back to truncated raw data: ${aiError.message}`);
          return rawDataStr.length > 4000 ? rawDataStr.substring(0, 4000) + "\n...(truncated due to size)" : rawDataStr;
        }
      } else {
        if (rawDataStr.length > 5000) {
          Logger.warn('BOT', `API data too large (${rawDataStr.length} chars), truncating to 5000 chars.`);
          return rawDataStr.substring(0, 5000) + "\n...(truncated - configure AI Prompt in integration settings for better results)";
        }
        return rawDataStr;
      }
    } catch (e: any) {
      Logger.error('BOT', `Failed to fetch API data: ${e.message}`, e);
      return `[API temporarily unavailable: ${e.message}]`;
    }
  }

  private static async loadUserQuizAnswers(
    env: Env,
    botProjectId: string,
    chatId: string,
    userId: string,
    customCommand: any
  ): Promise<Array<{ quiz_set_id: string; question: string; answer: string; position?: number }>> {
    try {
      // Load user profile with quiz answers
      const profile = await env.DB.prepare(
        "SELECT profile_json FROM user_profiles WHERE bot_project_id = ? AND chat_id = ? AND user_id = ?"
      )
        .bind(botProjectId, chatId, userId)
        .first<{ profile_json: string }>();

      if (!profile?.profile_json) {
        Logger.debug('BOT', `[loadUserQuizAnswers] No profile found for user ${userId}`);
        return [];
      }

      const profileObj = JSON.parse(String(profile.profile_json));
      let answers = Array.isArray(profileObj?.quiz_answers) ? profileObj.quiz_answers : [];

      // Filter by command's quiz set IDs if specified
      if (customCommand?.quiz_set_ids_json) {
        const allowed = JSON.parse(customCommand.quiz_set_ids_json);
        if (Array.isArray(allowed) && allowed.length > 0) {
          answers = answers.filter((a: any) =>
            allowed.includes(a.quiz_set_id) ||
            (a.quiz_set_id_parent && allowed.includes(a.quiz_set_id_parent))
          );
        }
      }

      Logger.info('BOT', `[loadUserQuizAnswers] Loaded ${answers.length} quiz answers for user ${userId}`);
      return answers;
    } catch (error: any) {
      Logger.error('BOT', `[loadUserQuizAnswers] Failed to load quiz answers: ${error.message}`);
      return [];
    }
  }
}
