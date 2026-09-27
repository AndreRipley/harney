import { z } from "zod";
import { defaultConfig } from "./kinds";
import type { HarnessEdge, HarnessNode, HarnessNodeData, NodeKind } from "./types";

export const DIAGRAM_VERSION = 1;

const kindSchema = z.enum(["agent", "model", "prompt", "tool", "mcp", "rule", "policy", "hook"]);
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
  hook: z.object({
    name: z.string().catch(""),
    event: z.enum(["preToolUse", "postToolUse", "sessionStart", "userPromptSubmit", "stop"]).catch("postToolUse"),
    scope: z.enum(["any", "shell", "edit"]).catch("any"),
    command: z.string().catch(""),
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
      edges: doc.edges.map(({ id, source, target, sourceHandle, targetHandle }) => ({
        id,
        source,
        target,
        sourceHandle,
        targetHandle,
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
  const edges = parsed.data.edges.filter((e) => ids.has(e.source) && ids.has(e.target));
  return { name: parsed.data.name, nodes, edges };
}
