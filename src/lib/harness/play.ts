import { allAgents, mergePolicies, toolModes } from "./compile";
import { answerBlocks, jevQuestions, JEV_KEY_ENV, type JevAnswer } from "./jev";
import { slugify, TOOL_LABELS } from "./kinds";
import { applyContextBudget, renderRuntime } from "./runtime";
import type {
  BuiltinTool,
  CompiledAgent,
  DecisionQuestion,
  HarnessConfig,
  HookData,
  Provider,
} from "./types";
import type { PlayStep } from "./playRun";

export const STEP_CAP = 6;

const BUILTIN_TOOLS: BuiltinTool[] = ["read", "edit", "shell", "webSearch", "webFetch"];

const API_MODELS: Record<Exclude<Provider, "other">, Record<string, string>> = {
  anthropic: {
    sonnet: "claude-sonnet-4-5",
    opus: "claude-opus-4-1",
    haiku: "claude-haiku-4-5",
  },
  openai: {
    "gpt-6-sol": "gpt-4.1",
    "gpt-6-luna": "gpt-4.1-mini",
  },
  google: {
    "gemini-3-pro": "gemini-2.5-pro",
    "gemini-3-flash": "gemini-2.5-flash",
  },
};

export type PlayVerdict = "allow" | "ask" | "deny";

export interface PlayTool {
  name: string;
  description: string;
  nodeId: string | null;
  kind: "builtin" | "delegate" | "mcp";
  /** Set for delegate tools. */
  agentId?: string;
}

export interface ToolCallVerdict {
  verdict: PlayVerdict;
  nodeId: string | null;
  label: string;
}

export function resolveApiModel(provider: Provider, modelId: string): string {
  const id = modelId.trim();
  if (provider === "other") return id;
  return API_MODELS[provider][id] ?? id;
}

export function delegateName(agent: CompiledAgent): string {
  return `delegate_${slugify(agent.name, "agent")}`;
}

export function playTools(config: HarnessConfig, agent: CompiledAgent): PlayTool[] {
  const tools: PlayTool[] = [];
  for (const name of BUILTIN_TOOLS) {
    const card = agent.tools.find((tool) => tool.tool === name);
    if (!card) continue;
    tools.push({
      name,
      description: `${TOOL_LABELS[name]}. In this rehearsal the tool is not really run.`,
      nodeId: card.nodeId,
      kind: "builtin",
    });
  }
  if (agent === config.root) {
    for (const sub of config.subagents) {
      tools.push({
        name: delegateName(sub),
        description: `Hand work to ${sub.name}. ${sub.description || "A specialist."}`.trim(),
        nodeId: sub.nodeId,
        kind: "delegate",
        agentId: sub.nodeId,
      });
    }
  }
  for (const server of agent.mcpServers) {
    tools.push({
      name: `mcp_${slugify(server.name, "server")}`,
      description: `MCP server ${server.name}. Not called during a rehearsal.`,
      nodeId: server.nodeId,
      kind: "mcp",
    });
  }
  return tools;
}

function commandDenied(command: string, patterns: string[]): { denied: boolean; pattern: string } {
  const text = command.trim();
  for (const pattern of patterns) {
    const prefix = pattern.replace(/\*.*$/, "").trim();
    if (prefix && (text === prefix || text.startsWith(`${prefix} `) || text.startsWith(prefix))) {
      return { denied: true, pattern };
    }
  }
  return { denied: false, pattern: "" };
}

export function toolVerdict(agent: CompiledAgent, name: string, command = ""): ToolCallVerdict {
  const tool = BUILTIN_TOOLS.find((item) => item === name);
  if (!tool) return { verdict: "allow", nodeId: null, label: name };
  const card = agent.tools.find((item) => item.tool === tool);
  const mode = toolModes(agent)[tool] ?? "allow";
  if (tool === "shell" && command) {
    const policy = mergePolicies(agent.policies);
    const denied = commandDenied(command, policy.denyCommands);
    if (denied.denied) {
      return {
        verdict: "deny",
        nodeId: agent.policies[0]?.nodeId ?? card?.nodeId ?? null,
        label: `Blocked by ${agent.policies[0]?.name || "Permissions"}`,
      };
    }
  }
  if (mode === "deny") {
    return { verdict: "deny", nodeId: card?.nodeId ?? null, label: `Blocked by ${TOOL_LABELS[tool]}` };
  }
  if (mode === "ask") return { verdict: "ask", nodeId: card?.nodeId ?? null, label: TOOL_LABELS[tool] };
  return { verdict: "allow", nodeId: card?.nodeId ?? null, label: TOOL_LABELS[tool] };
}

export function matchingHooks(agent: CompiledAgent, event: HookData["event"], tool: BuiltinTool | null): CompiledAgent["hooks"] {
  return agent.hooks.filter((hook) => {
    if (hook.event !== event || !hook.command.trim()) return false;
    if (event !== "preToolUse" && event !== "postToolUse") return true;
    if (hook.scope === "any") return true;
    if (hook.scope === "shell") return tool === "shell";
    return tool === "edit";
  });
}

export function jevBlocks(
  questions: DecisionQuestion[],
  answers: Record<string, JevAnswer> | null,
): { blocked: boolean; reason: string } {
  if (!answers) {
    return { blocked: true, reason: `${JEV_KEY_ENV} is not set, so this decision would block.` };
  }
  const reasons: string[] = [];
  for (const question of questions) {
    const answer = answers[question.name.trim() || "block"];
    if (answer && answerBlocks(question, answer)) {
      if (answer.type === "noul") reasons.push(`${question.name} is ${Math.round(answer.noul * 100)}% yes`);
      else if (answer.type === "choice") reasons.push(`${question.name} is ${answer.choice}`);
      else reasons.push(`${question.name} scored ${answer.score}`);
    }
  }
  return { blocked: reasons.length > 0, reason: reasons.join("; ") };
}

export function jevRequestBody(model: string, state: string, questions: DecisionQuestion[]) {
  return { model: model.trim() || "jev-latest", state, questions: jevQuestions(questions) };
}

export function starterPrompts(config: HarnessConfig): string[] {
  const prompts = ["What can you do?"];
  const root = config.root;
  const denies = root.tools.some((tool) => tool.mode === "deny") || mergePolicies(root.policies).denyCommands.length > 0;
  if (denies) prompts.push("Try something your permissions should block.");
  for (const sub of config.subagents) {
    prompts.push(`Ask for something ${sub.name} handles${sub.description ? `: ${sub.description}` : "."}`);
  }
  return prompts;
}

export function requiredKeys(config: HarnessConfig): { providers: Exclude<Provider, "other">[]; jev: boolean } {
  const providers: Exclude<Provider, "other">[] = [];
  for (const agent of allAgents(config)) {
    const provider = agent.model?.provider;
    if (provider && provider !== "other" && !providers.includes(provider)) providers.push(provider);
  }
  const jev = allAgents(config).some((agent) => agent.decisions.length > 0);
  return { providers, jev };
}

export function systemPrompt(agent: CompiledAgent, taskLog = ""): string {
  const instructions = agent.instructions.map((item) => item.content.trim()).filter(Boolean).join("\n\n");
  const rules = agent.rules
    .filter((rule) => rule.content.trim())
    .map((rule) => `## ${rule.name}\n\n${rule.content.trim()}`)
    .join("\n\n");
  const prompt = [
    `You are ${agent.name || "the agent"}.`,
    agent.description,
    instructions,
    rules && `# Rules\n\n${rules}`,
    renderRuntime(agent, { taskLog }),
    "This is a rehearsal inside Harness Studio. Tools are not really executed. Call them anyway when you would, so the diagram can show the request and the result separately. After a result that says it was not executed, continue with your best answer from what you were given.",
  ]
    .filter(Boolean)
    .join("\n\n");
  return applyContextBudget(agent, prompt);
}

const listNames = (names: string[]) =>
  names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;

function flatten(steps: PlayStep[]): PlayStep[] {
  return steps.flatMap((step) => [step, ...flatten(step.children ?? [])]);
}

/** Plain-language lines on what the harness did that the plain model couldn't. */
export function harnessEffects(config: HarnessConfig, steps: PlayStep[]): string[] {
  const root = config.root;
  const lines: string[] = [];
  const used: string[] = [];
  if (root.instructions.some((item) => item.content.trim())) used.push("your System Prompt");
  const rules = root.rules.filter((rule) => rule.content.trim()).length;
  if (rules) used.push(`${rules} ${rules === 1 ? "rule" : "rules"}`);
  if (used.length) lines.push(`Used ${listNames(used)}.`);

  const all = flatten(steps);
  const blocked = [
    ...new Set(
      all
        .filter((step) => step.tone === "deny" && step.title.startsWith("Blocked by "))
        .map((step) => step.title.replace(/^Blocked by /, "")),
    ),
  ];
  if (blocked.length) lines.push(`Blocked ${listNames(blocked)}.`);

  const handoffs = [...new Set(all.filter((step) => step.title.startsWith("Handed to ")).map((step) => step.title.replace(/^Handed to /, "")))];
  if (handoffs.length) lines.push(`Handed work to ${listNames(handoffs)}.`);

  const jev = all.filter((step) => step.title.startsWith("Jev"));
  if (jev.some((step) => step.tone === "deny")) lines.push("Jev stopped part of this turn.");
  else if (jev.length) lines.push("Jev checked this turn and let it through.");

  if (all.some((step) => step.asked)) lines.push("Asked you before using a tool.");
  const hooks = all.filter((step) => step.title.endsWith(" would run")).length;
  if (hooks) lines.push(`${hooks} ${hooks === 1 ? "hook" : "hooks"} would have run.`);
  return lines;
}

export function changeSummary(before: HarnessConfig, after: HarnessConfig): string | null {
  const labels: string[] = [];
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  if (!same(before.root.instructions, after.root.instructions)) labels.push("System Prompt");
  if (!same(before.root.rules, after.root.rules)) labels.push("Rules");
  if (!same(before.root.tools, after.root.tools) || !same(before.root.policies, after.root.policies)) labels.push("Permissions");
  if (!same(before.root.model, after.root.model)) labels.push("Model");
  if (!same(before.root.decisions, after.root.decisions)) labels.push("Jev");
  if (!same(before.root.hooks, after.root.hooks)) labels.push("Hooks");
  if (!same(before.root.loops, after.root.loops)) labels.push("Loop");
  if (!same(before.root.contexts, after.root.contexts)) labels.push("Context");
  if (!same(before.root.progressRecords, after.root.progressRecords)) labels.push("Progress");
  if (!same(before.root.skills, after.root.skills)) labels.push("Skills");
  if (!same(before.root.sandboxes, after.root.sandboxes)) labels.push("Sandbox");
  if (!same(before.root.verifiers, after.root.verifiers)) labels.push("Verifier");
  if (!same(
    before.subagents.map((agent) => agent.name + agent.description),
    after.subagents.map((agent) => agent.name + agent.description),
  )) {
    labels.push("Subagents");
  }
  if (labels.length === 0) {
    return same(before, after) ? null : "Harness changed";
  }
  return `Harness changed: ${labels.join(", ")} edited`;
}

export function inputSummary(input: unknown): string {
  if (!input || typeof input !== "object") return "";
  const record = input as Record<string, unknown>;
  const value = record.path ?? record.command ?? record.query ?? record.url ?? record.task ?? record.request;
  return typeof value === "string" ? value : "";
}
