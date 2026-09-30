import { projectDecisions, projectHooks, projectMcpServers, toolModes } from "./compile";
import { TARGETS } from "./exporters";
import { JEV_KEY_ENV } from "./jev";
import type { ExportFile, HarnessConfig, TargetId } from "./types";

export type SetupStepKind = "files" | "warning" | "secrets" | "install" | "launch" | "try";

export interface SetupItem {
  name: string;
  detail: string;
  href?: string;
}

export interface SetupStep {
  id: string;
  kind: SetupStepKind;
  title: string;
  body: string[];
  commands?: string[];
  items?: SetupItem[];
}

export const SETUP_FILE = "HARNESS-SETUP.md";

const COMMONLY_EXISTING = [
  "CLAUDE.md",
  "AGENTS.md",
  ".mcp.json",
  ".claude/settings.json",
  ".cursor/mcp.json",
  ".cursor/hooks.json",
  ".codex/config.toml",
];

const TOOL_INSTALL_LINKS: Record<TargetId, string> = {
  claude: "https://www.claude.com/product/claude-code",
  cursor: "https://cursor.com/download",
  codex: "https://developers.openai.com/codex",
};

const RUNTIMES: { match: RegExp; name: string; href: string }[] = [
  { match: /^(npx|npm|node|pnpm|pnpx|yarn)$/, name: "Node.js 18 or newer", href: "https://nodejs.org/en/download" },
  { match: /^(uv|uvx)$/, name: "uv (Python tool runner)", href: "https://docs.astral.sh/uv/getting-started/installation/" },
  { match: /^(python|python3|pip|pip3|pipx)$/, name: "Python 3", href: "https://www.python.org/downloads/" },
  { match: /^(docker)$/, name: "Docker", href: "https://docs.docker.com/get-started/get-docker/" },
  { match: /^(bun|bunx)$/, name: "Bun", href: "https://bun.sh" },
  { match: /^(deno)$/, name: "Deno", href: "https://deno.com" },
];

export const zipFileName = (config: HarnessConfig, targetId: TargetId) =>
  `${config.root.slug}-${targetId}.zip`;

const listNames = (names: string[]) =>
  names.length <= 1
    ? names.join("")
    : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;

function requiredSecrets(config: HarnessConfig): SetupItem[] {
  const byVar = new Map<string, string[]>();
  for (const server of projectMcpServers(config)) {
    const vars = server.transport === "http" ? [server.authTokenEnvVar] : server.envVars;
    for (const v of vars.filter(Boolean)) {
      byVar.set(v, [...(byVar.get(v) ?? []), server.name]);
    }
  }
  const secrets = [...byVar.entries()].map(([name, servers]) => ({
    name,
    detail: `Used by the ${listNames(servers)} server${servers.length > 1 ? "s" : ""}.`,
  }));
  if (projectDecisions(config).length) {
    secrets.push({
      name: JEV_KEY_ENV,
      detail: "Used by Jev decisions. The script reads it from the environment, so the key stays out of the files.",
    });
  }
  return secrets;
}

function requiredRuntimes(config: HarnessConfig): SetupItem[] {
  const needs = new Map<string, SetupItem>();
  const check = (command: string, usedBy: string) => {
    const first = command.trim().split(/\s+/)[0] ?? "";
    const runtime = RUNTIMES.find((r) => r.match.test(first));
    if (!runtime) return;
    const existing = needs.get(runtime.name);
    const users = existing ? `${existing.detail.replace(/^Needed by /, "").replace(/\.$/, "")}, ${usedBy}` : usedBy;
    needs.set(runtime.name, { name: runtime.name, detail: `Needed by ${users}.`, href: runtime.href });
  };
  for (const server of projectMcpServers(config)) {
    if (server.transport === "stdio") check(server.command, `the ${server.name} server`);
  }
  for (const hook of projectHooks(config)) check(hook.command, `the "${hook.name}" hook`);
  for (const decision of projectDecisions(config)) check("node", `the "${decision.name}" Jev decision`);
  return [...needs.values()];
}

function launchStep(config: HarnessConfig, targetId: TargetId, files: ExportFile[]): SetupStep {
  const servers = projectMcpServers(config).map((s) => s.name);
  const hooks = projectHooks(config);
  const { subagents, root } = config;
  const has = (path: string) => files.some((f) => f.path === path || f.path.startsWith(path));

  if (targetId === "claude") {
    const body = ["Open a terminal in your project folder and start Claude Code. It picks up the new files automatically."];
    if (servers.length)
      body.push(`Claude asks whether to use the MCP servers from .mcp.json (${listNames(servers)}). Choose to approve them.`);
    if (subagents.length) body.push("Type /agents to see your subagents. Claude hands them work that matches their descriptions.");
    if (hooks.length) body.push("Your hooks run automatically. Type /hooks any time to review them.");
    return { id: "launch", kind: "launch", title: "Start Claude Code", body, commands: ["cd path/to/your-project", "claude"] };
  }

  if (targetId === "cursor") {
    const body = ["Open your project folder in Cursor (File > Open Folder). Rules in .cursor/rules are picked up automatically; you'll find them under Cursor Settings > Rules."];
    if (servers.length) body.push(`Open Cursor Settings > MCP and make sure ${listNames(servers)} ${servers.length > 1 ? "are" : "is"} turned on.`);
    if (root.model?.modelId) body.push(`Cursor's model isn't set by files. Choose ${root.model.modelId} (or the closest match) in the model menu under the chat box.`);
    if (has(".cursor/hooks.json")) body.push("Restart Cursor once so it loads .cursor/hooks.json.");
    if (subagents.length) body.push(`Mention a subagent by name, for example @agent-${subagents[0].slug}, to bring in its instructions.`);
    return { id: "launch", kind: "launch", title: "Open the project in Cursor", body };
  }

  const body = ["Open a terminal in your project folder and start Codex."];
  if (has(".codex/")) {
    body.push("Codex only reads .codex/config.toml, rules and agent files in projects you trust. When Codex asks whether to trust this folder, choose Yes. Until then, it only reads AGENTS.md.");
  }
  if (hooks.length) body.push("Type /hooks and trust the new hooks. Codex skips hooks until you've reviewed them.");
  if (subagents.length) {
    const name = subagents[0].slug.replace(/-/g, "_");
    body.push(`Ask for a subagent by name when you want one, for example "Have ${name} look at this change."`);
  }
  return { id: "launch", kind: "launch", title: "Start Codex", body, commands: ["cd path/to/your-project", "codex"] };
}

export function suggestedPrompt(config: HarnessConfig): string {
  const { root } = config;
  const servers = projectMcpServers(config).map((s) => s.name);
  const readOnly = toolModes(root).edit === "deny";
  let prompt = "In two sentences, tell me what you're set up to do in this project.";
  if (servers.length) prompt += ` Then check that you can reach the ${listNames(servers)} server${servers.length > 1 ? "s" : ""}.`;
  prompt += readOnly
    ? " Then review my most recent changes and list anything that looks wrong."
    : " Then suggest one small improvement you could make, but don't change anything yet.";
  return prompt;
}

export function buildSetupGuide(config: HarnessConfig, targetId: TargetId, files: ExportFile[]): SetupStep[] {
  const target = TARGETS[targetId];
  const steps: SetupStep[] = [];

  steps.push({
    id: "files",
    kind: "files",
    title: "Put the files in your project",
    body: [
      "Unzip the download into the top-level folder of your project, the one that holds your .git folder or package.json. Keep the folder structure as it is; the dot-folders matter.",
    ],
    commands: [`unzip ${zipFileName(config, targetId)} -d path/to/your-project`],
    items: files.map((f) => ({ name: f.path, detail: f.description })),
  });

  const overlaps = files.map((f) => f.path).filter((p) => COMMONLY_EXISTING.includes(p));
  if (overlaps.length) {
    steps.push({
      id: "existing",
      kind: "warning",
      title: "Check for files you already have",
      body: [
        `If your project already has ${listNames(overlaps)}, unzipping will replace ${overlaps.length > 1 ? "them" : "it"}.`,
        "To keep what's there, copy the parts you need from the file list instead of unzipping over them.",
      ],
    });
  }

  const secrets = requiredSecrets(config);
  if (secrets.length) {
    steps.push({
      id: "secrets",
      kind: "secrets",
      title: "Add your secrets",
      body: [
        "The files only mention these by name, so your real keys never end up in them and they're safe to commit.",
        targetId === "cursor"
          ? "Set them in your shell profile (~/.zshrc or ~/.bashrc), then fully restart Cursor so it sees them."
          : "Add them to your shell profile (~/.zshrc or ~/.bashrc) so they're set in every new terminal.",
      ],
      items: secrets,
      commands: secrets.map((s) => `export ${s.name}="paste-your-value-here"`),
    });
  }

  const runtimes = requiredRuntimes(config);
  steps.push({
    id: "install",
    kind: "install",
    title: runtimes.length ? "Install what it needs" : `Install ${target.name}`,
    body: runtimes.length
      ? ["Some of your servers and hooks run programs that need to be installed on your computer."]
      : [`Skip this if you already have ${target.name}.`],
    items: [
      { name: target.name, detail: `Skip this if you already have it.`, href: TOOL_INSTALL_LINKS[targetId] },
      ...runtimes,
    ],
  });

  steps.push(launchStep(config, targetId, files));

  steps.push({
    id: "try",
    kind: "try",
    title: "Try it out",
    body: ["Send this as your first message to check everything is working."],
    commands: [suggestedPrompt(config)],
  });

  return steps;
}

export function setupGuideMarkdown(config: HarnessConfig, targetId: TargetId, steps: SetupStep[]): string {
  const target = TARGETS[targetId];
  const lines = [
    `# Set up ${config.root.name} in ${target.name}`,
    "",
    `This folder was exported from Harness Studio. Follow these steps to start using your harness in ${target.name}.`,
  ];
  steps.forEach((step, index) => {
    lines.push("", `## ${index + 1}. ${step.title}`, "");
    lines.push(step.body.join("\n\n"));
    if (step.items?.length) {
      lines.push("");
      for (const item of step.items) {
        const name = step.kind === "files" || step.kind === "secrets" ? `\`${item.name}\`` : item.name;
        lines.push(`- ${item.href ? `[${item.name}](${item.href})` : name}: ${item.detail}`);
      }
    }
    if (step.commands?.length) {
      const fence = step.kind === "try" ? "text" : "bash";
      lines.push("", `\`\`\`${fence}`, ...step.commands, "```");
    }
  });
  return `${lines.join("\n")}\n`;
}

export function bundleFiles(config: HarnessConfig, targetId: TargetId, files: ExportFile[]) {
  const guide: ExportFile = {
    path: SETUP_FILE,
    content: "",
    description: "These setup steps, so the instructions travel with the files.",
  };
  const steps = buildSetupGuide(config, targetId, [...files, guide]);
  guide.content = setupGuideMarkdown(config, targetId, steps);
  return { steps, files: [...files, guide] };
}
