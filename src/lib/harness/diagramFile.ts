import { z } from "zod";
import { presentEdge } from "./connections";
import { defaultConfig } from "./kinds";
import type { HarnessEdge, HarnessNode, HarnessNodeData, NodeKind } from "./types";

export const DIAGRAM_VERSION = 1;

const kindSchema = z.enum([
  "agent",
  "model",
  "prompt",
  "loop",
  "context",
  "progress",
  "skill",
  "tool",
  "mcp",
  "rule",
  "policy",
  "sandbox",
  "hook",
  "decision",
  "verifier",
]);
const strings = z.array(z.string()).catch([]);

const configSchemas = {
  agent: z.object({ name: z.string(), description: z.string().catch("") }),
  model: z.object({
    provider: z.enum(["anthropic", "openai", "google", "other"]).catch("other"),
    modelId: z.string().catch(""),
    temperature: z.number().min(0).max(2).nullable().catch(null),
    maxOutputTokens: z.number().int().positive().nullable().catch(null),
    reasoningEffort: z.enum(["default", "low", "medium", "high", "xhigh", "max"]).catch("default"),
  }),
  prompt: z.object({ title: z.string().catch("Instructions"), content: z.string().catch("") }),
  loop: z.object({
    name: z.string().catch("Loop"),
    mode: z.enum(["workflow", "autonomous"]).catch("autonomous"),
    maxSteps: z.number().int().min(0).max(100).catch(8),
    stopOnBlocker: z.boolean().catch(true),
  }),
  context: z.object({
    name: z.string().catch("Context"),
    budgetChars: z.number().int().min(0).catch(8000),
    compactHistory: z.boolean().catch(true),
    alwaysLoad: strings,
    onDemand: strings,
    treatAsUntrusted: z.boolean().catch(true),
  }),
  progress: z.object({
    name: z.string().catch("Progress"),
    objective: z.string().catch(""),
    checklist: strings,
    notes: z.string().catch(""),
  }),
  skill: z.object({
    name: z.string().catch(""),
    description: z.string().catch(""),
    content: z.string().catch(""),
  }),
  tool: z.object({
    tool: z.enum(["read", "edit", "shell", "webSearch", "webFetch"]),
    mode: z.enum(["allow", "ask", "deny"]).catch("ask"),
  }),
  mcp: z.object({
    name: z.string().catch(""),
    transport: z.enum(["stdio", "http"]).catch("stdio"),
    command: z.string().catch(""),
    args: strings,
    url: z.string().catch(""),
    envVars: strings,
    authTokenEnvVar: z.string().catch(""),
  }),
  rule: z.object({
    name: z.string().catch(""),
    description: z.string().catch(""),
    alwaysApply: z.boolean().catch(true),
    globs: strings,
    content: z.string().catch(""),
  }),
  policy: z.object({
    name: z.string().catch("Permissions"),
    allowCommands: strings,
    denyCommands: strings,
    allowNetwork: z.boolean().catch(true),
    allowedDomains: strings,
  }),
  sandbox: z.object({
    name: z.string().catch("Sandbox"),
    access: z.enum(["read-only", "workspace"]).catch("workspace"),
    timeoutSeconds: z.number().int().min(0).catch(30),
  }),
  hook: z.object({
    name: z.string().catch(""),
    event: z.enum(["preToolUse", "postToolUse", "sessionStart", "userPromptSubmit", "stop"]).catch("postToolUse"),
    scope: z.enum(["any", "shell", "edit"]).catch("any"),
    command: z.string().catch(""),
  }),
  decision: z.object({
    name: z.string().catch("Jev gate"),
    model: z.string().catch("jev-latest"),
    event: z.enum(["preToolUse", "userPromptSubmit", "stop"]).catch("preToolUse"),
    scope: z.enum(["any", "shell", "edit"]).catch("any"),
    questions: z
      .array(
        z.object({
          name: z.string().catch("block"),
          type: z.enum(["choice", "score", "noul"]).catch("noul"),
          instructions: z.string().catch(""),
          criteria: strings,
          blockChoices: strings,
          blockAt: z.number().catch(0.5),
        }),
      )
      .catch([]),
  }),
  verifier: z.object({
    name: z.string().catch("Verifier"),
    check: z.enum(["command", "rubric"]).catch("command"),
    command: z.string().catch(""),
    rubric: z.string().catch(""),
    separateEvaluator: z.boolean().catch(true),
  }),
} satisfies Record<NodeKind, z.ZodType>;

const fileSchema = z.object({
  version: z.number(),
  name: z.string().catch("Imported harness"),
  nodes: z.array(
    z.object({
      id: z.string(),
      position: z.object({ x: z.number(), y: z.number() }),
      data: z.object({ kind: kindSchema, config: z.record(z.string(), z.unknown()) }),
    }),
  ),
  edges: z.array(
    z.object({
      id: z.string(),
      source: z.string(),
      target: z.string(),
      sourceHandle: z.string().nullable().optional(),
      targetHandle: z.string().nullable().optional(),
      role: z.enum(["parts", "delegate"]).optional(),
      data: z.object({ role: z.enum(["parts", "delegate"]) }).optional(),
    }),
  ),
});

export interface DiagramDocument {
  name: string;
  nodes: HarnessNode[];
  edges: HarnessEdge[];
}

export function serializeDiagram(doc: DiagramDocument): string {
  return `${JSON.stringify(
    {
      version: DIAGRAM_VERSION,
      name: doc.name,
      nodes: doc.nodes.map(({ id, position, data }) => ({ id, position, data })),
      edges: doc.edges.map(({ id, source, target, data }) => ({
        id,
        source,
        target,
        role: data?.role,
      })),
    },
    null,
    2,
  )}\n`;
}

/** Parses a saved diagram, filling in defaults for anything missing. Throws a readable error. */
export function parseDiagram(text: string): DiagramDocument {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("That file isn't valid JSON. Choose a .harness.json file saved from Harness Studio.");
  }
  const parsed = fileSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error("That file doesn't look like a Harness Studio diagram.");
  }
  if (parsed.data.version > DIAGRAM_VERSION) {
    throw new Error("That diagram was saved by a newer version of Harness Studio.");
  }

  const nodes: HarnessNode[] = [];
  for (const node of parsed.data.nodes) {
    const kind = node.data.kind;
    const merged = { ...defaultConfig(kind), ...node.data.config };
    const config = configSchemas[kind].safeParse(merged);
    if (!config.success) {
      throw new Error(`A ${kind} card in that file has settings Harness Studio can't read.`);
    }
    nodes.push({
      id: node.id,
      type: "harness",
      position: node.position,
      data: { kind, config: config.data } as HarnessNodeData,
    });
  }
  const ids = new Set(nodes.map((n) => n.id));
  const edges = parsed.data.edges
    .filter((e) => ids.has(e.source) && ids.has(e.target))
    .map((e) =>
      presentEdge({
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle,
        targetHandle: e.targetHandle,
        data: e.data ?? (e.role ? { role: e.role } : undefined),
      }),
    );
  return { name: parsed.data.name, nodes, edges };
}
