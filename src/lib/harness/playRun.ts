import {
  inputSummary,
  jevBlocks,
  jevRequestBody,
  matchingHooks,
  playTools,
  type PlayTool,
  resolveApiModel,
  STEP_CAP,
  systemPrompt,
  toolVerdict,
} from "./play";
import type { BuiltinTool, CompiledAgent, DecisionQuestion, HarnessConfig, HarnessEdge, Provider } from "./types";

export interface ModelToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export type ModelMessage =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string; toolCalls?: ModelToolCall[] }
  | { role: "tool"; toolCallId: string; name: string; content: string };

export interface PlayStep {
  id: string;
  nodeId: string | null;
  edgeId: string | null;
  title: string;
  detail: string;
  tone: "neutral" | "allow" | "ask" | "deny";
  pending?: boolean;
  /** The harness stopped to ask the person before this tool. */
  asked?: boolean;
  children?: PlayStep[];
}

type JevAnswer = { type: "noul"; noul: number } | { type: "choice"; choice: string } | { type: "score"; score: number };

const stepId = () => `step-${crypto.randomUUID().slice(0, 8)}`;

function edgeBetween(edges: HarnessEdge[], a: string, b: string): string | null {
  return edges.find((edge) => (edge.source === a && edge.target === b) || (edge.source === b && edge.target === a))?.id ?? null;
}

function asBuiltin(name: string): BuiltinTool | null {
  if (name === "read" || name === "edit" || name === "shell" || name === "webSearch" || name === "webFetch") return name;
  return null;
}

async function modelHop(args: {
  provider: string;
  model: string;
  apiKey: string;
  system: string;
  messages: ModelMessage[];
  tools: PlayTool[];
  signal: AbortSignal;
}): Promise<{ text: string; toolCalls: ModelToolCall[]; usage: { input: number; output: number } }> {
  const response = await fetch("/api/try", {
    method: "POST",
    headers: { "content-type": "application/json" },
    signal: args.signal,
    body: JSON.stringify({
      provider: args.provider,
      model: args.model,
      apiKey: args.apiKey,
      system: args.system,
      messages: args.messages,
      tools: args.tools.map((tool) => ({ name: tool.name, description: tool.description })),
    }),
  });
  const payload = (await response.json()) as {
    error?: string;
    text?: string;
    toolCalls?: ModelToolCall[];
    usage?: { input: number; output: number };
  };
  if (!response.ok) throw new Error(payload.error || "The model could not be reached.");
  return {
    text: payload.text ?? "",
    toolCalls: payload.toolCalls ?? [],
    usage: payload.usage ?? { input: 0, output: 0 },
  };
}

/** The same model with nothing from the diagram: no system prompt, rules, tools or subagents. */
export async function plainReply(args: {
  provider: Exclude<Provider, "other">;
  modelId: string;
  apiKey: string;
  history: ModelMessage[];
  userText: string;
  signal: AbortSignal;
}): Promise<{ text: string; usage: { input: number; output: number }; messages: ModelMessage[] }> {
  const messages: ModelMessage[] = [...args.history, { role: "user", content: args.userText }];
  const hop = await modelHop({
    provider: args.provider,
    model: resolveApiModel(args.provider, args.modelId),
    apiKey: args.apiKey,
    system: "",
    messages,
    tools: [],
    signal: args.signal,
  });
  return { text: hop.text, usage: hop.usage, messages: [...messages, { role: "assistant", content: hop.text }] };
}

async function askJev(apiKey: string, model: string, state: string, questions: DecisionQuestion[], signal: AbortSignal) {
  const response = await fetch("/api/try/jev", {
    method: "POST",
    headers: { "content-type": "application/json" },
    signal,
    body: JSON.stringify({ apiKey, ...jevRequestBody(model, state, questions) }),
  });
  const payload = (await response.json()) as { error?: string; answers?: Record<string, JevAnswer> };
  if (!response.ok) throw new Error(payload.error || "Jev could not be reached.");
  const answers: Record<string, JevAnswer> = {};
  for (const [key, value] of Object.entries(payload.answers ?? {})) {
    if (!value || typeof value !== "object" || !("type" in value)) continue;
    if (value.type === "noul" && typeof value.noul === "number") answers[key] = { type: "noul", noul: value.noul };
    else if (value.type === "choice" && typeof value.choice === "string") answers[key] = { type: "choice", choice: value.choice };
    else if (value.type === "score" && typeof value.score === "number") answers[key] = { type: "score", score: value.score };
  }
  return answers;
}

function jevReason(questions: DecisionQuestion[], answers: Record<string, JevAnswer>): { blocked: boolean; reason: string } {
  const keyed: Record<string, JevAnswer> = {};
  questions.forEach((question, index) => {
    const key = question.name.trim() || `question${index + 1}`;
    const answer = answers[key];
    if (answer) keyed[key] = answer;
  });
  const result = jevBlocks(questions, keyed);
  if (!result.blocked) {
    const bits = questions.map((question) => {
      const answer = keyed[question.name.trim()];
      if (!answer) return "";
      if (answer.type === "noul") return `${question.name} ${Math.round(answer.noul * 100)}% yes`;
      if (answer.type === "choice") return `${question.name} ${answer.choice}`;
      return `${question.name} ${answer.score}`;
    });
    return { blocked: false, reason: bits.filter(Boolean).join(", ") || "Jev allowed this" };
  }
  return result;
}

export async function rehearse(args: {
  config: HarnessConfig;
  agent: CompiledAgent;
  history: ModelMessage[];
  userText: string;
  apiKey: string;
  jevKey: string;
  edges: HarnessEdge[];
  signal: AbortSignal;
  onText: (text: string) => void;
  onSteps: (steps: PlayStep[]) => void;
  onAsk: (step: PlayStep) => Promise<"approve" | "deny">;
  onActive: (nodeId: string | null, edgeId: string | null) => void;
}): Promise<{ text: string; steps: PlayStep[]; usage: { input: number; output: number }; messages: ModelMessage[] }> {
  const steps: PlayStep[] = [];
  const publish = () => args.onSteps(steps.map((step) => ({ ...step, children: step.children ? [...step.children] : undefined })));
  const add = (step: PlayStep) => {
    steps.push(step);
    publish();
    return step;
  };
  let usage = { input: 0, output: 0 };
  const provider = args.agent.model?.provider ?? "anthropic";
  const modelId = resolveApiModel(provider === "other" ? "anthropic" : provider, args.agent.model?.modelId || "sonnet");
  const hopProvider = provider === "openai" || provider === "google" ? provider : "anthropic";

  const runJev = async (questions: DecisionQuestion[], model: string, state: string, nodeId: string) => {
    args.onActive(nodeId, edgeBetween(args.edges, args.agent.nodeId, nodeId));
    if (!args.jevKey.trim()) {
      const missing = jevBlocks(questions, null);
      add({ id: stepId(), nodeId, edgeId: edgeBetween(args.edges, args.agent.nodeId, nodeId), title: "Jev would block", detail: missing.reason, tone: "deny" });
      return missing;
    }
    try {
      const answers = await askJev(args.jevKey, model, state, questions, args.signal);
      const result = jevReason(questions, answers);
      add({
        id: stepId(),
        nodeId,
        edgeId: edgeBetween(args.edges, args.agent.nodeId, nodeId),
        title: result.blocked ? "Jev blocked this" : "Jev allowed this",
        detail: result.reason,
        tone: result.blocked ? "deny" : "allow",
      });
      return result;
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Jev could not be reached, so this decision blocks.";
      add({ id: stepId(), nodeId, edgeId: null, title: "Jev would block", detail: reason, tone: "deny" });
      return { blocked: true, reason };
    }
  };

  args.onActive(args.agent.nodeId, null);
  for (const hook of matchingHooks(args.agent, "userPromptSubmit", null)) {
    add({ id: stepId(), nodeId: hook.nodeId, edgeId: edgeBetween(args.edges, args.agent.nodeId, hook.nodeId), title: `${hook.name} would run`, detail: hook.command, tone: "neutral" });
  }
  for (const decision of args.agent.decisions.filter((item) => item.event === "userPromptSubmit")) {
    const gate = await runJev(decision.questions, decision.model, args.userText, decision.nodeId);
    if (gate.blocked) {
      args.onActive(null, null);
      return { text: gate.reason, steps, usage, messages: args.history };
    }
  }

  const messages: ModelMessage[] = [...args.history, { role: "user", content: args.userText }];
  let text = "";
  const tools = playTools(args.config, args.agent);
  let hops = 0;

  while (hops < STEP_CAP) {
    hops += 1;
    args.onActive(args.agent.model?.nodeId ?? args.agent.nodeId, args.agent.model ? edgeBetween(args.edges, args.agent.nodeId, args.agent.model.nodeId) : null);
    const hop = await modelHop({
      provider: hopProvider,
      model: modelId,
      apiKey: args.apiKey,
      system: systemPrompt(args.agent),
      messages,
      tools,
      signal: args.signal,
    });
    usage = { input: usage.input + hop.usage.input, output: usage.output + hop.usage.output };
    text = hop.text;
    args.onText(text);
    messages.push({ role: "assistant", content: hop.text, toolCalls: hop.toolCalls });
    if (hop.toolCalls.length === 0) break;

    for (const call of hop.toolCalls) {
      if (hops >= STEP_CAP) {
        add({ id: stepId(), nodeId: args.agent.nodeId, edgeId: null, title: `Stopped after ${STEP_CAP} steps`, detail: "Send again to continue.", tone: "neutral" });
        break;
      }
      const tool = tools.find((item) => item.name === call.name);
      const summary = inputSummary(call.input);
      const edgeId = tool?.nodeId ? edgeBetween(args.edges, args.agent.nodeId, tool.nodeId) : null;

      if (tool?.kind === "delegate" && tool.agentId) {
        const sub = args.config.subagents.find((agent) => agent.nodeId === tool.agentId);
        if (!sub) {
          messages.push({ role: "tool", toolCallId: call.id, name: call.name, content: "That subagent is not on the diagram." });
          continue;
        }
        const parent: PlayStep = { id: stepId(), nodeId: sub.nodeId, edgeId, title: `Handed to ${sub.name}`, detail: "Working…", tone: "neutral", children: [] };
        steps.push(parent);
        publish();
        args.onActive(sub.nodeId, edgeId);
        const nested = await rehearse({
          ...args,
          agent: sub,
          history: [],
          userText: summary || JSON.stringify(call.input),
          onText: () => {},
          onSteps: (children) => {
            parent.children = children;
            publish();
          },
        });
        parent.detail = nested.text || "No reply";
        parent.children = nested.steps;
        publish();
        usage = { input: usage.input + nested.usage.input, output: usage.output + nested.usage.output };
        messages.push({ role: "tool", toolCallId: call.id, name: call.name, content: nested.text || "The subagent returned nothing." });
        hops += 1;
        continue;
      }

      if (tool?.kind === "mcp") {
        args.onActive(tool.nodeId, edgeId);
        add({ id: stepId(), nodeId: tool.nodeId, edgeId, title: `${call.name} · not called`, detail: "MCP servers are not called in a rehearsal.", tone: "neutral" });
        messages.push({ role: "tool", toolCallId: call.id, name: call.name, content: "Not run in Try. MCP servers are not called." });
        continue;
      }

      const builtin = asBuiltin(call.name);
      for (const hook of matchingHooks(args.agent, "preToolUse", builtin)) {
        add({ id: stepId(), nodeId: hook.nodeId, edgeId: edgeBetween(args.edges, args.agent.nodeId, hook.nodeId), title: `${hook.name} would run`, detail: hook.command, tone: "neutral" });
      }
      let blocked = false;
      for (const decision of args.agent.decisions.filter((item) => item.event === "preToolUse")) {
        const gate = await runJev(decision.questions, decision.model, JSON.stringify({ tool: call.name, input: call.input }), decision.nodeId);
        if (gate.blocked) {
          blocked = true;
          messages.push({ role: "tool", toolCallId: call.id, name: call.name, content: `Blocked. ${gate.reason}` });
          break;
        }
      }
      if (blocked) continue;

      const verdict = toolVerdict(args.agent, call.name, typeof call.input.command === "string" ? call.input.command : "");
      args.onActive(verdict.nodeId ?? tool?.nodeId ?? args.agent.nodeId, edgeId);
      if (verdict.verdict === "deny") {
        add({ id: stepId(), nodeId: verdict.nodeId, edgeId, title: verdict.label, detail: summary || "The harness refused this.", tone: "deny" });
        messages.push({ role: "tool", toolCallId: call.id, name: call.name, content: `Blocked. ${verdict.label}` });
      } else if (verdict.verdict === "ask") {
        const pending = add({ id: stepId(), nodeId: verdict.nodeId, edgeId, title: `${verdict.label} · waiting for you`, detail: summary || "Approve or deny this.", tone: "ask", pending: true, asked: true });
        const choice = await args.onAsk(pending);
        pending.pending = false;
        pending.title = choice === "approve" ? `${verdict.label} · approved, not run in Try` : `You denied ${verdict.label}`;
        pending.tone = choice === "approve" ? "allow" : "deny";
        pending.detail = choice === "approve" ? summary || "Approved. Nothing was actually run." : "You denied this.";
        publish();
        messages.push({
          role: "tool",
          toolCallId: call.id,
          name: call.name,
          content: choice === "approve" ? "Not run in Try. The person approved it, but this rehearsal does not run tools." : "The person denied this.",
        });
      } else {
        add({ id: stepId(), nodeId: verdict.nodeId ?? tool?.nodeId ?? null, edgeId, title: `${verdict.label} · not run in Try`, detail: summary, tone: "allow" });
        messages.push({ role: "tool", toolCallId: call.id, name: call.name, content: "Not run in Try. This rehearsal does not read files, run commands, or fetch pages." });
      }
      for (const hook of matchingHooks(args.agent, "postToolUse", builtin)) {
        add({ id: stepId(), nodeId: hook.nodeId, edgeId: edgeBetween(args.edges, args.agent.nodeId, hook.nodeId), title: `${hook.name} would run`, detail: hook.command, tone: "neutral" });
      }
    }
  }

  if (hops >= STEP_CAP && messages.at(-1)?.role === "assistant" && (messages.at(-1) as { toolCalls?: unknown[] }).toolCalls?.length) {
    add({ id: stepId(), nodeId: args.agent.nodeId, edgeId: null, title: `Stopped after ${STEP_CAP} steps`, detail: "Send again to continue.", tone: "neutral" });
  }

  for (const hook of matchingHooks(args.agent, "stop", null)) {
    add({ id: stepId(), nodeId: hook.nodeId, edgeId: edgeBetween(args.edges, args.agent.nodeId, hook.nodeId), title: `${hook.name} would run`, detail: hook.command, tone: "neutral" });
  }
  for (const decision of args.agent.decisions.filter((item) => item.event === "stop")) {
    await runJev(decision.questions, decision.model, text, decision.nodeId);
  }
  args.onActive(null, null);
  return { text, steps, usage, messages };
}
