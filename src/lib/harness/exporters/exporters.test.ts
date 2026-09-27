import { parse as parseToml } from "smol-toml";
import { describe, expect, it } from "vitest";
import { compileGraph } from "../compile";
import { buildGraph, PRESETS } from "../presets";
import { bundleFiles } from "../setupGuide";
import type { HarnessConfig, TargetId } from "../types";
import { runExport } from ".";

interface CodexToml {
  model?: string;
  model_reasoning_effort?: string;
  sandbox_mode?: string;
  approval_policy?: string;
  web_search?: string;
  mcp_servers: Record<string, Record<string, unknown>>;
  hooks: Record<string, { hooks: { command: string }[] }[]>;
}

const codexToml = (content: string) => parseToml(content) as unknown as CodexToml;

const presetConfig = (id: string): HarnessConfig => {
  const { nodes, edges } = PRESETS.find((p) => p.id === id)!.build();
  return compileGraph(nodes, edges).config!;
};

const file = (config: HarnessConfig, target: TargetId, path: string) => {
  const found = runExport(config, target).files.find((f) => f.path === path);
  if (!found) throw new Error(`Missing ${path}`);
  return found.content;
};

const reviewerWithExtras = () => {
  const { nodes, edges } = buildGraph([
    { id: "a", kind: "agent", config: { name: "PR Reviewer", description: "Reviews code" } },
    { id: "model", kind: "model", to: "a", config: { provider: "anthropic", modelId: "sonnet", temperature: 0.2 } },
    { id: "prompt", kind: "prompt", to: "a", config: { content: "Review diffs." } },
    { id: "read", kind: "tool", to: "a", config: { tool: "read", mode: "allow" } },
    { id: "edit", kind: "tool", to: "a", config: { tool: "edit", mode: "deny" } },
    { id: "shell", kind: "tool", to: "a", config: { tool: "shell", mode: "ask" } },
    {
      id: "github",
      kind: "mcp",
      to: "a",
      config: { name: "github", command: "npx", args: ["-y", "gh-server"], envVars: ["GITHUB_TOKEN"] },
    },
    {
      id: "docs",
      kind: "mcp",
      to: "a",
      config: { name: "docs", transport: "http", url: "https://example.com/mcp", authTokenEnvVar: "DOCS_TOKEN" },
    },
    {
      id: "rule",
      kind: "rule",
      to: "a",
      config: { name: "TypeScript style", alwaysApply: false, globs: ["**/*.ts"], content: "No any." },
    },
    {
      id: "policy",
      kind: "policy",
      to: "a",
      config: { allowCommands: ["git diff *"], denyCommands: ["rm *"], allowNetwork: false },
    },
    { id: "hook", kind: "hook", to: "a", config: { name: "Lint", event: "stop", command: "npm run lint" } },
    { id: "sub", kind: "agent", to: "a", config: { name: "Security Auditor", description: "Audits security" } },
    { id: "subPrompt", kind: "prompt", to: "sub", config: { content: "Audit for secrets." } },
  ]);
  return compileGraph(nodes, edges).config!;
};

describe("Claude Code export", () => {
  const config = reviewerWithExtras();

  it("writes settings with permissions and hooks", () => {
    const settings = JSON.parse(file(config, "claude", ".claude/settings.json"));
    expect(settings.model).toBe("sonnet");
    expect(settings.permissions.allow).toEqual(["Read", "Bash(git diff *)"]);
    expect(settings.permissions.ask).toEqual(["Bash"]);
    expect(settings.permissions.deny).toEqual(["Edit", "Bash(rm *)", "WebFetch", "WebSearch"]);
    expect(settings.hooks.Stop[0].hooks[0]).toEqual({ type: "command", command: "npm run lint" });
  });

  it("uses placeholders for secrets in .mcp.json", () => {
    const mcp = JSON.parse(file(config, "claude", ".mcp.json"));
    expect(mcp.mcpServers.github.env).toEqual({ GITHUB_TOKEN: "${GITHUB_TOKEN}" });
    expect(mcp.mcpServers.docs.headers.Authorization).toBe("Bearer ${DOCS_TOKEN}");
  });

  it("writes CLAUDE.md and a subagent file", () => {
    expect(file(config, "claude", "CLAUDE.md")).toMatchSnapshot();
    expect(file(config, "claude", ".claude/agents/security-auditor.md")).toMatchSnapshot();
  });

  it("reports temperature as unsupported", () => {
    const result = runExport(config, "claude");
    expect(result.features.find((f) => f.feature === "temperature")?.support.level).toBe("none");
    expect(result.usedCount).toBeLessThan(result.totalCount);
  });
});

describe("Cursor export", () => {
  const config = reviewerWithExtras();

  it("writes scoped rule files", () => {
    expect(file(config, "cursor", ".cursor/rules/typescript-style.mdc")).toMatchSnapshot();
    expect(file(config, "cursor", ".cursor/rules/pr-reviewer.mdc")).toContain("alwaysApply: true");
  });

  it("uses Cursor's env syntax for MCP secrets", () => {
    const mcp = JSON.parse(file(config, "cursor", ".cursor/mcp.json"));
    expect(mcp.mcpServers.github.env.GITHUB_TOKEN).toBe("${env:GITHUB_TOKEN}");
  });

  it("maps stop hooks", () => {
    const hooks = JSON.parse(file(config, "cursor", ".cursor/hooks.json"));
    expect(hooks).toEqual({ version: 1, hooks: { stop: [{ command: "npm run lint" }] } });
  });
});

describe("Codex export", () => {
  it("writes valid TOML config", () => {
    const config = reviewerWithExtras();
    const toml = codexToml(file(config, "codex", ".codex/config.toml"));
    expect(toml.model).toBeUndefined();
    expect(toml.sandbox_mode).toBe("read-only");
    expect(toml.approval_policy).toBe("on-request");
    expect(toml.mcp_servers.github.env_vars).toEqual(["GITHUB_TOKEN"]);
    expect(toml.mcp_servers.docs.bearer_token_env_var).toBe("DOCS_TOKEN");
    expect(toml.hooks.Stop[0].hooks[0].command).toBe("npm run lint");
  });

  it("notes that non-OpenAI models are left out", () => {
    const result = runExport(reviewerWithExtras(), "codex");
    expect(result.notes.some((n) => /OpenAI models/.test(n.message))).toBe(true);
  });

  it("writes prefix rules", () => {
    expect(file(reviewerWithExtras(), "codex", ".codex/rules/pr-reviewer.rules")).toMatchSnapshot();
  });

  it("writes custom agent files with readable instructions", () => {
    const content = file(presetConfig("orchestrator"), "codex", ".codex/agents/security-auditor.toml");
    const parsed = parseToml(content) as Record<string, string>;
    expect(parsed.name).toBe("security_auditor");
    expect(parsed.developer_instructions).toContain("Audit the given code");
    expect(parsed.sandbox_mode).toBe("read-only");
    expect(content).toContain('developer_instructions = """');
  });

  it("uses OpenAI models and reasoning effort", () => {
    const toml = codexToml(file(presetConfig("builder"), "codex", ".codex/config.toml"));
    expect(toml.model).toBe("gpt-6-sol");
    expect(toml.model_reasoning_effort).toBe("medium");
    expect(toml.sandbox_mode).toBe("workspace-write");
    expect(toml.approval_policy).toBe("never");
    expect(toml.web_search).toBe("live");
  });
});

describe("setup guide", () => {
  it("lists secrets, runtimes and the trust step for Codex", () => {
    const config = reviewerWithExtras();
    const { files, steps } = bundleFiles(config, "codex", runExport(config, "codex").files);
    expect(files.at(-1)?.path).toBe("HARNESS-SETUP.md");
    expect(steps.map((s) => s.id)).toEqual(["files", "existing", "secrets", "install", "launch", "try"]);
    expect(steps.find((s) => s.id === "secrets")?.items?.map((i) => i.name)).toEqual(["GITHUB_TOKEN", "DOCS_TOKEN"]);
    expect(steps.find((s) => s.id === "install")?.items?.map((i) => i.name)).toContain("Node.js 18 or newer");
    expect(steps.find((s) => s.id === "launch")?.body.join(" ")).toMatch(/trust/);
  });

  it("renders every preset for every target without throwing", () => {
    for (const preset of PRESETS) {
      const { nodes, edges } = preset.build();
      const config = compileGraph(nodes, edges).config!;
      for (const target of ["claude", "cursor", "codex"] as TargetId[]) {
        const { files } = bundleFiles(config, target, runExport(config, target).files);
        expect(files.length).toBeGreaterThan(1);
      }
    }
  });
});
