import { allAgents, projectHooks, projectMcpServers } from "../compile";
import { progressPathFor, renderRuntime, runtimeFiles, verifierCommands } from "../runtime";
import { buildDecisionExport, cursorDecisionEvent } from "./decisions";
import { slugify } from "../kinds";
import type { ExportFile, Feature, HarnessConfig, HookData, TargetNote } from "../types";
import {
  type FeatureSupport,
  joinSections,
  renderInstructions,
  toJson,
  uniqueNamer,
  yamlString,
} from "./shared";

export const CURSOR_SUPPORT: Record<Feature, FeatureSupport> = {
  model: { level: "none", note: "Cursor's model is picked in its model menu, not in a project file." },
  temperature: { level: "none", note: "Cursor doesn't let you set temperature." },
  maxTokens: { level: "none", note: "Cursor doesn't let you set max output tokens." },
  reasoning: { level: "none", note: "Pick a thinking model in Cursor's model menu instead." },
  instructions: { level: "full", note: "Written as an always-on rule in .cursor/rules/." },
  rules: { level: "full", note: "Each rule gets its own file in .cursor/rules/." },
  ruleGlobs: { level: "full", note: "File patterns are set on each rule file." },
  toolPermissions: { level: "none", note: "Set tool access in Cursor Settings > Agents." },
  commandRules: { level: "none", note: "Set command allow and block lists in Cursor Settings > Agents." },
  network: { level: "none", note: "Cursor's project files can't limit network access." },
  mcp: { level: "full", note: "Written to .cursor/mcp.json." },
  hooks: { level: "partial", note: "Written to .cursor/hooks.json. Some moments have no Cursor equivalent." },
  decisions: { level: "partial", note: "Runs as a Cursor hook that asks Jev. A decision on file edits has no matching moment, so it's left out." },
  subagents: { level: "partial", note: "Each subagent becomes a rule Cursor pulls in when its description matches." },
  loop: { level: "partial", note: "Written into the rule text as a step limit. Cursor does not enforce the cap." },
  context: { level: "partial", note: "Written into the rule text. Cursor does not trim context for you." },
  progress: { level: "full", note: "PROGRESS.md holds the objective, checklist and notes. The rule tells the agent to update it." },
  skill: { level: "partial", note: "Written to .cursor/skills. Cursor does not load that folder on its own; the rule text tells the agent when to read it." },
  sandbox: { level: "partial", note: "Written into the rule text. Cursor project files cannot enforce a sandbox." },
  verifier: { level: "partial", note: "A command check becomes a stop hook. A rubric is written into the rule. A separate evaluator is an instruction, not a second process." },
};

function mdc(frontmatter: { description: string; globs?: string[]; alwaysApply: boolean }, body: string) {
  const lines = [
    "---",
    `description: ${yamlString(frontmatter.description)}`,
    `globs: ${frontmatter.globs?.length ? frontmatter.globs.join(", ") : ""}`.trimEnd(),
    `alwaysApply: ${frontmatter.alwaysApply}`,
    "---",
  ];
  return `${lines.join("\n")}\n\n${body}`;
}

function cursorHookEvent(hook: HookData): string | null {
  switch (hook.event) {
    case "preToolUse":
      return hook.scope === "edit" ? null : "beforeShellExecution";
    case "postToolUse":
      return hook.scope === "shell" ? null : "afterFileEdit";
    case "userPromptSubmit":
      return "beforeSubmitPrompt";
    case "stop":
      return "stop";
    case "sessionStart":
      return null;
  }
}

export function buildCursor(config: HarnessConfig): { files: ExportFile[]; notes: TargetNote[] } {
  const notes: TargetNote[] = [];
  const files: ExportFile[] = [];
  const { root, subagents } = config;
  const name = uniqueNamer();

  const rootFile = name(root.slug);
  files.push({
    path: `.cursor/rules/${rootFile}.mdc`,
    content: mdc(
      { description: root.description || `Core instructions for ${root.name}`, alwaysApply: true },
      joinSections(`# ${root.name}`, renderInstructions(root), renderRuntime(root, { progressPath: progressPathFor(root, true) })),
    ),
    description: `${root.name}'s main instructions. Always applied to every chat.`,
  });

  const seenRules = new Set<string>();
  for (const agent of allAgents(config)) {
    for (const rule of agent.rules) {
      if (seenRules.has(rule.nodeId) || !rule.content.trim()) continue;
      seenRules.add(rule.nodeId);
      const scoped = !rule.alwaysApply && rule.globs.length > 0;
      files.push({
        path: `.cursor/rules/${name(slugify(rule.name, "rule"))}.mdc`,
        content: mdc(
          {
            description: rule.description || rule.name,
            globs: scoped ? rule.globs : undefined,
            alwaysApply: !scoped && rule.alwaysApply,
          },
          `${rule.content.trim()}\n`,
        ),
        description: scoped
          ? `The "${rule.name}" rule. Applied when you work on ${rule.globs.join(", ")}.`
          : `The "${rule.name}" rule. Always applied.`,
      });
    }
  }

  for (const sub of subagents) {
    files.push({
      path: `.cursor/rules/${name(`agent-${sub.slug}`)}.mdc`,
      content: mdc(
        { description: `Act as ${sub.name}: ${sub.description || sub.name}`, alwaysApply: false },
        joinSections(`# ${sub.name}`, sub.description, renderInstructions(sub), renderRuntime(sub, { progressPath: progressPathFor(sub, false) })),
      ),
      description: `${sub.name}'s instructions as a rule. Cursor pulls it in when a request matches, or when you mention @${sub.slug}.`,
    });
  }

  const servers = projectMcpServers(config);
  if (servers.length) {
    const mcpServers: Record<string, unknown> = {};
    for (const server of servers) {
      if (server.transport === "http") {
        const entry: Record<string, unknown> = { url: server.url.trim() };
        if (server.authTokenEnvVar) {
          entry.headers = { Authorization: `Bearer \${env:${server.authTokenEnvVar}}` };
        }
        mcpServers[server.name.trim()] = entry;
      } else {
        const entry: Record<string, unknown> = { command: server.command.trim() };
        if (server.args.length) entry.args = server.args;
        if (server.envVars.length) {
          entry.env = Object.fromEntries(server.envVars.map((v) => [v, `\${env:${v}}`]));
        }
        mcpServers[server.name.trim()] = entry;
      }
    }
    files.push({
      path: ".cursor/mcp.json",
      content: toJson({ mcpServers }),
      description: "The MCP servers Cursor can use. Turn them on in Cursor Settings > MCP.",
    });
  }

  const hooks: Record<string, { command: string }[]> = {};
  const skipped: string[] = [];
  for (const hook of projectHooks(config)) {
    if (!hook.command.trim()) continue;
    const event = cursorHookEvent(hook);
    if (!event) {
      skipped.push(hook.nodeId);
      continue;
    }
    (hooks[event] ??= []).push({ command: hook.command.trim() });
  }
  const decisions = buildDecisionExport(config, "cursor");
  files.push(...decisions.files);
  for (const decision of decisions.entries) {
    const event = cursorDecisionEvent(decision);
    if (!event) continue;
    (hooks[event] ??= []).push({ command: decision.command });
  }
  skipped.push(...decisions.skipped);
  for (const check of allAgents(config).flatMap(verifierCommands)) {
    (hooks.stop ??= []).push({ command: check.command });
  }
  files.push(...runtimeFiles(root, "cursor", progressPathFor(root, true)));
  for (const sub of subagents) files.push(...runtimeFiles(sub, "cursor", progressPathFor(sub, false)));
  if (Object.keys(hooks).length) {
    files.push({
      path: ".cursor/hooks.json",
      content: toJson({ version: 1, hooks }),
      description: "Commands Cursor runs automatically at set moments, like after a file is edited.",
    });
  }
  if (skipped.length) {
    notes.push({
      message: "Cursor has no matching moment for some hooks (session start, before file edits, or after shell commands), so they're left out.",
      nodeIds: skipped,
      dropped: true,
    });
  }

  return { files, notes };
}
