import { Env } from "../config/env";
import { openaiChat, OpenAIChatMessage, openaiGenerateImage } from "../utils/openai";
import { getLanguageName } from "../utils/language";
import { initI18n } from "../utils/i18n";
import { Logger } from "../utils/logger";

export class AIService {
  static async generateBotAvatarWithAI(params: {
    env: Env;
    botName: string;
    botDescription: string;
    businessContext?: string;
  }): Promise<ArrayBuffer> {
    const { env, botName, botDescription, businessContext } = params;

    // First, use LLM to generate a specialized visual prompt for DALL-E 3
    const visualSystemPrompt = `You are a creative director and prompt engineer. 
Your task is to create a highly detailed, professional, and visually appealing prompt for DALL-E 3 to generate a Telegram bot profile picture (avatar).
The avatar should be iconic, modern, and perfectly represent the bot's identity and purpose.

GUIDELINES:
- Output ONLY the prompt text. No extra text, no "Prompt:", no quotes.
- Focus on a single, clear subject or iconic symbol.
- Use a clean, modern style (e.g., 3D isometric, minimalistic vector, or elegant glassy design).
- Specify lighting, materials, and a professional color palette.
- STRICT RULE: NO TEXT OR LETTERS in the image.
- Background should be simple, a subtle gradient or a clean solid color.
- Ensure it's suitable for a small circular or square mobile app icon.`;

    const userContext = `Bot Name: ${botName}\nBot Description: ${botDescription}\nBusiness Context: ${businessContext || "General service"}`;
    
    const promptGeneration = await openaiChat({
      apiKey: env.OPENAI_API_KEY,
      model: "gpt-4o",
      messages: [
        { role: "system", content: visualSystemPrompt },
        { role: "user", content: `Generate a visual prompt for an avatar based on this bot:\n${userContext}` }
      ],
      maxOutputTokens: 200,
    });

    const visualPrompt = promptGeneration.text.trim();

    const { url } = await openaiGenerateImage({
      apiKey: env.OPENAI_API_KEY,
      prompt: visualPrompt,
      model: "dall-e-3",
      size: "1024x1024",
      quality: "standard",
    });

    const response = await fetch(url);
    if (!response.ok) throw new Error("Failed to download generated image");
    return await response.arrayBuffer();
  }

  static async generateBotWelcomeImageWithAI(params: {
    env: Env;
    botName: string;
    botDescription: string;
    businessContext?: string;
  }): Promise<ArrayBuffer> {
    const { env, botName, botDescription, businessContext } = params;

    // Use LLM to generate a specialized visual prompt for a welcome image
    const visualSystemPrompt = `You are a creative director. 
Your task is to create a detailed, welcoming, and high-quality prompt for DALL-E 3 to generate a "Welcome" or "Hero" image for a Telegram bot.
The image should be horizontally oriented (landscape), professional, and inviting.

GUIDELINES:
- Output ONLY the prompt text.
- Focus on a welcoming scene or a symbolic hero image that represents the bot's service.
- Use a warm, professional, and friendly style.
- Specify lighting and a clean composition.
- STRICT RULE: NO TEXT OR LETTERS in the image.
- Ensure the image feels like a high-end brand asset.`;

    const userContext = `Bot Name: ${botName}\nBot Description: ${botDescription}\nBusiness Context: ${businessContext || "General service"}`;
    
    const promptGeneration = await openaiChat({
      apiKey: env.OPENAI_API_KEY,
      model: "gpt-4o",
      messages: [
        { role: "system", content: visualSystemPrompt },
        { role: "user", content: `Generate a visual prompt for a welcome hero image based on this bot:\n${userContext}` }
      ],
      maxOutputTokens: 200,
    });

    const visualPrompt = promptGeneration.text.trim();

    const { url } = await openaiGenerateImage({
      apiKey: env.OPENAI_API_KEY,
      prompt: visualPrompt,
      model: "dall-e-3",
      size: "1024x1024", // DALL-E 3 only supports square or specific wide/tall sizes, we'll stick to square or wide if supported
      quality: "standard",
    });

    const response = await fetch(url);
    if (!response.ok) throw new Error("Failed to download generated welcome image");
    return await response.arrayBuffer();
  }

  static async generateQuizSetWithAI(params: {
    env: Env;
    botId: string;
    count: number;
    theme: string;
    dataToCollect: string;
    language: string;
  }): Promise<{
    title: string;
    items: Array<{ question: string; options: Array<{ key: string; label: string }> }>;
  }> {
    const languageName = getLanguageName(params.language);
    const system: OpenAIChatMessage = {
      role: "system",
      content: `You generate preference quizzes for Telegram bots. 
Output ONLY valid JSON. No markdown. No extra text.
IMPORTANT: The entire quiz (title, questions, and labels) MUST be strictly in ${languageName} language.`,
    };
    const user: OpenAIChatMessage = {
      role: "user",
      content: JSON.stringify({
        task: "Generate a custom preference quiz.",
        theme: params.theme,
        dataToCollect: params.dataToCollect,
        language: languageName,
        strictly_follow_language: true,
        requirements: {
          questionCount: params.count,
          optionCountRange: [2, 5],
          mustIncludeSkip: true,
          noCorrectAnswers: true,
          atomicQuestions: "Generate one question for each specific item to collect. One answer per question.",
        },
        outputSchema: {
          title: "string (e.g. 'Nutrition Preferences')",
          items: [
            {
              question: "string",
              options: [{ key: "string", label: "string" }],
            },
          ],
        },
      }),
    };

    const chat = await openaiChat({
      apiKey: params.env.OPENAI_API_KEY,
      model: "gpt-4o-mini",
      messages: [system, user],
      maxOutputTokens: 2000,
    });

    try {
      return this.parseAIJson(chat.text);
    } catch (e: any) {
      Logger.error('AI', `AI Quiz generation JSON parse error text=${chat.text} error=${e.message || e}`);
      throw new Error("Failed to generate quiz: invalid AI response");
    }
  }

  static async translateQuizItemWithAI(params: {
    env: Env;
    item: { question: string; options: Array<{ key: string; label: string }> };
    targetLanguage: string;
  }): Promise<{ question: string; options: Array<{ key: string; label: string }> }> {
    const languageName = getLanguageName(params.targetLanguage);
    const system: OpenAIChatMessage = {
      role: "system",
      content: `You translate quiz items for Telegram bots. 
Output ONLY valid JSON. No markdown. No extra text.
IMPORTANT: The entire quiz item (question and labels) MUST be strictly translated into ${languageName} language.
The "key" fields MUST remain EXACTLY the same as in the original.`,
    };
    const user: OpenAIChatMessage = {
      role: "user",
      content: JSON.stringify({
        task: "Translate a quiz item.",
        item: params.item,
        targetLanguage: languageName,
        strictly_follow_language: true,
      }),
    };

    const chat = await openaiChat({
      apiKey: params.env.OPENAI_API_KEY,
      model: "gpt-4o-mini",
      messages: [system, user],
      maxOutputTokens: 1000,
    });

    try {
      return this.parseAIJson(chat.text);
    } catch (e: any) {
      Logger.error('AI', `AI Quiz item translation JSON parse error text=${chat.text} error=${e.message || e}`);
      throw new Error("Failed to translate quiz item: invalid AI response");
    }
  }

  static async translateQuizSetWithAI(params: {
    env: Env;
    title: string;
    items: Array<{ question: string; options: Array<{ key: string; label: string }> }>;
    targetLanguage: string;
  }): Promise<{ title: string; items: Array<{ question: string; options: Array<{ key: string; label: string }> }> }> {
    const languageName = getLanguageName(params.targetLanguage);
    const system: OpenAIChatMessage = {
      role: "system",
      content: `You translate entire preference quizzes for Telegram bots. 
Output ONLY valid JSON. No markdown. No extra text.
IMPORTANT: The entire quiz (title, all questions, and all labels) MUST be strictly translated into ${languageName} language.
The "key" fields MUST remain EXACTLY the same as in the original.
Ensure the number of questions and the order of options matches the original exactly.`,
    };
    const user: OpenAIChatMessage = {
      role: "user",
      content: JSON.stringify({
        task: "Translate a quiz set.",
        title: params.title,
        items: params.items,
        targetLanguage: languageName,
        strictly_follow_language: true,
      }),
    };

    const chat = await openaiChat({
      apiKey: params.env.OPENAI_API_KEY,
      model: "gpt-4o-mini",
      messages: [system, user],
      maxOutputTokens: 2500,
    });

    try {
      const parsed = JSON.parse(chat.text);
      if (!parsed.title || !Array.isArray(parsed.items)) throw new Error("Invalid translation response");
      return parsed;
    } catch (e: any) {
      Logger.error('AI', `AI Quiz set translation JSON parse error text=${chat.text} error=${e.message || e}`);
      throw new Error("Failed to translate quiz set: invalid AI response");
    }
  }

  static async analyzeBusinessFromUrls(params: {
    env: Env;
    urls: string[];
    language: string;
  }): Promise<{
    name: string;
    description: string;
    business_context: string;
  }> {
    const { env, urls, language } = params;
    const languageName = getLanguageName(language);

    const contents: string[] = [];
    for (const url of urls.slice(0, 3)) {
      try {
        const res = await fetch(url, {
          headers: { "User-Agent": "AI-Parent-Bot-Scanner/1.0" },
          cf: { cacheTtl: 3600 },
        } as any);
        if (res.ok) {
          let text = await res.text();
          text = text.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "");
          text = text.replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, "");
          text = text.replace(/<[^>]*>/g, " ");
          text = text.replace(/\s+/g, " ").trim();
          contents.push(`URL: ${url}\nCONTENT: ${text.slice(0, 3000)}`);
        }
      } catch (e: any) {
        Logger.error('AI', `Failed to fetch ${url}: ${e.message || e}`);
      }
    }

    if (contents.length === 0) {
      throw new Error("Could not fetch content from any of the provided URLs.");
    }

    const systemPrompt = `You are a business analyst. Analyze the following website content and extract detailed information about the business.
Your goal is to provide a concise name and a short description for an AI-powered Telegram bot that will act as a professional manager for this business.
Also, provide a "business_context" which is a deep, structured summary of what the business does, its values, products/services, and target audience. Include key selling points and how a manager should represent the company to potential customers.

Output ONLY valid JSON in this format:
{
  "name": "Short catchy name",
  "description": "1-2 sentence description of what the bot does for this business",
  "business_context": "Deep detailed analysis for future AI use"
}

IMPORTANT: The name and description MUST be in ${languageName} language. The business_context should be in English for better internal AI use.`;

    const userPrompt = `Website contents:\n\n${contents.join("\n\n---\n\n")}`;

    const chat = await openaiChat({
      apiKey: env.OPENAI_API_KEY,
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      maxOutputTokens: 1500,
    });

    try {
      return this.parseAIJson(chat.text);
    } catch (e: any) {
      Logger.error('AI', `AI business analysis JSON parse error text=${chat.text} error=${e.message || e}`);
      throw new Error("Failed to analyze business: invalid AI response");
    }
  }

  static async generateBotConfigWithAI(params: {
    env: Env;
    prompt: string;
    businessContext?: string;
    language: string;
  }): Promise<{
    name: string;
    description: string;
    business_context: string;
    timezone?: string;
    commands: Array<{
      command: string;
      description: string;
      ai_instructions: string;
      integrationDisplayName?: string;
      use_quiz_results?: boolean;
      quizTitles?: string[];
    }>;
    quizzes?: Array<{
      title: string;
      items: Array<{
        question: string;
        options: Array<{ key: string; label: string }>;
      }>;
    }>;
    apiIntegrations?: Array<{
      displayName: string;
      alternatives: Array<{
        apiUrl: string;
        httpMethod: "GET" | "POST";
        authType: "none" | "bearer" | "api_key";
        dynamicParams?: string;
        priority: number;
      }>;
      aiPrompt: string;
    }>;
    scheduledBroadcasts?: Array<{
      sendTimeHour: number;
      prePrompt: string;
      integrationDisplayName?: string;
      sentenceCount?: number;
      quizTitles?: string[];
    }>;
  }> {
    const { env, prompt, businessContext, language } = params;
    const languageName = getLanguageName(language);

    const systemPrompt = `You are an expert AI Bot Architect. Your goal is to design a professional Telegram bot based on a user's prompt and optional business context.
The bot will act as a manager for a business or a personal assistant.

You must decide:
1. Bot Name: Catchy and professional (max 64 chars).
2. Bot Description: Short and clear (max 120 chars).
3. Business Context: A deep summary of how the bot should behave, its knowledge, and how it handles users. If businessContext is provided, use it as a base.
4. Commands: A set of Telegram commands (e.g., /start, /help, /book, /menu). For each command, provide its description and specific AI instructions on how to handle it.
5. Quizzes (optional): A list of preference quizzes to collect user data. You can create MULTIPLE quizzes if the user mentions different topics or needs (e.g., "Nutrition Preferences", "Training Goals"). Each quiz should have up to 5-8 questions.
   CRITICAL QUIZ RULES:
   - ONE ANSWER PER QUESTION: Each question must collect exactly ONE piece of information.
   - ATOMIC QUESTIONS: If you need to collect multiple items (e.g., 3 specific user preferences), generate 3 SEPARATE questions, each with its own set of multiple-choice answers.
   - NO MULTI-SELECT: Users can only pick one option per question. Design questions accordingly.
6. API Integrations (optional): If the user mentions external data sources, APIs, or needs to fetch data from external services, suggest API integrations.
   
   🔴 CRITICAL: MULTI-API FALLBACK SYSTEM 🔴
   - For EACH integration, provide 2-3 ALTERNATIVE working API URLs ordered by reliability
   - The server will test them in priority order (1 = best, 2 = fallback, 3 = last resort) and use the FIRST working one
   - Different APIs should provide the same data type from different sources (e.g., multiple weather APIs, multiple crypto price APIs)
   - Only include APIs you are CONFIDENT work - better to provide 2 solid alternatives than 3 unreliable ones
   - Format: Each integration has an "alternatives" array with 2-3 options, each with its own apiUrl, httpMethod, authType, dynamicParams, and priority
   
   🔴 CRITICAL: REFERENTIAL INTEGRITY RULES 🔴
   - Every command with "integrationDisplayName" MUST have a matching integration in "apiIntegrations" with the EXACT same "displayName"
   - Every scheduledBroadcast with "integrationDisplayName" MUST have a matching integration in "apiIntegrations" with the EXACT same "displayName"
   - If you cannot find 2+ working APIs for a feature, consider if the AI can generate the content dynamically instead (no integration needed)
   - For features like horoscopes, quotes, jokes, trivia, or motivational messages that don't have reliable free APIs, DO NOT create an integration - rely on AI generation instead
   
   API INTEGRATION FORMAT RULES:
   - ONLY suggest REAL, WORKING public APIs
   - Each "apiUrl" should contain ONLY the base API endpoint path (NO query parameters, NO default values)
   - Use "dynamicParams" to provide COMPLETE instructions on how to build the full URL with parameters
   - The runtime AI will construct the URL dynamically based on quiz results and dynamicParams instructions
   
   Examples of CORRECT multi-API format:
   
   ✅ Weather (Multiple Alternatives):
   {
     "displayName": "Weather Forecast",
     "alternatives": [
       {
         "apiUrl": "https://api.open-meteo.com/v1/forecast",
         "httpMethod": "GET",
         "authType": "none",
         "dynamicParams": "Add query: ?latitude=<lat>&longitude=<lon>&current_weather=true. Get coords from user's city in 'Location Preferences' quiz. City coords: kyiv(50.4501,30.5234), lviv(49.8397,24.0297). Default: kyiv.",
         "priority": 1
       },
       {
         "apiUrl": "https://api.weatherapi.com/v1/current.json",
         "httpMethod": "GET",
         "authType": "api_key",
         "dynamicParams": "Add query: ?key=<API_KEY>&q=<city_name>&aqi=no. Get city from 'Location Preferences' quiz. Default: Kyiv.",
         "priority": 2
       }
     ],
     "aiPrompt": "Format weather as: City: XX°C, Condition: Clear"
   }
   
   ✅ Cryptocurrency Prices (Multiple Alternatives):
   {
     "displayName": "Crypto Prices",
     "alternatives": [
       {
         "apiUrl": "https://api.coingecko.com/api/v3/simple/price",
         "httpMethod": "GET",
         "authType": "none",
         "dynamicParams": "Add query: ?ids=<comma-separated crypto IDs from 'Crypto Preferences' quiz>&vs_currencies=usd. Example: ?ids=bitcoin,ethereum&vs_currencies=usd. Default if no quiz: ?ids=bitcoin,ethereum&vs_currencies=usd",
         "priority": 1
       },
       {
         "apiUrl": "https://api.coincap.io/v2/assets",
         "httpMethod": "GET",
         "authType": "none",
         "dynamicParams": "Add query: ?ids=<comma-separated crypto IDs from quiz>. Map names: bitcoin->bitcoin, ethereum->ethereum. Default: ?ids=bitcoin,ethereum",
         "priority": 2
       }
     ],
     "aiPrompt": "Format cryptocurrency prices as: Bitcoin: $XX,XXX | Ethereum: $X,XXX"
   }
   
   ✅ Exchange Rates (Multiple Alternatives):
   {
     "displayName": "Exchange Rates",
     "alternatives": [
       {
         "apiUrl": "https://api.exchangerate-api.com/v4/latest/USD",
         "httpMethod": "GET",
         "authType": "none",
         "dynamicParams": "Replace USD in path with base currency from quiz. Example: /EUR or /GBP. Default: /USD",
         "priority": 1
       },
       {
         "apiUrl": "https://open.er-api.com/v6/latest/USD",
         "httpMethod": "GET",
         "authType": "none",
         "dynamicParams": "Replace USD in path with base currency. Default: /USD",
         "priority": 2
       }
     ],
     "aiPrompt": "Display exchange rates in a clean format"
   }
   
   ❌ WRONG - Single API (old format - DO NOT USE):
   {
     "displayName": "Weather",
     "apiUrl": "https://api.open-meteo.com/v1/forecast",
     "httpMethod": "GET",
     ...
   }
   
   ❌ WRONG - Command references non-existent integration:
   {
     "commands": [
       { "command": "/horoscope", "integrationDisplayName": "Horoscope" }
     ],
     "apiIntegrations": [
       { "displayName": "Weather Forecast", ... }
       // No "Horoscope" integration - REFERENTIAL INTEGRITY VIOLATION!
     ]
   }
   
   ✅ CORRECT - Horoscope without integration (AI-generated):
   {
     "commands": [
       { 
         "command": "/horoscope", 
         "description": "Get your daily horoscope",
         "ai_instructions": "Generate a personalized daily horoscope for the user's zodiac sign from 'Horoscope Preferences' quiz. Be creative, positive, and engaging."
         // NO integrationDisplayName - AI will generate content
       }
     ],
     "apiIntegrations": []  // No horoscope API needed
   }
   
   HOW TO WRITE dynamicParams:
   - Provide step-by-step instructions for URL construction
   - Specify which quiz results to use and how to format them
   - Include examples of the final URL format
   - Provide sensible defaults if quiz data is not available
   - For POST requests, specify how to build the request body JSON
   
7. Scheduled Broadcasts (optional): If the user mentions a specific repetitive task or sending information at a specific time (e.g., "send news every day at 9 AM"), suggest a scheduled broadcast.

AVAILABLE APP CAPABILITIES:
- The bot uses AI to answer any user messages.
- Commands: You can define custom commands. When a user sends a command, the bot receives specific AI instructions for that command.
- Quizzes: You can define series of questions with multiple-choice options. These help the bot learn about the user. You can have multiple independent quiz sets.
- API Integrations: The bot can fetch data from external APIs and use it in broadcasts or responses. ONLY suggest public APIs with MULTIPLE alternatives.
- Scheduled Broadcasts: The bot can send messages to all subscribers at a specific hour every day. These can use AI to process data from an integration.

API INTEGRATION & QUIZ LINKING:
- If the user provides a URL, you MUST include that EXACT URL as one of the alternatives in "apiIntegrations".
- If the user mentions a need for external data (weather, crypto, news, etc.), suggest 2-3 REAL, WORKING public API alternatives.
- CRITICAL FORMAT RULES:
  * Each integration has "alternatives" array with 2-3 options
  * Each alternative has: "apiUrl" (base endpoint ONLY), "httpMethod", "authType", "dynamicParams", "priority"
  * "priority" = 1 (best), 2 (fallback), 3 (last resort)
  
- The runtime AI will read "dynamicParams" and construct the complete URL/body using quiz results
- Link Commands to API Integrations using "integrationDisplayName"
- Link Commands to Quizzes using "quizTitles" and set "use_quiz_results": true
- Better to have ZERO integrations than create commands that reference non-existent integrations

BROADCAST EXTRACTION:
- If the user mentions a specific time or frequency (e.g. "every day at 10:00", "9 AM"), extract the "sendTimeHour" (0-23).
- If the user mentions a location or timezone (e.g. "9 AM in Ukraine" or "10:00 by Kyiv time"), set "sendTimeHour" to the LOCAL hour (e.g. 9 or 10) and set the root "timezone" field to the corresponding IANA timezone name (e.g. "Europe/Kyiv").
- The system will automatically handle UTC conversion and DST based on the "timezone" field to ensure the message is sent at the correct local moment.
- If the broadcast depends on an integration (e.g. "send news"), set "integrationDisplayName" to match the integration's "displayName".
- Provide a "prePrompt" that tells the AI what to generate. Example: "Generate a summary of today's top news about Portugal."

Output ONLY valid JSON in this format:
{
  "name": "string",
  "description": "string",
  "business_context": "string",
  "timezone": "string (IANA timezone name, e.g. 'UTC', 'Europe/Kyiv', 'Europe/Lisbon', 'America/New_York')",
  "commands": [
    { 
      "command": "/prices", 
      "description": "Get cryptocurrency prices", 
      "ai_instructions": "Fetch and display current cryptocurrency prices using the integration. Show user's selected coins from quiz if available.",
      "integrationDisplayName": "Crypto Prices",
      "use_quiz_results": true,
      "quizTitles": ["Crypto Preferences"]
    }
  ],
  "quizzes": [
    {
      "title": "Preference Quiz",
      "items": [
        { "question": "...", "options": [{ "key": "...", "label": "..." }] }
      ]
    }
  ],
  "apiIntegrations": [
    {
      "displayName": "Crypto Prices",
      "alternatives": [
        {
          "apiUrl": "https://api.coingecko.com/api/v3/simple/price",
          "httpMethod": "GET",
          "authType": "none",
          "dynamicParams": "Build query string: ?ids=<comma-separated crypto IDs from 'Crypto Preferences' quiz>&vs_currencies=usd. Example: ?ids=bitcoin,ethereum&vs_currencies=usd. Default if no quiz: ?ids=bitcoin,ethereum&vs_currencies=usd",
          "priority": 1
        },
        {
          "apiUrl": "https://api.coincap.io/v2/assets",
          "httpMethod": "GET",
          "authType": "none",
          "dynamicParams": "Different format but same data. Map: bitcoin->bitcoin, ethereum->ethereum. Default: ?ids=bitcoin,ethereum",
          "priority": 2
        }
      ],
      "aiPrompt": "Format cryptocurrency prices as: Bitcoin: $XX,XXX | Ethereum: $X,XXX"
    }
  ],
  "scheduledBroadcasts": [
    {
      "sendTimeHour": 9,
      "prePrompt": "Summarize the latest news from the API",
      "integrationDisplayName": "string (optional, MUST match a displayName in apiIntegrations)",
      "sentenceCount": 3
    }
  ]
}

IMPORTANT: 
- "name", "description", "commands[].description", "quizzes[].title", "quizzes[].items[].question", "quizzes[].items[].options[].label" MUST be in ${languageName} language.
- "business_context", "commands[].ai_instructions", "apiIntegrations[].aiPrompt", and "scheduledBroadcasts[].prePrompt" should be in English for better internal AI use, but can mention the target language.
- CRITICAL: Only include "apiIntegrations" if you know 2+ REAL, WORKING API URLs (not example.com or placeholder URLs). Better to omit than use fake URLs or violate referential integrity.
- For API integrations: "httpMethod" can be "GET" or "POST", "authType" can be "none", "bearer", or "api_key".
- ALWAYS ensure every command/broadcast with "integrationDisplayName" has a matching integration in "apiIntegrations".
- Timezone & Broadcast Time: If the user mentions a specific time for broadcasts in a specific region (like "9 AM in Ukraine"), set "timezone" to that region's IANA timezone name (e.g. "Europe/Kyiv") and "sendTimeHour" to the local hour (9). The server handles the conversion to UTC and accounts for daylight saving time automatically. Default to "UTC" if no region is specified.`;

    const userPrompt = `USER PROMPT: ${prompt}\n\n${businessContext ? `EXISTING BUSINESS CONTEXT: ${businessContext}` : ""}`;

    const chat = await openaiChat({
      apiKey: env.OPENAI_API_KEY,
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      maxOutputTokens: 3000,
    });

    try {
      return this.parseAIJson(chat.text);
    } catch (e: any) {
      Logger.error('AI', `AI bot config generation JSON parse error text=${chat.text} error=${e.message || e}`);
      throw new Error("Failed to generate bot config: invalid AI response");
    }
  }

  static async suggestAlternativeApi(params: {
    env: Env;
    failedApis: Array<{ displayName: string; apiUrl: string; error: string }>;
    originalPurpose: string;
    botPrompt: string;
    businessContext?: string;
    language: string;
  }): Promise<{
    apiUrl: string;
    httpMethod: "GET" | "POST";
    authType: "none" | "bearer" | "api_key";
    aiPrompt: string;
    displayName: string;
  } | null> {
    const { env, failedApis, originalPurpose, botPrompt, businessContext, language } = params;
    const languageName = getLanguageName(language);

    // Build detailed failure history
    const failureHistory = failedApis.map((api, idx) => 
      `${idx + 1}. ${api.displayName}\n   URL: ${api.apiUrl}\n   Reason: ${api.error}`
    ).join('\n');

    const systemPrompt = `You are an expert API Integration specialist. 
Multiple suggested APIs for a Telegram bot have FAILED. You need to suggest a DIFFERENT, WORKING, and PUBLIC API that serves the same purpose.

CONTEXT:
Bot Goal: ${botPrompt}
Business Context: ${businessContext || "N/A"}
Original Integration Purpose: ${originalPurpose}

FAILED ATTEMPTS (DO NOT suggest any of these again):
${failureHistory}

GUIDELINES:
1. Suggest a COMPLETELY DIFFERENT public API that is likely to work.
2. DO NOT suggest any of the URLs or services listed above - they have already been tested and failed.
3. Focus on APIs that do NOT require authentication or use simple API keys.
4. Consider well-known, reliable public APIs with good uptime.
5. If no working alternative comes to mind after ${failedApis.length} failures, return null.
6. Output ONLY valid JSON in this format:
{
  "displayName": "string (Short name for integration)",
  "apiUrl": "string (Full URL, DIFFERENT from all failed attempts)",
  "httpMethod": "GET or POST",
  "authType": "none, bearer, or api_key",
  "aiPrompt": "Instruction to AI on how to handle this API's data"
}
7. The aiPrompt should be in English. displayName should be in ${languageName}.`;

    const chat = await openaiChat({
      apiKey: env.OPENAI_API_KEY,
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: "Suggest a better alternative API that definitely works and is different from all the failed attempts." }
      ],
      maxOutputTokens: 500,
    });

    try {
      const text = chat.text.trim();
      if (text.toLowerCase() === "null") return null;
      return this.parseAIJson(text);
    } catch (e: any) {
      Logger.error('AI', `AI suggestAlternativeApi JSON parse error text=${chat.text} error=${e.message || e}`);
      return null;
    }
  }

  static async generatePreferenceQuizWithOpenAI(params: {
    env: Env;
    name: string;
    description: string;
    language: string;
  }): Promise<{
    title: string;
    items: Array<{ question: string; options: Array<{ key: string; label: string }> }>;
  }> {
    const languageName = getLanguageName(params.language);
    const system: OpenAIChatMessage = {
      role: "system",
      content: `You generate preference quizzes for Telegram bots. Output ONLY valid JSON. No markdown. No extra text. IMPORTANT: The entire quiz (title, questions, and labels) MUST be strictly in ${languageName} language.`,
    };
    const user: OpenAIChatMessage = {
      role: "user",
      content: JSON.stringify({
        task: "Generate a preference quiz to learn the user's preferences. We store ONLY the selected answer text (no JSON patches).",
        bot: { name: params.name, description: params.description },
        language: languageName,
        strictly_follow_language: true,
        requirements: { 
          questionCount: 8, 
          optionCountRange: [3, 5], 
          mustIncludeSkip: true, 
          noCorrectAnswers: true,
          atomicQuestions: "One question per collected item. One answer per question."
        },
        outputSchema: { title: "string", items: [{ question: "string", options: [{ key: "string", label: "string" }] }] },
      }),
    };

    const chat = await openaiChat({ apiKey: params.env.OPENAI_API_KEY, model: "gpt-4o-mini", messages: [system, user], maxOutputTokens: 1200 });
    try {
      const parsed = this.parseAIJson(chat.text);
      if (!parsed?.title || !Array.isArray(parsed?.items)) throw new Error("OpenAI quiz JSON invalid");
      return parsed;
    } catch (e: any) {
      Logger.error('AI', `AI Quiz generation JSON parse error text=${chat.text} error=${e.message || e}`);
      throw new Error("Failed to generate quiz: invalid AI response");
    }
  }

  static fallbackQuiz(name: string, i18n: any) {
    return {
      title: i18n.t("child.fallback_quiz_title"),
      items: [
        {
          question: i18n.t("child.tone_question"),
          options: [
            { key: "tone_friendly", label: i18n.t("child.tone_friendly") },
            { key: "tone_direct", label: i18n.t("child.tone_direct") },
            { key: "tone_formal", label: i18n.t("child.tone_formal") },
            { key: "tone_playful", label: i18n.t("child.tone_playful") },
          ],
        },
        {
          question: i18n.t("child.detail_question"),
          options: [
            { key: "d_brief", label: i18n.t("child.detail_brief") },
            { key: "d_balanced", label: i18n.t("child.detail_balanced") },
            { key: "d_detailed", label: i18n.t("child.detail_detailed") },
          ],
        },
      ],
    };
  }

  private static parseAIJson(text: string): any {
    let cleanText = text.trim();
    if (cleanText.startsWith("```")) {
      cleanText = cleanText.replace(/^```[a-z]*\n/i, "").replace(/\n```$/i, "").trim();
    }
    return JSON.parse(cleanText);
  }
}
