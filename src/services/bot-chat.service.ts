import { Env } from "../config/env";
import { BotConfig, CommandContext } from "../types";
import { dbGet, dbAll } from "../utils/db";
import { Logger } from "../utils/logger";
import { tgSendChatAction, tgSendMessage } from "../utils/telegram";
import { OpenAIChatMessage } from "../utils/openai";
import { BotConfigService } from "./bot-config.service";
import { MessageRepository } from "../repositories/message.repository";
import { QuizService } from "./quiz.service";
import { StreamingService } from "./streaming.service";
import { getLanguageName } from "../utils/language";

export class BotChatService {
  static async processChat(params: {
    env: Env;
    cfg: BotConfig;
    token: string;
    chatId: string;
    userId: string;
    text: string;
    i18n: any;
    msg: any;
    cmdCtx: CommandContext;
    replyToMessageId?: number;
  }): Promise<void> {
    const { env, cfg, token, chatId, userId, text, i18n, msg, cmdCtx, replyToMessageId } = params;

    const chatType = msg?.chat?.type || "private";

    // 1. Load context (profile, history, summary) - only for private chats
    const profileRow = await dbGet<any>(env.DB, "SELECT profile_json FROM user_profiles WHERE bot_project_id = ? AND chat_id = ? AND user_id = ?", [cfg.botProjectId, chatId, userId]);
    const profileJson = profileRow ? String(profileRow.profile_json) : "{}";
    
    const quizAnswersText = this.buildQuizAnswersText(profileJson, cmdCtx);
    
    // Only load history for private chats (where we store messages)
    const history = chatType === "private" 
      ? await this.loadHistory(env, cfg.botProjectId, chatId)
      : [];
    const summary = chatType === "private"
      ? await this.loadSummary(env, cfg.botProjectId, chatId)
      : "";
    
    // 2. Build tools
    const tools = await this.buildTools(env, cfg, cmdCtx);
    
    // 3. Build system prompt
    const userLang = (msg?.from?.language_code || "en").split("-")[0];
    const systemPrompt = await this.buildSystemPrompt({
      cfg,
      env,
      cmdCtx,
      quizAnswersText,
      profileJson,
      summary,
      userLang
    });

    // 4. Call AI
    await tgSendChatAction({ token, chat_id: chatId, action: "typing" });

    const isApiCommand = !!(cmdCtx.customCommand && cmdCtx.apiDataText);
    const messages: OpenAIChatMessage[] = isApiCommand 
      ? [{ role: "system" as const, content: systemPrompt }]
      : [
          { role: "system" as const, content: systemPrompt },
          ...history
        ];

    let responseText = "";
    try {
      const chat = await StreamingService.sendStreamingResponse({
        env,
        token,
        chatId,
        apiKey: env.OPENAI_API_KEY,
        model: "gpt-4o-mini",
        messages,
        tools: tools.length ? tools : undefined,
        maxOutputTokens: 600,
        replyToMessageId
      });

      responseText = chat.text || "I'm sorry, I couldn't process that.";
      
      if (chat.tool_calls && chat.tool_calls.length > 0) {
        for (const toolCall of chat.tool_calls) {
          if (toolCall.function?.name === "start_quiz") {
            await QuizService.handleQuizStart({ env, cfg, token, chatId, userId, i18n });
          }
        }
      }
    } catch (e: any) {
      Logger.error('BOT', `StreamingService failed: ${e.message}`, e);
      responseText = "I'm sorry, I'm having trouble thinking right now. Please try again later.";
      await tgSendMessage({ token, chat_id: chatId, text: responseText });
    }

    // 5. Post-process - store bot response (only for private chats)
    if (chatType === "private") {
      await MessageRepository.storeMessage({ 
        env, 
        botProjectId: cfg.botProjectId, 
        chatId, 
        userId: null, 
        messageId: null, 
        direction: "out", 
        text: responseText, 
        languageCode: null, 
        mediaJson: null 
      });
    }
    
    await QuizService.handleQuizProceed({ env, cfg, token, chatId, userId });
  }

  private static buildQuizAnswersText(profileJson: string, cmdCtx: CommandContext): string {
    try {
      // 1. Check if quiz results are disabled for this command
      if (cmdCtx.customCommand && cmdCtx.customCommand.use_quiz_results === 0) {
        return "";
      }

      const profileObj = JSON.parse(profileJson);
      let answers = Array.isArray(profileObj?.quiz_answers) ? profileObj.quiz_answers : [];
      
      if (cmdCtx.customCommand?.quiz_set_ids_json) {
        const allowed = JSON.parse(cmdCtx.customCommand.quiz_set_ids_json);
        if (Array.isArray(allowed)) {
          // If the list is NOT empty, we filter to ONLY those quizzes.
          // If the list IS empty, we use NO quiz data for this command.
          if (allowed.length === 0) {
            return "";
          }
          answers = answers.filter((a: any) => 
            allowed.includes(a.quiz_set_id) || 
            (a.quiz_set_id_parent && allowed.includes(a.quiz_set_id_parent))
          );
        }
      } else {
        // For generic chat (not a custom command with quiz settings), 
        // we might want to use all available quiz data.
      }
      
      if (answers.length) {
        return "User Quiz Results (use this context if relevant):\n" + answers.map((a: any) => `- ${a.question}: ${a.answer}`).join("\n");
      }
    } catch (e: any) {
      Logger.error('BOT', `Error building quiz answers text: ${e.message}`);
    }
    return "";
  }

  private static async loadHistory(env: Env, botProjectId: string, chatId: string): Promise<OpenAIChatMessage[]> {
    const recent = await dbAll<any>(env.DB, "SELECT direction, text FROM messages WHERE bot_project_id = ? AND chat_id = ? AND text IS NOT NULL ORDER BY created_at DESC LIMIT 20", [botProjectId, chatId]);
    return recent.reverse().map(r => ({ 
      role: (r.direction === "in" ? "user" : "assistant") as "user" | "assistant", 
      content: String(r.text) 
    }));
  }

  private static async loadSummary(env: Env, botProjectId: string, chatId: string): Promise<string> {
    const summaryRow = await dbGet<any>(env.DB, "SELECT summary_text FROM conversation_summaries WHERE bot_project_id = ? AND chat_id = ?", [botProjectId, chatId]);
    return summaryRow ? String(summaryRow.summary_text) : "";
  }

  private static async buildTools(env: Env, cfg: BotConfig, cmdCtx: CommandContext): Promise<any[]> {
    const tools: any[] = [];
    
    // Disable tools during custom command execution to focus AI
    if (cmdCtx.isCommand && cmdCtx.customCommand) return tools;

    const calendarIntegration = await dbGet<any>(env.DB, "SELECT id FROM bot_integrations WHERE bot_project_id = ? AND integration_type = 'google_calendar' AND status = 'active'", [cfg.botProjectId]);
    if (calendarIntegration) {
      tools.push({ type: "function", function: { name: "get_available_slots", description: "Get available appointment slots", parameters: { type: "object", properties: { date: { type: "string" }, duration: { type: "number" }, nearest: { type: "boolean" } } } } });
      tools.push({ type: "function", function: { name: "create_appointment", description: "Create a calendar appointment", parameters: { type: "object", properties: { summary: { type: "string" }, description: { type: "string" }, date: { type: "string" }, startTime: { type: "string" }, duration: { type: "number" } }, required: ["summary", "date", "startTime"] } } });
    }

    if (cfg.quizSetIds && cfg.quizSetIds.length > 0) {
      tools.push({
        type: "function",
        function: {
          name: "start_quiz",
          description: "Start a quiz to collect information from the user. Use this when you need to learn more about the user's needs or if they explicitly ask for a quiz.",
          parameters: { type: "object", properties: {} }
        }
      });
    }

    return tools;
  }

  private static async buildSystemPrompt(params: {
    cfg: BotConfig;
    env: Env;
    cmdCtx: CommandContext;
    quizAnswersText: string;
    profileJson: string;
    summary: string;
    userLang: string;
  }): Promise<string> {
    const { cfg, env, cmdCtx, quizAnswersText, profileJson, summary, userLang } = params;
    const langName = getLanguageName(cfg.defaultLanguage === "auto" ? userLang : cfg.defaultLanguage);
    const date = new Date().toISOString().split('T')[0];

    // Truncate API data if needed
    let apiDataForPrompt = "";
    if (cmdCtx.apiDataText) {
      const maxApiDataChars = 10000;
      apiDataForPrompt = cmdCtx.apiDataText.length > maxApiDataChars 
        ? cmdCtx.apiDataText.substring(0, maxApiDataChars) + "\n\n...(data truncated due to size limits)" 
        : cmdCtx.apiDataText;
    }

    const isApiCommand = !!(cmdCtx.customCommand && apiDataForPrompt);

    if (isApiCommand) {
      return [
        `ROLE: News/Content Provider for "${cfg.name}"`,
        `CURRENT TASK: The user just executed a command to get information. Your job is to provide them with relevant content based on the data below.`,
        `DATE: ${date}`,
        `DATA SOURCE (Use this to generate your response):\n${apiDataForPrompt}`,
        cmdCtx.customCommand?.ai_instructions ? `INSTRUCTIONS:\n${cmdCtx.customCommand.ai_instructions}` : "",
        quizAnswersText ? `USER PREFERENCES:\n${quizAnswersText}` : "",
        `LANGUAGE: ${langName}. IMPORTANT: Your response MUST be in this language.`,
        `IMPORTANT: Respond directly with the content. DO NOT say you cannot execute commands or ask what they want. Use the data above to provide a helpful response based on the instructions.`
      ].filter(Boolean).join("\n\n");
    }

    return [
      `ROLE: Professional Manager of "${cfg.name}"`,
      `GOAL: Increase revenue, help users.`,
      `DATE: ${date}`,
      BotConfigService.buildTopicInjection(cfg),
      quizAnswersText,
      apiDataForPrompt ? `PRIMARY SOURCE DATA FROM API (Use this for news/content):\n${apiDataForPrompt}` : "",
      cmdCtx.customCommand?.ai_instructions ? `COMMAND SPECIFIC INSTRUCTIONS:\n${cmdCtx.customCommand.ai_instructions}` : "",
      cfg.systemPrompt,
      `LANGUAGE: ${langName}. IMPORTANT: All your replies MUST be strictly in this language.`,
      await BotConfigService.buildCommandsInjection(env, cfg.botProjectId),
      cfg.moderationPrompt,
      cfg.defaultPrompt,
      `Profile: ${profileJson}`,
      summary ? `Summary: ${summary}` : ""
    ].filter(Boolean).join("\n\n");
  }
}
