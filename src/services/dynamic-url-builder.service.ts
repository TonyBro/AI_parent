import { Env } from "../config/env";
import { Logger } from "../utils/logger";
import { openaiChat } from "../openai";

/**
 * Service for building dynamic API URLs/bodies using AI and user quiz results
 */
export class DynamicUrlBuilderService {
  /**
   * Build dynamic API URL or request body using AI, dynamicParams instructions, and user quiz results
   */
  static async buildApiRequest(params: {
    env: Env;
    baseUrl: string;
    httpMethod: "GET" | "POST";
    dynamicParams: string | null;
    quizAnswers: Array<{
      quiz_set_id: string;
      question: string;
      answer: string;
      position?: number;
    }>;
  }): Promise<{
    finalUrl: string;
    requestBody?: string;
  }> {
    const { env, baseUrl, httpMethod, dynamicParams, quizAnswers } = params;

    Logger.info("INTEGRATION", `[DynamicUrlBuilder] Building API request`, {
      baseUrl,
      httpMethod,
      hasDynamicParams: !!dynamicParams,
      quizAnswersCount: quizAnswers.length
    });

    // If no dynamicParams, return base URL as-is
    if (!dynamicParams) {
      Logger.info("INTEGRATION", `[DynamicUrlBuilder] No dynamicParams, using base URL`, { finalUrl: baseUrl });
      return { finalUrl: baseUrl };
    }

    // Prepare quiz context for AI
    const quizContext = quizAnswers.length > 0
      ? quizAnswers.map(a => `- ${a.question}: ${a.answer}`).join('\n')
      : "No quiz data available";

    // Build AI prompt for URL/body construction
    const systemPrompt = `You are a URL/API request builder. Your task is to construct the final API request URL or request body based on:
1. Base API URL: ${baseUrl}
2. HTTP Method: ${httpMethod}
3. Dynamic Parameters Instructions: ${dynamicParams}
4. User's Quiz Results (if any)

INSTRUCTIONS:
- Read the "Dynamic Parameters Instructions" carefully
- Use the user's quiz results to fill in the required parameters
- If specific quiz data is mentioned but not available, use the default values specified in the instructions
- For GET requests, construct the full URL with query parameters
- For POST requests, construct ONLY the JSON request body (do not include the URL)
- Follow the examples and format specified in the instructions exactly

CRITICAL RULES:
- Return ONLY the final URL (for GET) or JSON body (for POST)
- Do NOT include any explanations, comments, or extra text
- For GET: Return the complete URL with all query parameters
- For POST: Return ONLY valid JSON for the request body
- If instructions say "append to path", modify the URL path accordingly
- If instructions mention default values and no quiz data is available, use those defaults`;

    const userPrompt = `User's Quiz Results:
${quizContext}

Construct the ${httpMethod === "GET" ? "final API URL" : "request body JSON"} following the instructions.`;

    try {
      const aiResponse = await openaiChat({
        apiKey: env.OPENAI_API_KEY,
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        maxOutputTokens: 500,
      });

      const result = aiResponse.text.trim();

      Logger.info("INTEGRATION", `[DynamicUrlBuilder] AI constructed request`, {
        method: httpMethod,
        resultLength: result.length,
        resultPreview: result.substring(0, 200)
      });

      if (httpMethod === "POST") {
        // For POST, AI returns the request body
        // Validate it's valid JSON
        try {
          JSON.parse(result);
          return { finalUrl: baseUrl, requestBody: result };
        } catch (e) {
          Logger.error("INTEGRATION", `[DynamicUrlBuilder] AI returned invalid JSON for POST body`, {
            result: result.substring(0, 500)
          });
          // Fallback: try to extract defaults from dynamicParams
          return this.extractDefaultRequest(baseUrl, httpMethod, dynamicParams);
        }
      } else {
        // For GET, AI returns the full URL
        // Validate it starts with the base URL
        if (!result.startsWith("http")) {
          Logger.warn("INTEGRATION", `[DynamicUrlBuilder] AI result doesn't look like a URL, using base URL`, { result });
          return { finalUrl: baseUrl };
        }
        return { finalUrl: result };
      }
    } catch (error: any) {
      Logger.error("INTEGRATION", `[DynamicUrlBuilder] AI failed to build request`, {
        error: error.message,
        baseUrl,
        httpMethod
      });
      // Fallback: extract defaults from dynamicParams
      return this.extractDefaultRequest(baseUrl, httpMethod, dynamicParams);
    }
  }

  /**
   * Fallback: Extract default request from dynamicParams instructions
   */
  private static extractDefaultRequest(
    baseUrl: string,
    httpMethod: "GET" | "POST",
    dynamicParams: string
  ): { finalUrl: string; requestBody?: string } {
    Logger.info("INTEGRATION", `[DynamicUrlBuilder] Extracting default request from dynamicParams`);

    // Try to extract default query parameters or JSON body
    const defaultMatch = dynamicParams.match(/[Dd]efault[^:]*:\s*([?&][\w=&,.-]+|\/[\w/-]+|\{[^}]+\})/);
    
    if (defaultMatch) {
      const defaultValue = defaultMatch[1];
      
      if (httpMethod === "POST" && defaultValue.startsWith("{")) {
        // Extract JSON body
        try {
          // Try to find the complete JSON
          const jsonMatch = dynamicParams.match(/\{[^}]+\}/);
          if (jsonMatch) {
            const jsonBody = jsonMatch[0];
            JSON.parse(jsonBody); // Validate
            Logger.info("INTEGRATION", `[DynamicUrlBuilder] Extracted default POST body`, { jsonBody });
            return { finalUrl: baseUrl, requestBody: jsonBody };
          }
        } catch (e) {
          Logger.warn("INTEGRATION", `[DynamicUrlBuilder] Failed to parse default JSON from dynamicParams`);
        }
      } else if (defaultValue.startsWith("?") || defaultValue.startsWith("&")) {
        // Query parameters
        const finalUrl = baseUrl + (defaultValue.startsWith("?") ? defaultValue : "?" + defaultValue.substring(1));
        Logger.info("INTEGRATION", `[DynamicUrlBuilder] Extracted default query params`, { finalUrl });
        return { finalUrl };
      } else if (defaultValue.startsWith("/")) {
        // Path parameter
        const finalUrl = baseUrl + defaultValue;
        Logger.info("INTEGRATION", `[DynamicUrlBuilder] Extracted default path param`, { finalUrl });
        return { finalUrl };
      }
    }

    Logger.warn("INTEGRATION", `[DynamicUrlBuilder] Could not extract default, using base URL`, { baseUrl });
    return { finalUrl: baseUrl };
  }
}
