import type { Edge, Node } from "@xyflow/react";

export type NodeKind =
  | "agent"
  | "model"
  | "prompt"
  | "loop"
  | "context"
  | "progress"
  | "skill"
  | "tool"
  | "mcp"
  | "rule"
  | "policy"
  | "sandbox"
  | "hook"
  | "decision"
  | "verifier";

export type ComponentKind = Exclude<NodeKind, "agent">;

export type Provider = "anthropic" | "openai" | "google" | "other";
export type ReasoningEffort = "default" | "low" | "medium" | "high" | "xhigh" | "max";
export type BuiltinTool = "read" | "edit" | "shell" | "webSearch" | "webFetch";
export type ToolMode = "allow" | "ask" | "deny";
export type HookEvent = "preToolUse" | "postToolUse" | "sessionStart" | "userPromptSubmit" | "stop";
export type HookScope = "any" | "shell" | "edit";
export type DecisionEvent = "preToolUse" | "userPromptSubmit" | "stop";
export type DecisionQuestionType = "choice" | "score" | "noul";
export type LoopMode = "workflow" | "autonomous";
export type SandboxAccess = "read-only" | "workspace";
export type VerifierCheck = "command" | "rubric";

export interface AgentData {
  name: string;
  description: string;
}

export interface ModelData {
  provider: Provider;
  modelId: string;
  temperature: number | null;
  maxOutputTokens: number | null;
  reasoningEffort: ReasoningEffort;
}

export interface PromptData {
  title: string;
  content: string;
}

export interface ToolData {
  tool: BuiltinTool;
  mode: ToolMode;
}

export interface McpData {
  name: string;
  transport: "stdio" | "http";
  command: string;
  args: string[];
  url: string;
  /** Names of environment variables the server needs. Values are never stored. */
  envVars: string[];
  /** Environment variable holding a bearer token for remote servers. */
  authTokenEnvVar: string;
}

export interface RuleData {
  name: string;
  description: string;
  alwaysApply: boolean;
  globs: string[];
  content: string;
}

export interface PolicyData {
  name: string;
  allowCommands: string[];
  denyCommands: string[];
  allowNetwork: boolean;
  allowedDomains: string[];
}

export interface HookData {
  name: string;
  event: HookEvent;
  scope: HookScope;
  command: string;
}

/** One typed question sent to Jev with the hook's stdin as the state. */
export interface DecisionQuestion {
  name: string;
  type: DecisionQuestionType;
  instructions: string;
  /** Choice lines are `key: meaning`. Score lines are the scale, low to high. */
  criteria: string[];
  /** Choice answers that block. Unused for score and noul. */
  blockChoices: string[];
  /** Noul: block when yes is at least this (0–1). Score: block when the score is at least this. */
  blockAt: number;
}

export interface DecisionData {
  name: string;
  /** Jev model id, usually `jev-latest`. */
  model: string;
  event: DecisionEvent;
  scope: HookScope;
  questions: DecisionQuestion[];
}

/** How the agent keeps going: a fixed sequence, or a loop that stops on a limit. */
export interface LoopData {
  name: string;
  mode: LoopMode;
  maxSteps: number;
  stopOnBlocker: boolean;
}

/** What the model is allowed to see on a turn. */
export interface ContextData {
  name: string;
  budgetChars: number;
  compactHistory: boolean;
  alwaysLoad: string[];
  onDemand: string[];
  treatAsUntrusted: boolean;
}

/** Durable task state that survives the model's context window. */
export interface ProgressData {
  name: string;
  objective: string;
  checklist: string[];
  notes: string;
}

/** Instructions loaded only when the task needs them. */
export interface SkillData {
  name: string;
  description: string;
  content: string;
}

/** Where actions run, separate from the session history. */
export interface SandboxData {
  name: string;
  access: SandboxAccess;
  timeoutSeconds: number;
}

/** An outcome check that is not the agent grading itself. */
export interface VerifierData {
  name: string;
  check: VerifierCheck;
  command: string;
  rubric: string;
  separateEvaluator: boolean;
}

export interface EvalScenario {
  id: string;
  name: string;
  prompt: string;
}

export interface KindDataMap {
  agent: AgentData;
  model: ModelData;
  prompt: PromptData;
  tool: ToolData;
  mcp: McpData;
  rule: RuleData;
  policy: PolicyData;
  hook: HookData;
  decision: DecisionData;
  loop: LoopData;
  context: ContextData;
  progress: ProgressData;
  skill: SkillData;
  sandbox: SandboxData;
  verifier: VerifierData;
}

export type HarnessNodeData = {
  [K in NodeKind]: { kind: K; config: KindDataMap[K] };
}[NodeKind];

export type HarnessNode = Node<HarnessNodeData, "harness">;
export type HarnessEdge = Edge;

export type TargetId = "claude" | "cursor" | "codex";

export type Severity = "error" | "warning";

export interface Issue {
  id: string;
  severity: Severity;
  message: string;
  nodeId?: string;
}

type WithNode<T> = T & { nodeId: string };

export interface CompiledAgent {
  nodeId: string;
  name: string;
  slug: string;
  description: string;
  model: WithNode<ModelData> | null;
  instructions: WithNode<PromptData>[];
  rules: WithNode<RuleData>[];
  tools: WithNode<ToolData>[];
  policies: WithNode<PolicyData>[];
  mcpServers: WithNode<McpData>[];
  hooks: WithNode<HookData>[];
  decisions: WithNode<DecisionData>[];
  loops: WithNode<LoopData>[];
  contexts: WithNode<ContextData>[];
  progressRecords: WithNode<ProgressData>[];
  skills: WithNode<SkillData>[];
  sandboxes: WithNode<SandboxData>[];
  verifiers: WithNode<VerifierData>[];
}

export interface HarnessConfig {
  root: CompiledAgent;
  subagents: CompiledAgent[];
}

export type Feature =
  | "model"
  | "temperature"
  | "maxTokens"
  | "reasoning"
  | "instructions"
  | "rules"
  | "ruleGlobs"
  | "toolPermissions"
  | "commandRules"
  | "network"
  | "mcp"
  | "hooks"
  | "decisions"
  | "subagents"
  | "loop"
  | "context"
  | "progress"
  | "skill"
  | "sandbox"
  | "verifier";

export interface ExportFile {
  path: string;
  content: string;
  description: string;
}

export interface TargetNote {
  message: string;
  nodeIds: string[];
  /** The setting is left out entirely, rather than adapted. */
  dropped?: boolean;
}
