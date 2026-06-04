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
