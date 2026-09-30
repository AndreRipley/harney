import { allAgents, projectHooks, projectMcpServers, projectPolicy, toolModes } from "../compile";
import { progressPathFor, renderRuntime, runtimeFiles, verifierCommands } from "../runtime";
import { buildDecisionExport, type DecisionHookEntry } from "./decisions";
import { PROVIDER_LABELS } from "../kinds";
import type {
  BuiltinTool,
  CompiledAgent,
  ExportFile,
  Feature,
  HarnessConfig,
  HookEvent,
  HookScope,
  TargetNote,
} from "../types";
import {
  type FeatureSupport,
  joinSections,
  renderInstructions,
  renderRulesSection,
  toJson,
  yamlString,
} from "./shared";

export const CLAUDE_SUPPORT: Record<Feature, FeatureSupport> = {
  model: { level: "full", note: "Set in .claude/settings.json and each subagent file." },
  temperature: { level: "none", note: "Claude Code doesn't let you set temperature." },
  maxTokens: { level: "full", note: "Set through the CLAUDE_CODE_MAX_OUTPUT_TOKENS variable." },
  reasoning: { level: "none", note: "Claude Code picks its own thinking depth; ask it to \"think hard\" in your prompt instead." },
  instructions: { level: "full", note: "Written to CLAUDE.md." },
  rules: { level: "full", note: "Written to CLAUDE.md." },
  ruleGlobs: { level: "partial", note: "File patterns are written as guidance in CLAUDE.md rather than enforced." },
  toolPermissions: { level: "full", note: "Written to permissions in .claude/settings.json." },
  commandRules: { level: "full", note: "Written as Bash(...) permission rules." },
  network: { level: "partial", note: "Claude Code controls web fetching, not network use by shell commands." },
  mcp: { level: "full", note: "Written to .mcp.json." },
  hooks: { level: "full", note: "Written to hooks in .claude/settings.json." },
  decisions: { level: "full", note: "A hook runs a script that asks Jev. Set TYPESAFE_API_KEY; the key is never written into the files." },
  subagents: { level: "full", note: "Each subagent gets a file in .claude/agents/." },
  loop: { level: "partial", note: "Written into the instructions as a step limit. Claude Code does not enforce the cap." },
  context: { level: "partial", note: "Written into the instructions: what to load, the size budget, and that pasted content is untrusted. Claude Code does not trim context for you." },
  progress: { level: "full", note: "PROGRESS.md holds the objective, checklist and notes. The instructions tell the agent to update it." },
  skill: { level: "full", note: "Written to .claude/skills and listed in CLAUDE.md as load-on-demand." },
  sandbox: { level: "partial", note: "Written into CLAUDE.md. Claude's permission rules still come from the tool and policy cards." },
  verifier: { level: "partial", note: "A command check becomes a Stop hook. A rubric is written into CLAUDE.md. A separate evaluator is an instruction, not a second process." },
};

const PERMISSION_NAMES: Record<BuiltinTool, string> = {
  read: "Read",
  edit: "Edit",
  shell: "Bash",
  webSearch: "WebSearch",
  webFetch: "WebFetch",
};

const SUBAGENT_TOOL_NAMES: Record<BuiltinTool, string[]> = {
  read: ["Read", "Grep", "Glob"],
  edit: ["Edit", "Write"],
  shell: ["Bash"],
  webSearch: ["WebSearch"],
  webFetch: ["WebFetch"],
};

const HOOK_EVENTS: Record<HookEvent, string> = {
  preToolUse: "PreToolUse",
  postToolUse: "PostToolUse",
  sessionStart: "SessionStart",
  userPromptSubmit: "UserPromptSubmit",
  stop: "Stop",
};

const HOOK_MATCHERS: Record<HookScope, string> = {
  any: "*",
  shell: "Bash",
  edit: "Edit|Write",
};

function claudeModel(agent: CompiledAgent, notes: TargetNote[]): string | null {
  const model = agent.model;
  if (!model || !model.modelId.trim()) return null;
  if (model.provider !== "anthropic") {
    notes.push({
      message: `Claude Code only runs Anthropic models, so ${agent.name}'s ${PROVIDER_LABELS[model.provider]} model is left out and Claude Code's default is used.`,
      nodeIds: [model.nodeId],
      dropped: true,
    });
    return null;
  }
  return model.modelId.trim();
}

function buildSettings(config: HarnessConfig, notes: TargetNote[], decisions: DecisionHookEntry[]) {
  const { root } = config;
  const settings: Record<string, unknown> = {
    $schema: "https://json.schemastore.org/claude-code-settings.json",
  };

  const model = claudeModel(root, notes);
  if (model) settings.model = model;
  if (root.model?.maxOutputTokens) {
    settings.env = { CLAUDE_CODE_MAX_OUTPUT_TOKENS: String(root.model.maxOutputTokens) };
  }

  const allow: string[] = [];
  const ask: string[] = [];
  const deny: string[] = [];
  const modes = toolModes(root);
  for (const [tool, mode] of Object.entries(modes) as [BuiltinTool, string][]) {
    const bucket = mode === "allow" ? allow : mode === "ask" ? ask : deny;
    bucket.push(PERMISSION_NAMES[tool]);
  }

  const policy = projectPolicy(config);
  for (const cmd of policy.allowCommands) allow.push(`Bash(${cmd})`);
  for (const cmd of policy.denyCommands) deny.push(`Bash(${cmd})`);
  if (!policy.allowNetwork) {
    for (const name of ["WebFetch", "WebSearch"]) if (!deny.includes(name)) deny.push(name);
  }
  for (const domain of policy.allowedDomains) allow.push(`WebFetch(domain:${domain})`);

  const permissions: Record<string, string[]> = {};
  if (allow.length) permissions.allow = [...new Set(allow)];
  if (ask.length) permissions.ask = [...new Set(ask)];
  if (deny.length) permissions.deny = [...new Set(deny)];
  if (Object.keys(permissions).length) settings.permissions = permissions;

  const hooks: Record<string, unknown[]> = {};
  for (const hook of projectHooks(config)) {
    if (!hook.command.trim()) continue;
    const event = HOOK_EVENTS[hook.event];
    const group: Record<string, unknown> = {};
    if (hook.event === "preToolUse" || hook.event === "postToolUse") {
      group.matcher = HOOK_MATCHERS[hook.scope];
    }
    group.hooks = [{ type: "command", command: hook.command.trim() }];
    (hooks[event] ??= []).push(group);
  }
  for (const decision of decisions) {
    const event = HOOK_EVENTS[decision.event];
    const group: Record<string, unknown> = {};
    if (decision.event === "preToolUse") group.matcher = HOOK_MATCHERS[decision.scope];
    group.hooks = [{ type: "command", command: decision.command }];
    (hooks[event] ??= []).push(group);
  }
  for (const check of allAgents(config).flatMap(verifierCommands)) {
    (hooks[HOOK_EVENTS.stop] ??= []).push({ hooks: [{ type: "command", command: check.command }] });
  }
  if (Object.keys(hooks).length) settings.hooks = hooks;

  return Object.keys(settings).length > 1 ? settings : null;
}

function buildMcp(config: HarnessConfig) {
  const servers = projectMcpServers(config);
  if (servers.length === 0) return null;
  const mcpServers: Record<string, unknown> = {};
  for (const server of servers) {
    if (server.transport === "http") {
      const entry: Record<string, unknown> = { type: "http", url: server.url.trim() };
      if (server.authTokenEnvVar) {
        entry.headers = { Authorization: `Bearer \${${server.authTokenEnvVar}}` };
      }
      mcpServers[server.name.trim()] = entry;
    } else {
      const entry: Record<string, unknown> = { command: server.command.trim() };
      if (server.args.length) entry.args = server.args;
      if (server.envVars.length) {
        entry.env = Object.fromEntries(server.envVars.map((v) => [v, `\${${v}}`]));
      }
      mcpServers[server.name.trim()] = entry;
    }
  }
  return { mcpServers };
}

function buildSubagentFile(agent: CompiledAgent, notes: TargetNote[]): ExportFile {
  const frontmatter = [`name: ${agent.slug}`, `description: ${yamlString(agent.description || `Handles work for ${agent.name}.`)}`];

  const modes = toolModes(agent);
  const enabled = (Object.entries(modes) as [BuiltinTool, string][])
    .filter(([, mode]) => mode !== "deny")
    .flatMap(([tool]) => SUBAGENT_TOOL_NAMES[tool]);
  if (agent.tools.length) frontmatter.push(`tools: ${enabled.length ? enabled.join(", ") : "Read"}`);

  const model = claudeModel(agent, notes);
  if (model) frontmatter.push(`model: ${model}`);

  const body = joinSections(
    renderInstructions(agent),
    renderRulesSection(agent.rules),
    renderRuntime(agent, { progressPath: progressPathFor(agent, false) }),
  );
  return {
    path: `.claude/agents/${agent.slug}.md`,
    content: `---\n${frontmatter.join("\n")}\n---\n\n${body}`,
    description: `The ${agent.name} subagent: its instructions, allowed tools and model. Claude hands it work that matches its description.`,
  };
}

export function buildClaudeCode(config: HarnessConfig): { files: ExportFile[]; notes: TargetNote[] } {
  const notes: TargetNote[] = [];
  const { root, subagents } = config;
  const files: ExportFile[] = [];
  const decisions = buildDecisionExport(config, "claude");
  files.push(...decisions.files);

  const subagentList = subagents.length
    ? `## Subagents\n\nHand work to these helpers when it matches what they're for:\n\n${subagents
        .map((s) => `- **${s.slug}**: ${s.description || s.name}`)
        .join("\n")}`
    : null;

  files.push({
    path: "CLAUDE.md",
    content: joinSections(
      `# ${root.name}`,
      root.description,
      renderInstructions(root),
      renderRulesSection(root.rules),
      renderRuntime(root, { progressPath: progressPathFor(root, true) }),
      subagentList,
    ),
    description: "The instructions Claude reads at the start of every session: your prompt and rules.",
  });

  const settings = buildSettings(config, notes, decisions.entries);
  if (settings) {
    files.push({
      path: ".claude/settings.json",
      content: toJson(settings),
      description: "Project settings: which model to use, what the agent may do without asking, and hooks.",
    });
  }

  const mcp = buildMcp(config);
  if (mcp) {
    files.push({
      path: ".mcp.json",
      content: toJson(mcp),
      description: "The MCP servers Claude can connect to. Claude asks you to approve them the first time.",
    });
  }

  files.push(...runtimeFiles(root, "claude", progressPathFor(root, true)));
  for (const sub of subagents) {
    files.push(buildSubagentFile(sub, notes));
    files.push(...runtimeFiles(sub, "claude", progressPathFor(sub, false)));
  }

  const subagentExtras = subagents.filter(
    (s) => s.mcpServers.length || s.hooks.length || s.policies.length || s.decisions.length,
  );
  if (subagentExtras.length) {
    notes.push({
      message: "Claude Code applies MCP servers, hooks, Jev decisions and permission policies to the whole project, so the ones on subagents are shared with the main agent.",
      nodeIds: subagentExtras.flatMap((s) => [
        ...s.mcpServers.map((m) => m.nodeId),
        ...s.hooks.map((h) => h.nodeId),
        ...s.policies.map((p) => p.nodeId),
        ...s.decisions.map((d) => d.nodeId),
      ]),
    });
  }

  return { files, notes };
}
