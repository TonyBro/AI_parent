import { Logger } from "./logger";

export type OpenAIChatMessage = 
  | { role: "system" | "user" | "assistant"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: any[] }
  | { role: "tool"; content: string; tool_call_id: string };

export async function openaiModerate(params: {
  apiKey: string;
  input: string;
}): Promise<{ flagged: boolean; raw: unknown }> {
  const res = await fetch("https://api.openai.com/v1/moderations", {
    method: "POST",
    headers: {
      authorization: `Bearer ${params.apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ model: "omni-moderation-latest", input: params.input }),
  });
  const json = (await res.json()) as any;
  const flagged = Boolean(json?.results?.[0]?.flagged);
  return { flagged, raw: json };
}

export async function openaiChat(params: {
  apiKey: string;
  model: string;
  messages: OpenAIChatMessage[];
  maxOutputTokens?: number;
  tools?: any[];
  tool_choice?: string | object;
}): Promise<{
  text: string;
  tool_calls?: any[];
  usage?: { input_tokens?: number; output_tokens?: number };
  raw: unknown;
}> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${params.apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: params.model,
      messages: params.messages,
      tools: params.tools,
      tool_choice: params.tool_choice,
      temperature: 0.7,
      max_tokens: params.maxOutputTokens ?? 500,
    }),
  });
  const json = (await res.json()) as any;
  if (json.error) {
    throw new Error(`OpenAI error: ${json.error.message || JSON.stringify(json.error)}`);
  }
  const text = String(json?.choices?.[0]?.message?.content ?? "");
  const tool_calls = json?.choices?.[0]?.message?.tool_calls;
  const usage = json?.usage
    ? { input_tokens: json.usage.prompt_tokens, output_tokens: json.usage.completion_tokens }
    : undefined;
  return { text, tool_calls, usage, raw: json };
}

export async function openaiChatStream(params: {
  apiKey: string;
  model: string;
  messages: OpenAIChatMessage[];
  maxOutputTokens?: number;
  tools?: any[];
  tool_choice?: string | object;
  onChunk: (chunk: string) => void | Promise<void>;
}): Promise<{
  text: string;
  tool_calls?: any[];
  usage?: { input_tokens?: number; output_tokens?: number };
  raw?: unknown;
}> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${params.apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: params.model,
      messages: params.messages,
      tools: params.tools,
      tool_choice: params.tool_choice,
      temperature: 0.7,
      max_tokens: params.maxOutputTokens ?? 500,
      stream: true,
    }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`OpenAI API error: ${res.status} ${errorText}`);
  }

  if (!res.body) {
    throw new Error("OpenAI API response body is null");
  }

  let fullText = "";
  let toolCalls: any[] = [];
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed === "data: [DONE]") continue;
        
        if (trimmed.startsWith("data: ")) {
          const jsonStr = trimmed.slice(6);
          try {
            const parsed = JSON.parse(jsonStr);
            const delta = parsed?.choices?.[0]?.delta;
            const content = delta?.content;
            
            // Check for tool calls in the delta
            if (delta?.tool_calls) {
              toolCalls.push(...delta.tool_calls);
            }
            
            if (content) {
              fullText += content;
              await params.onChunk(content);
            }
          } catch (e: any) {
            // Skip invalid JSON lines
            Logger.warn('AI', `Failed to parse SSE line: ${jsonStr} ${e.message || e}`);
          }
        }
      }
    }
  } catch (error: any) {
    Logger.error('AI', `OpenAI stream error: ${error.message || error}`);
    throw error;
  }

  return { 
    text: fullText, 
    tool_calls: toolCalls.length > 0 ? toolCalls : undefined, 
    usage: undefined 
  };
}


export async function openaiGenerateImage(params: {
  apiKey: string;
  prompt: string;
  model?: string;
  size?: "256x256" | "512x512" | "1024x1024";
  quality?: "standard" | "hd";
}): Promise<{ url: string; revised_prompt?: string }> {
  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      authorization: `Bearer ${params.apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: params.model || "dall-e-3",
      prompt: params.prompt,
      n: 1,
      size: params.size || "1024x1024",
      quality: params.quality || "standard",
    }),
  });
  const json = (await res.json()) as any;
  if (json.error) {
    throw new Error(`OpenAI error: ${json.error.message || JSON.stringify(json.error)}`);
  }
  const url = json?.data?.[0]?.url;
  const revised_prompt = json?.data?.[0]?.revised_prompt;
  if (!url) throw new Error("No image URL returned from OpenAI");
  return { url, revised_prompt };
}
