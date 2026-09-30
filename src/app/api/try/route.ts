import { type NextRequest } from "next/server";

export const runtime = "nodejs";

interface ToolSpec {
  name: string;
  description: string;
}

interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

type ChatMessage =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string; toolCalls?: ToolCall[] }
  | { role: "tool"; toolCallId: string; name: string; content: string };

interface TryBody {
  provider: string;
  model: string;
  apiKey: string;
  system: string;
  messages: ChatMessage[];
  tools: ToolSpec[];
}

const toolSchema = {
  type: "object",
  properties: {
    path: { type: "string", description: "File path" },
    command: { type: "string", description: "Shell command" },
    query: { type: "string", description: "Search query" },
    url: { type: "string", description: "Page URL" },
    change: { type: "string", description: "What to change" },
    task: { type: "string", description: "Work to hand off" },
    request: { type: "string", description: "What to ask the server" },
  },
};

const PROVIDER_NAME: Record<string, string> = { anthropic: "Anthropic", openai: "OpenAI", google: "Google" };

const KEY_HINT: Record<string, string> = {
  anthropic: "Anthropic keys come from console.anthropic.com and start with sk-ant-. A Claude.ai or Cursor login is not an API key.",
  openai: "OpenAI keys come from platform.openai.com and start with sk-.",
  google: "Gemini keys come from aistudio.google.com and start with AIza.",
};

function providerError(status: number, body: string): string {
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string } | string; message?: string };
    if (typeof parsed.error === "string") return parsed.error;
    if (parsed.error?.message) return parsed.error.message;
    if (parsed.message) return parsed.message;
  } catch {
    /* plain text */
  }
  const flat = body.replace(/\s+/g, " ").trim();
  return flat.slice(0, 280) || `The model returned ${status}.`;
}

function explainFailure(provider: string, model: string, status: number, body: string): string {
  const detail = providerError(status, body);
  const name = PROVIDER_NAME[provider] ?? provider;
  const auth = status === 401 || status === 403 || /api[- ]?key|authentication|unauthorized|permission denied/i.test(detail);
  if (auth) {
    const hint = KEY_HINT[provider] ?? "Check that the key matches this model's provider.";
    return `${name} rejected the API key while calling ${model}. ${hint} Open Edit above the chat and paste that provider's key. ${name} said: ${detail}`;
  }
  if (status === 404 || /model/i.test(detail)) {
    return `${name} could not run model ${model}. ${detail}`;
  }
  return `${name} (${model}) returned an error: ${detail}`;
}

function toAnthropic(messages: ChatMessage[]) {
  const out: { role: string; content: unknown }[] = [];
  for (const message of messages) {
    if (message.role === "user") {
      out.push({ role: "user", content: message.content });
    } else if (message.role === "assistant") {
      const content: unknown[] = [];
      if (message.content.trim()) content.push({ type: "text", text: message.content });
      for (const call of message.toolCalls ?? []) {
        content.push({ type: "tool_use", id: call.id, name: call.name, input: call.input });
      }
      out.push({ role: "assistant", content: content.length ? content : message.content });
    } else {
      const block = { type: "tool_result", tool_use_id: message.toolCallId, content: message.content };
      const last = out.at(-1);
      if (last?.role === "user" && Array.isArray(last.content)) (last.content as unknown[]).push(block);
      else out.push({ role: "user", content: [block] });
    }
  }
  return out;
}

function toOpenAI(system: string, messages: ChatMessage[]) {
  const out: Record<string, unknown>[] = system.trim() ? [{ role: "system", content: system }] : [];
  for (const message of messages) {
    if (message.role === "user") out.push({ role: "user", content: message.content });
    else if (message.role === "assistant") {
      out.push({
        role: "assistant",
        content: message.content || null,
        tool_calls: message.toolCalls?.map((call) => ({
          id: call.id,
          type: "function",
          function: { name: call.name, arguments: JSON.stringify(call.input) },
        })),
      });
    } else {
      out.push({ role: "tool", tool_call_id: message.toolCallId, content: message.content });
    }
  }
  return out;
}

function toGemini(system: string, messages: ChatMessage[]) {
  const contents: { role: string; parts: Record<string, unknown>[] }[] = [];
  for (const message of messages) {
    if (message.role === "user") contents.push({ role: "user", parts: [{ text: message.content }] });
    else if (message.role === "assistant") {
      const parts: Record<string, unknown>[] = [];
      if (message.content.trim()) parts.push({ text: message.content });
      for (const call of message.toolCalls ?? []) {
        parts.push({ functionCall: { name: call.name, args: call.input } });
      }
      contents.push({ role: "model", parts });
    } else {
      contents.push({
        role: "user",
        parts: [{ functionResponse: { name: message.name, response: { result: message.content } } }],
      });
    }
  }
  return system.trim() ? { systemInstruction: { parts: [{ text: system }] }, contents } : { contents };
}

async function callAnthropic(body: TryBody) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": body.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: body.model,
      max_tokens: 1024,
      ...(body.system.trim() ? { system: body.system } : {}),
      messages: toAnthropic(body.messages),
      ...(body.tools.length
        ? { tools: body.tools.map((tool) => ({ name: tool.name, description: tool.description, input_schema: toolSchema })) }
        : {}),
    }),
  });
  const raw = await response.text();
  if (!response.ok) throw new Error(explainFailure("anthropic", body.model, response.status, raw));
  const parsed = JSON.parse(raw) as {
    content: { type: string; text?: string; id?: string; name?: string; input?: Record<string, unknown> }[];
    usage?: { input_tokens?: number; output_tokens?: number };
  };
  const text = parsed.content.filter((block) => block.type === "text").map((block) => block.text ?? "").join("");
  const toolCalls: ToolCall[] = parsed.content
    .filter((block) => block.type === "tool_use" && block.id && block.name)
    .map((block) => ({ id: block.id!, name: block.name!, input: block.input ?? {} }));
  return { text, toolCalls, usage: { input: parsed.usage?.input_tokens ?? 0, output: parsed.usage?.output_tokens ?? 0 } };
}

async function callOpenAI(body: TryBody) {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${body.apiKey}` },
    body: JSON.stringify({
      model: body.model,
      messages: toOpenAI(body.system, body.messages),
      ...(body.tools.length
        ? { tools: body.tools.map((tool) => ({ type: "function", function: { name: tool.name, description: tool.description, parameters: toolSchema } })) }
        : {}),
    }),
  });
  const raw = await response.text();
  if (!response.ok) throw new Error(explainFailure("openai", body.model, response.status, raw));
  const parsed = JSON.parse(raw) as {
    choices: { message: { content?: string; tool_calls?: { id: string; function: { name: string; arguments: string } }[] } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const message = parsed.choices[0]?.message;
  const toolCalls: ToolCall[] = (message?.tool_calls ?? []).map((call) => {
    let input: Record<string, unknown> = {};
    try {
      input = JSON.parse(call.function.arguments) as Record<string, unknown>;
    } catch {
      input = {};
    }
    return { id: call.id, name: call.function.name, input };
  });
  return {
    text: message?.content ?? "",
    toolCalls,
    usage: { input: parsed.usage?.prompt_tokens ?? 0, output: parsed.usage?.completion_tokens ?? 0 },
  };
}

async function callGoogle(body: TryBody) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(body.model)}:generateContent?key=${encodeURIComponent(body.apiKey)}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      ...toGemini(body.system, body.messages),
      ...(body.tools.length
        ? { tools: [{ functionDeclarations: body.tools.map((tool) => ({ name: tool.name, description: tool.description, parameters: toolSchema })) }] }
        : {}),
    }),
  });
  const raw = await response.text();
  if (!response.ok) throw new Error(explainFailure("google", body.model, response.status, raw));
  const parsed = JSON.parse(raw) as {
    candidates?: { content?: { parts?: { text?: string; functionCall?: { name: string; args?: Record<string, unknown> } }[] } }[];
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  };
  const parts = parsed.candidates?.[0]?.content?.parts ?? [];
  const text = parts.map((part) => part.text ?? "").join("");
  const toolCalls: ToolCall[] = parts
    .filter((part) => part.functionCall?.name)
    .map((part) => ({ id: crypto.randomUUID(), name: part.functionCall!.name, input: part.functionCall!.args ?? {} }));
  return {
    text,
    toolCalls,
    usage: { input: parsed.usageMetadata?.promptTokenCount ?? 0, output: parsed.usageMetadata?.candidatesTokenCount ?? 0 },
  };
}

export async function POST(request: NextRequest) {
  let body: TryBody;
  try {
    body = (await request.json()) as TryBody;
  } catch {
    return Response.json({ error: "That request could not be read." }, { status: 400 });
  }
  if (!body.apiKey?.trim()) return Response.json({ error: "Add an API key to try this harness." }, { status: 400 });
  if (!body.model?.trim()) return Response.json({ error: "Choose a model for this rehearsal." }, { status: 400 });
  body.system ??= "";
  body.tools ??= [];
  try {
    const result =
      body.provider === "openai" ? await callOpenAI(body) : body.provider === "google" ? await callGoogle(body) : await callAnthropic(body);
    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "The model could not be reached.";
    return Response.json({ error: message }, { status: 502 });
  }
}
