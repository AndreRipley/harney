import { isDelegateEdge, isPartsEdge, parentMap } from "./connections";
import { KIND_META, nodeTitle, slugify } from "./kinds";
import type {
  BuiltinTool,
  CompiledAgent,
  Feature,
  HarnessConfig,
  HarnessEdge,
  HarnessNode,
  Issue,
  McpData,
  PolicyData,
  ToolMode,
} from "./types";

export interface CompileResult {
  config: HarnessConfig | null;
  issues: Issue[];
  /** Node ids that end up in the export. */
  connected: Set<string>;
  rootId: string | null;
}

const ENV_VAR_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

function buildAgent(agent: HarnessNode, nodes: HarnessNode[], edges: HarnessEdge[]): CompiledAgent {
  if (agent.data.kind !== "agent") throw new Error("Expected an agent node");
  const parts = edges
    .filter((e) => e.target === agent.id && isPartsEdge(e))
    .map((e) => nodes.find((n) => n.id === e.source))
    .filter((n): n is HarnessNode => Boolean(n))
    .sort((a, b) => a.position.y - b.position.y);

  const compiled: CompiledAgent = {
    nodeId: agent.id,
    name: agent.data.config.name.trim(),
    slug: slugify(agent.data.config.name),
    description: agent.data.config.description.trim(),
    model: null,
    instructions: [],
    rules: [],
    tools: [],
    policies: [],
    mcpServers: [],
    hooks: [],
  };

  for (const part of parts) {
    const nodeId = part.id;
    switch (part.data.kind) {
      case "model":
        compiled.model ??= { ...part.data.config, nodeId };
        break;
      case "prompt":
        compiled.instructions.push({ ...part.data.config, nodeId });
        break;
      case "rule":
        compiled.rules.push({ ...part.data.config, nodeId });
        break;
      case "tool":
        compiled.tools.push({ ...part.data.config, nodeId });
        break;
      case "policy":
        compiled.policies.push({ ...part.data.config, nodeId });
        break;
      case "mcp":
        compiled.mcpServers.push({ ...part.data.config, nodeId });
        break;
      case "hook":
        compiled.hooks.push({ ...part.data.config, nodeId });
        break;
    }
  }
  return compiled;
}

function nodeIssues(node: HarnessNode): Omit<Issue, "id">[] {
  const issues: Omit<Issue, "id">[] = [];
  const title = nodeTitle(node.data);
  const push = (severity: Issue["severity"], message: string) =>
    issues.push({ severity, message, nodeId: node.id });

  switch (node.data.kind) {
    case "agent":
      if (!node.data.config.name.trim()) push("error", "An agent needs a name.");
      break;
    case "model":
      if (!node.data.config.modelId.trim()) push("error", "Choose which model to use.");
      break;
    case "prompt":
      if (!node.data.config.content.trim()) push("warning", `"${title}" is empty.`);
      break;
    case "mcp": {
      const c = node.data.config;
      if (!c.name.trim()) push("error", "An MCP server needs a name.");
      if (c.transport === "stdio" && !c.command.trim())
        push("error", `${title}: add the command that starts the server.`);
      if (c.transport === "http") {
        if (!c.url.trim()) push("error", `${title}: add the server URL.`);
        else if (!/^https?:\/\//.test(c.url.trim()))
          push("error", `${title}: the URL should start with http:// or https://.`);
      }
      const badVars = [...c.envVars, c.authTokenEnvVar].filter(
        (v) => v && !ENV_VAR_PATTERN.test(v),
      );
      if (badVars.length)
        push("error", `${title}: "${badVars[0]}" isn't a valid variable name. Use letters, numbers and _.`);
      break;
    }
    case "rule":
      if (!node.data.config.name.trim()) push("error", "A rule needs a name.");
      if (!node.data.config.content.trim()) push("warning", `Rule "${title}" has no content yet.`);
      if (!node.data.config.alwaysApply && node.data.config.globs.length === 0)
        push("warning", `Rule "${title}" isn't set to always apply and has no file patterns.`);
      break;
    case "hook":
      if (!node.data.config.command.trim()) push("error", `Hook "${title}" needs a command to run.`);
      break;
    case "policy":
    case "tool":
      break;
  }
  return issues;
}

export function compileGraph(nodes: HarnessNode[], edges: HarnessEdge[]): CompileResult {
  const raw: Omit<Issue, "id">[] = [];
  const agents = nodes.filter((n) => n.data.kind === "agent");

  if (agents.length === 0) {
    return {
      config: null,
      issues: [{ id: "no-agent", severity: "error", message: "Add an Agent card to get started." }],
      connected: new Set(),
      rootId: null,
    };
  }

  const parents = parentMap(edges.filter((e) => nodes.some((n) => n.id === e.source)));
  const roots = agents.filter((a) => !parents.has(a.id));
  const childCount = (id: string) => edges.filter((e) => e.source === id && isDelegateEdge(e)).length;
  const partCount = (id: string) => edges.filter((e) => e.target === id && isPartsEdge(e)).length;
  const root = [...roots].sort(
    (a, b) => childCount(b.id) - childCount(a.id) || partCount(b.id) - partCount(a.id),
  )[0];

  for (const extra of roots) {
    if (extra.id === root.id) continue;
    raw.push({
      severity: "error",
      nodeId: extra.id,
      message: `"${nodeTitle(extra.data)}" isn't connected to ${nodeTitle(root.data)}. Drag from the bottom of ${nodeTitle(root.data)} to its top to make it a subagent, or delete it.`,
    });
  }

  const descendants: HarnessNode[] = [];
  const queue = [root.id];
  while (queue.length) {
    const current = queue.shift()!;
    for (const edge of edges) {
      if (isDelegateEdge(edge) && edge.source === current) {
        const child = nodes.find((n) => n.id === edge.target);
        if (child && !descendants.includes(child)) {
          descendants.push(child);
          queue.push(child.id);
        }
      }
    }
  }

  const compiledRoot = buildAgent(root, nodes, edges);
  const subagents = descendants.map((d) => buildAgent(d, nodes, edges));
  const all = [compiledRoot, ...subagents];

  const connected = new Set<string>();
  for (const agent of all) {
    connected.add(agent.nodeId);
    for (const e of edges) if (e.target === agent.nodeId && isPartsEdge(e)) connected.add(e.source);
  }

  for (const node of nodes) {
    if (node.data.kind === "agent") {
      raw.push(...nodeIssues(node));
      continue;
    }
    if (!connected.has(node.id)) {
      raw.push({
        severity: "warning",
        nodeId: node.id,
        message: `${KIND_META[node.data.kind].label} "${nodeTitle(node.data)}" isn't connected to an agent, so it's left out.`,
      });
    }
    raw.push(...nodeIssues(node));
  }

  const seenSlugs = new Map<string, string>();
  for (const agent of all) {
    const existing = seenSlugs.get(agent.slug);
    if (existing) {
      raw.push({
        severity: "error",
        nodeId: agent.nodeId,
        message: `Two agents are named "${agent.name}". Give each agent a different name.`,
      });
    }
    seenSlugs.set(agent.slug, agent.nodeId);

    const hasInstructions = agent.instructions.some((i) => i.content.trim());
    if (!hasInstructions) {
      const isRoot = agent === compiledRoot;
      raw.push({
        severity: isRoot ? "warning" : "error",
        nodeId: agent.nodeId,
        message: isRoot
          ? `${agent.name || "The main agent"} has no instructions yet. Connect a System Prompt.`
          : `${agent.name || "This subagent"} has no instructions yet. Subagents need a System Prompt.`,
      });
    }
    if (agent === compiledRoot && !agent.model) {
      raw.push({
        severity: "warning",
        nodeId: agent.nodeId,
        message: `${agent.name || "The main agent"} has no model, so each tool will use its default.`,
      });
    }
    if (agent !== compiledRoot && !agent.description) {
      raw.push({
        severity: "warning",
        nodeId: agent.nodeId,
        message: `Describe when ${agent.name || "this subagent"} should be used, so the main agent knows when to hand work to it.`,
      });
    }

    const mcpNames = new Set<string>();
    for (const server of agent.mcpServers) {
      const key = server.name.trim().toLowerCase();
      if (key && mcpNames.has(key)) {
        raw.push({
          severity: "error",
          nodeId: server.nodeId,
          message: `${agent.name} has two MCP servers named "${server.name}".`,
        });
      }
      mcpNames.add(key);
    }
  }

  const issues = raw.map((issue, index) => ({ ...issue, id: `${issue.nodeId ?? "graph"}-${index}` }));
  issues.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "error" ? -1 : 1));

  return {
    config: { root: compiledRoot, subagents },
    issues,
    connected,
    rootId: root.id,
  };
}

const MODE_STRICTNESS: Record<ToolMode, number> = { allow: 0, ask: 1, deny: 2 };

/** Resolves each built-in tool to its strictest setting on this agent. */
export function toolModes(agent: CompiledAgent): Partial<Record<BuiltinTool, ToolMode>> {
  const modes: Partial<Record<BuiltinTool, ToolMode>> = {};
  for (const { tool, mode } of agent.tools) {
    const current = modes[tool];
    if (!current || MODE_STRICTNESS[mode] > MODE_STRICTNESS[current]) modes[tool] = mode;
  }
  return modes;
}

export function mergePolicies(policies: PolicyData[]): PolicyData {
  const unique = (items: string[]) => [...new Set(items.map((i) => i.trim()).filter(Boolean))];
  return {
    name: "Merged",
    allowCommands: unique(policies.flatMap((p) => p.allowCommands)),
    denyCommands: unique(policies.flatMap((p) => p.denyCommands)),
    allowNetwork: policies.every((p) => p.allowNetwork),
    allowedDomains: unique(policies.flatMap((p) => p.allowedDomains)),
  };
}

export const allAgents = (config: HarnessConfig) => [config.root, ...config.subagents];

/** MCP servers across all agents, de-duplicated by name. The main agent's version wins. */
export function projectMcpServers(config: HarnessConfig): (McpData & { nodeId: string })[] {
  const byName = new Map<string, McpData & { nodeId: string }>();
  for (const agent of allAgents(config)) {
    for (const server of agent.mcpServers) {
      const key = server.name.trim();
      if (key && !byName.has(key)) byName.set(key, server);
    }
  }
  return [...byName.values()];
}

export const projectHooks = (config: HarnessConfig) => allAgents(config).flatMap((a) => a.hooks);

export const projectPolicy = (config: HarnessConfig) =>
  mergePolicies(allAgents(config).flatMap((a) => a.policies));

/** Which harness features the config uses, and which cards provide them. */
export function usedFeatures(config: HarnessConfig): Map<Feature, string[]> {
  const features = new Map<Feature, string[]>();
  const add = (feature: Feature, nodeId: string) => {
    const list = features.get(feature) ?? [];
    if (!list.includes(nodeId)) list.push(nodeId);
    features.set(feature, list);
  };

  for (const agent of allAgents(config)) {
    if (agent.model) {
      add("model", agent.model.nodeId);
      if (agent.model.temperature !== null) add("temperature", agent.model.nodeId);
      if (agent.model.maxOutputTokens !== null) add("maxTokens", agent.model.nodeId);
      if (agent.model.reasoningEffort !== "default") add("reasoning", agent.model.nodeId);
    }
    for (const i of agent.instructions) add("instructions", i.nodeId);
    for (const r of agent.rules) {
      add("rules", r.nodeId);
      if (!r.alwaysApply && r.globs.length) add("ruleGlobs", r.nodeId);
    }
    for (const t of agent.tools) add("toolPermissions", t.nodeId);
    for (const p of agent.policies) {
      if (p.allowCommands.length || p.denyCommands.length) add("commandRules", p.nodeId);
      if (!p.allowNetwork || p.allowedDomains.length) add("network", p.nodeId);
    }
    for (const m of agent.mcpServers) add("mcp", m.nodeId);
    for (const h of agent.hooks) add("hooks", h.nodeId);
  }
  for (const sub of config.subagents) add("subagents", sub.nodeId);
  return features;
}
