import type {
  BuiltinTool,
  HarnessNodeData,
  HookEvent,
  HookScope,
  KindDataMap,
  NodeKind,
  Provider,
  ReasoningEffort,
  ToolMode,
} from "./types";

export type KindGroup = "core" | "capabilities" | "guardrails";

export interface KindMeta {
  label: string;
  blurb: string;
  group: KindGroup;
  color: string;
}

export const KIND_META: Record<NodeKind, KindMeta> = {
  agent: {
    label: "Agent",
    blurb: "The assistant itself. Connect parts to its left side.",
    group: "core",
    color: "#6366f1",
  },
  model: {
    label: "Model",
    blurb: "Which AI model the agent thinks with.",
    group: "core",
    color: "#8b5cf6",
  },
  prompt: {
    label: "System Prompt",
    blurb: "Standing instructions the agent always follows.",
    group: "core",
    color: "#3b82f6",
  },
  tool: {
    label: "Tool",
    blurb: "A built-in ability: reading, editing, shell, web.",
    group: "capabilities",
    color: "#14b8a6",
  },
  mcp: {
    label: "MCP Server",
    blurb: "An external service the agent can use, like GitHub.",
    group: "capabilities",
    color: "#06b6d4",
  },
  rule: {
    label: "Rule",
    blurb: "Conventions for specific files or the whole project.",
    group: "guardrails",
    color: "#f59e0b",
  },
  policy: {
    label: "Permission Policy",
    blurb: "Commands and websites the agent may or may not use.",
    group: "guardrails",
    color: "#f43f5e",
  },
  hook: {
    label: "Hook",
    blurb: "A command that runs automatically at a set moment.",
    group: "guardrails",
    color: "#64748b",
  },
};

export const KIND_ORDER: NodeKind[] = [
  "agent",
  "model",
  "prompt",
  "tool",
  "mcp",
  "rule",
  "policy",
  "hook",
];

export const GROUP_LABELS: Record<KindGroup, string> = {
  core: "Core",
  capabilities: "Capabilities",
  guardrails: "Guardrails",
};

export const PROVIDER_LABELS: Record<Provider, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  google: "Google",
  other: "Other",
};

export const MODEL_SUGGESTIONS: Record<Provider, string[]> = {
  anthropic: ["sonnet", "opus", "haiku"],
  openai: ["gpt-6-sol", "gpt-6-luna"],
  google: ["gemini-3-pro", "gemini-3-flash"],
  other: [],
};

export const REASONING_LABELS: Record<ReasoningEffort, string> = {
  default: "Tool default",
  low: "Low",
  medium: "Medium",
  high: "High",
  xhigh: "Extra high",
  max: "Max",
};

export const TOOL_LABELS: Record<BuiltinTool, string> = {
  read: "Read files",
  edit: "Edit files",
  shell: "Run shell commands",
  webSearch: "Web search",
  webFetch: "Fetch web pages",
};

export const TOOL_MODE_LABELS: Record<ToolMode, string> = {
  allow: "Allow",
  ask: "Ask first",
  deny: "Deny",
};

export const HOOK_EVENT_LABELS: Record<HookEvent, string> = {
  preToolUse: "Before a tool runs",
  postToolUse: "After a tool runs",
  sessionStart: "When a session starts",
  userPromptSubmit: "When you send a message",
  stop: "When the agent finishes",
};

export const HOOK_SCOPE_LABELS: Record<HookScope, string> = {
  any: "Any tool",
  shell: "Shell commands",
  edit: "File edits",
};

export const isToolEvent = (event: HookEvent) =>
  event === "preToolUse" || event === "postToolUse";

export function defaultConfig<K extends NodeKind>(kind: K): KindDataMap[K] {
  const defaults: KindDataMap = {
    agent: { name: "New agent", description: "" },
    model: {
      provider: "anthropic",
      modelId: "sonnet",
      temperature: null,
      maxOutputTokens: null,
      reasoningEffort: "default",
    },
    prompt: { title: "Instructions", content: "" },
    tool: { tool: "read", mode: "allow" },
    mcp: {
      name: "",
      transport: "stdio",
      command: "",
      args: [],
      url: "",
      envVars: [],
      authTokenEnvVar: "",
    },
    rule: { name: "New rule", description: "", alwaysApply: true, globs: [], content: "" },
    policy: {
      name: "Permissions",
      allowCommands: [],
      denyCommands: [],
      allowNetwork: true,
      allowedDomains: [],
    },
    hook: { name: "New hook", event: "postToolUse", scope: "edit", command: "" },
  };
  return structuredClone(defaults[kind]);
}

export function makeNodeData<K extends NodeKind>(
  kind: K,
  config?: Partial<KindDataMap[K]>,
): HarnessNodeData {
  return { kind, config: { ...defaultConfig(kind), ...config } } as unknown as HarnessNodeData;
}

const truncate = (text: string, max = 70) => {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
};

/** Headline shown in bold on a canvas card. */
export function nodeTitle(data: HarnessNodeData): string {
  switch (data.kind) {
    case "agent":
      return data.config.name || "Unnamed agent";
    case "model":
      return data.config.modelId || "No model chosen";
    case "prompt":
      return data.config.title || "Instructions";
    case "tool":
      return TOOL_LABELS[data.config.tool];
    case "mcp":
      return data.config.name || "Unnamed server";
    case "rule":
      return data.config.name || "Unnamed rule";
    case "policy":
      return data.config.name || "Permissions";
    case "hook":
      return data.config.name || "Unnamed hook";
  }
}

/** One-line gray summary shown under the card title. */
export function nodeSummary(data: HarnessNodeData): string {
  switch (data.kind) {
    case "agent":
      return truncate(data.config.description) || "No description yet";
    case "model": {
      const { provider, temperature, reasoningEffort } = data.config;
      const parts = [PROVIDER_LABELS[provider]];
      if (temperature !== null) parts.push(`temp ${temperature}`);
      if (reasoningEffort !== "default") parts.push(`${REASONING_LABELS[reasoningEffort].toLowerCase()} reasoning`);
      return parts.join(" · ");
    }
    case "prompt":
      return truncate(data.config.content) || "Empty. Click to write instructions";
    case "tool":
      return TOOL_MODE_LABELS[data.config.mode];
    case "mcp": {
      const { transport, command, args, url } = data.config;
      if (transport === "http") return url || "No URL yet";
      return truncate([command, ...args].join(" ")) || "No command yet";
    }
    case "rule": {
      const { alwaysApply, globs } = data.config;
      return alwaysApply || globs.length === 0 ? "Always applies" : `Applies to ${globs.join(", ")}`;
    }
    case "policy": {
      const { allowCommands, denyCommands, allowNetwork } = data.config;
      const parts: string[] = [];
      if (allowCommands.length) parts.push(`${allowCommands.length} allowed`);
      if (denyCommands.length) parts.push(`${denyCommands.length} blocked`);
      parts.push(allowNetwork ? "network on" : "network off");
      return parts.join(" · ");
    }
    case "hook": {
      const { event, scope, command } = data.config;
      const when = isToolEvent(event)
        ? `${HOOK_EVENT_LABELS[event]} (${HOOK_SCOPE_LABELS[scope].toLowerCase()})`
        : HOOK_EVENT_LABELS[event];
      return command ? `${when}: ${truncate(command, 40)}` : when;
    }
  }
}

export function slugify(text: string, fallback = "agent"): string {
  const slug = text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || fallback;
}
