import { stringify } from "smol-toml";
import { allAgents, projectHooks, projectPolicy, toolModes } from "../compile";
import { progressPathFor, renderRuntime, runtimeFiles, sandboxMode, verifierCommands } from "../runtime";
import { buildDecisionExport, type DecisionHookEntry } from "./decisions";
import { PROVIDER_LABELS } from "../kinds";
import type {
  CompiledAgent,
  ExportFile,
  Feature,
  HarnessConfig,
  HookEvent,
  HookScope,
  McpData,
  TargetNote,
} from "../types";
import { type FeatureSupport, joinSections, renderInstructions, renderRulesSection } from "./shared";

export const CODEX_SUPPORT: Record<Feature, FeatureSupport> = {
  model: { level: "full", note: "Set in .codex/config.toml and each agent file." },
  temperature: { level: "none", note: "Codex doesn't let you set temperature." },
  maxTokens: { level: "none", note: "Codex doesn't let you set max output tokens." },
  reasoning: { level: "full", note: "Set as model_reasoning_effort." },
  instructions: { level: "full", note: "Written to AGENTS.md." },
  rules: { level: "full", note: "Written to AGENTS.md." },
  ruleGlobs: { level: "partial", note: "File patterns are written as guidance in AGENTS.md rather than enforced." },
  toolPermissions: { level: "partial", note: "Mapped to Codex's sandbox mode, approval policy and web search setting." },
  commandRules: { level: "full", note: "Written as prefix rules in .codex/rules/." },
  network: { level: "partial", note: "Network can be turned on or off, but Codex can't limit it to specific websites." },
  mcp: { level: "full", note: "Written to .codex/config.toml, or to the subagent's own file." },
  hooks: { level: "full", note: "Written to hooks in .codex/config.toml." },
  decisions: { level: "full", note: "A hook runs a script that asks Jev. Set TYPESAFE_API_KEY; the key is never written into the files." },
  subagents: { level: "full", note: "Each subagent gets a file in .codex/agents/." },
  loop: { level: "partial", note: "Written into AGENTS.md as a step limit. Codex does not enforce the cap." },
  context: { level: "partial", note: "Written into AGENTS.md. Codex does not trim context for you." },
  progress: { level: "full", note: "PROGRESS.md holds the objective, checklist and notes. AGENTS.md tells the agent to update it." },
  skill: { level: "full", note: "Written to .codex/skills and listed in AGENTS.md as load-on-demand." },
  sandbox: { level: "full", note: "Sets sandbox_mode in .codex/config.toml." },
  verifier: { level: "partial", note: "A command check becomes a Stop hook. A rubric is written into AGENTS.md. A separate evaluator is an instruction, not a second process." },
};

const HOOK_EVENTS: Record<HookEvent, string> = {
  preToolUse: "PreToolUse",
  postToolUse: "PostToolUse",
  sessionStart: "SessionStart",
  userPromptSubmit: "UserPromptSubmit",
  stop: "Stop",
};

const HOOK_MATCHERS: Record<HookScope, string | null> = {
  any: null,
  shell: "^Bash$",
  edit: "Edit|Write",
};

const codexName = (agent: CompiledAgent) => agent.slug.replace(/-/g, "_");

/** TOML multi-line basic string, kept readable instead of one escaped line. */
function tomlMultiline(key: string, value: string): string {
  const escaped = value.replace(/\\/g, "\\\\").replace(/"""/g, '""\\"');
  return `${key} = """\n${escaped.trimEnd()}\n"""\n`;
}

function codexModel(agent: CompiledAgent, notes: TargetNote[]): Record<string, string> {
  const out: Record<string, string> = {};
  const model = agent.model;
  if (!model) return out;
  if (model.modelId.trim()) {
    if (model.provider === "openai") {
      out.model = model.modelId.trim();
    } else {
      notes.push({
        message: `Codex runs OpenAI models, so ${agent.name}'s ${PROVIDER_LABELS[model.provider]} model is left out and Codex's default is used.`,
        nodeIds: [model.nodeId],
        dropped: true,
      });
    }
  }
  if (model.reasoningEffort !== "default") out.model_reasoning_effort = model.reasoningEffort;
  return out;
}

function sandboxFor(agent: CompiledAgent): Record<string, string> {
  const chosen = sandboxMode(agent);
  if (chosen) return { sandbox_mode: chosen };
  const modes = toolModes(agent);
  const out: Record<string, string> = {};
  if (modes.edit === "deny" || modes.shell === "deny") out.sandbox_mode = "read-only";
  else if (modes.edit) out.sandbox_mode = "workspace-write";
  return out;
}

function mcpTable(servers: McpData[]) {
  const table: Record<string, Record<string, unknown>> = {};
  for (const server of servers) {
    const name = server.name.trim();
    if (!name) continue;
    if (server.transport === "http") {
      table[name] = { url: server.url.trim() };
      if (server.authTokenEnvVar) table[name].bearer_token_env_var = server.authTokenEnvVar;
    } else {
      table[name] = { command: server.command.trim() };
      if (server.args.length) table[name].args = server.args;
      if (server.envVars.length) table[name].env_vars = server.envVars;
    }
  }
  return table;
}

function prefixPattern(command: string): string[] | null {
  const tokens = command.trim().split(/\s+/).filter(Boolean);
  while (tokens.length && /^(\*|:\*)$/.test(tokens[tokens.length - 1])) tokens.pop();
  if (tokens.length && tokens[tokens.length - 1].endsWith(":*")) {
    tokens[tokens.length - 1] = tokens[tokens.length - 1].slice(0, -2);
  }
  if (tokens.length === 0 || tokens.some((t) => /[*?]/.test(t))) return null;
  return tokens;
}

function buildRules(config: HarnessConfig, notes: TargetNote[]): string | null {
  const policy = projectPolicy(config);
  const entries: string[] = [];
  const skipped: string[] = [];
  const add = (command: string, decision: "allow" | "forbidden") => {
    const pattern = prefixPattern(command);
    if (!pattern) {
      skipped.push(command);
      return;
    }
    entries.push(
      `prefix_rule(\n    pattern = [${pattern.map((t) => JSON.stringify(t)).join(", ")}],\n    decision = "${decision}",\n)`,
    );
  };
  for (const cmd of policy.denyCommands) add(cmd, "forbidden");
  for (const cmd of policy.allowCommands) add(cmd, "allow");
  if (skipped.length) {
    notes.push({
      message: `Codex rules match command prefixes only, so these patterns are left out: ${skipped.join(", ")}.`,
      nodeIds: config.root.policies.map((p) => p.nodeId),
    });
  }
  if (entries.length === 0) return null;
  return `# Generated by Harness Studio. Codex applies the strictest matching rule.\n\n${entries.join("\n\n")}\n`;
}

function buildConfigToml(config: HarnessConfig, notes: TargetNote[], decisions: DecisionHookEntry[]): string | null {
  const { root } = config;
  const top: Record<string, unknown> = { ...codexModel(root, notes) };
  const modes = toolModes(root);

  if (root.tools.length) {
    Object.assign(top, sandboxFor(root));
    top.approval_policy = Object.values(modes).includes("ask") ? "on-request" : "never";
    if (modes.webSearch) top.web_search = modes.webSearch === "deny" ? "disabled" : "live";
    if (modes.shell === "deny") {
      notes.push({
        message: "Codex can't turn off the shell entirely, so a denied shell becomes a read-only sandbox.",
        nodeIds: root.tools.filter((t) => t.tool === "shell").map((t) => t.nodeId),
      });
    }
  }

  const policy = projectPolicy(config);
  const tables: Record<string, unknown> = {};
  const usesNetworkRule = root.policies.length > 0 || config.subagents.some((s) => s.policies.length);
  if (usesNetworkRule && top.sandbox_mode !== "read-only") {
    tables.sandbox_workspace_write = { network_access: policy.allowNetwork };
  }

  const servers = mcpTable(root.mcpServers);
  if (Object.keys(servers).length) tables.mcp_servers = servers;

  const hooks: Record<string, unknown[]> = {};
  for (const hook of projectHooks(config)) {
    if (!hook.command.trim()) continue;
    const group: Record<string, unknown> = {};
    const matcher = HOOK_MATCHERS[hook.scope];
    if ((hook.event === "preToolUse" || hook.event === "postToolUse") && matcher) group.matcher = matcher;
    group.hooks = [{ type: "command", command: hook.command.trim() }];
    (hooks[HOOK_EVENTS[hook.event]] ??= []).push(group);
  }
  for (const decision of decisions) {
    const group: Record<string, unknown> = {};
    const matcher = HOOK_MATCHERS[decision.scope];
    if (decision.event === "preToolUse" && matcher) group.matcher = matcher;
    group.hooks = [{ type: "command", command: decision.command }];
    (hooks[HOOK_EVENTS[decision.event]] ??= []).push(group);
  }
  for (const check of allAgents(config).flatMap(verifierCommands)) {
    (hooks[HOOK_EVENTS.stop] ??= []).push({ hooks: [{ type: "command", command: check.command }] });
  }
  if (Object.keys(hooks).length) tables.hooks = hooks;

  const content = stringify({ ...top, ...tables }).trim();
  return content ? `# Generated by Harness Studio\n\n${content}\n` : null;
}

function buildAgentFile(agent: CompiledAgent, notes: TargetNote[]): ExportFile {
  const head = stringify({
    name: codexName(agent),
    description: agent.description || `Handles work for ${agent.name}.`,
  });
  const instructions = joinSections(
    renderInstructions(agent),
    renderRulesSection(agent.rules),
    renderRuntime(agent, { progressPath: progressPathFor(agent, false) }),
  );
  const settings: Record<string, unknown> = { ...codexModel(agent, notes), ...sandboxFor(agent) };
  const servers = mcpTable(agent.mcpServers);
  if (Object.keys(servers).length) settings.mcp_servers = servers;
  const tail = Object.keys(settings).length ? `\n${stringify(settings)}` : "";

  return {
    path: `.codex/agents/${agent.slug}.toml`,
    content: `${head}${tomlMultiline("developer_instructions", instructions)}${tail}`.trimEnd() + "\n",
    description: `The ${agent.name} custom agent: its instructions, model and sandbox. Codex spawns it when asked or when AGENTS.md says to.`,
  };
}

export function buildCodex(config: HarnessConfig): { files: ExportFile[]; notes: TargetNote[] } {
  const notes: TargetNote[] = [];
  const files: ExportFile[] = [];
  const { root, subagents } = config;
  const decisions = buildDecisionExport(config, "codex");
  files.push(...decisions.files);

  const subagentList = subagents.length
    ? `## Subagents\n\nThis project defines custom agents in \`.codex/agents/\`. Spawn them for work that matches what they're for:\n\n${subagents
        .map((s) => `- **${codexName(s)}**: ${s.description || s.name}`)
        .join("\n")}`
    : null;

  files.push({
    path: "AGENTS.md",
    content: joinSections(
      `# ${root.name}`,
      root.description,
      renderInstructions(root),
      renderRulesSection(root.rules),
      renderRuntime(root, { progressPath: progressPathFor(root, true) }),
      subagentList,
    ),
    description: "The instructions Codex reads before every task: your prompt, rules and subagent list.",
  });

  const configToml = buildConfigToml(config, notes, decisions.entries);
  if (configToml) {
    files.push({
      path: ".codex/config.toml",
      content: configToml,
      description: "Project settings: model, sandbox, when to ask for approval, MCP servers and hooks.",
    });
  }

  const rules = buildRules(config, notes);
  if (rules) {
    files.push({
      path: `.codex/rules/${root.slug}.rules`,
      content: rules,
      description: "Commands Codex may run without asking, and commands it must never run.",
    });
  }

  files.push(...runtimeFiles(root, "codex", progressPathFor(root, true)));
  for (const sub of subagents) {
    files.push(buildAgentFile(sub, notes));
    files.push(...runtimeFiles(sub, "codex", progressPathFor(sub, false)));
  }

  const policyDomains = projectPolicy(config).allowedDomains;
  if (policyDomains.length) {
    notes.push({
      message: "Codex can't limit network access to specific websites, so the allowed domains list is left out.",
      nodeIds: [...root.policies, ...subagents.flatMap((s) => s.policies)]
        .filter((p) => p.allowedDomains.length)
        .map((p) => p.nodeId),
    });
  }

  return { files, notes };
}
