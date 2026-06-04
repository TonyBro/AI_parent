import { Env } from "../config/env";
import { openaiChat } from "../utils/openai";

/**
 * Process API response with AI to generate user-friendly message
 */
export async function processApiResponseWithAI(params: {
  env: Env;
  apiResponse: any;
  aiPrompt: string;
  language?: string;
}): Promise<string> {
  const { env, apiResponse, aiPrompt, language = "en" } = params;

  // Convert API response to string for AI processing
  let responseText: string;
  if (typeof apiResponse === "string") {
    responseText = apiResponse;
  } else {
    responseText = JSON.stringify(apiResponse, null, 2);
  }

  const systemPrompt = `You are an AI assistant that processes API responses and formats them for users.
Your task is to take raw API data and transform it into a clear, user-friendly message.

Language: ${language}
Important: Your response must be in ${language} language.

API Response:
${responseText.slice(0, 5000)} ${responseText.length > 5000 ? "...(truncated)" : ""}

User's instructions on how to process this data:
${aiPrompt}

Generate a clear, concise message based on the API data and user's instructions.`;

  const chat = await openaiChat({
    apiKey: env.OPENAI_API_KEY,
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: "You are a helpful assistant that formats API data for users." },
      { role: "user", content: systemPrompt }
    ],
    maxOutputTokens: 500,
  });

  return chat.text || "No response from AI.";
}
