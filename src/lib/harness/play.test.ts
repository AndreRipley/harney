import { describe, expect, it } from "vitest";
import { compileGraph } from "./compile";
import { buildGraph } from "./presets";
import {
  changeSummary,
  harnessEffects,
  jevBlocks,
  playTools,
  requiredKeys,
  resolveApiModel,
  starterPrompts,
  STEP_CAP,
  toolVerdict,
} from "./play";

const harness = () => {
  const { nodes, edges } = buildGraph([
    { id: "a", kind: "agent", config: { name: "Reviewer", description: "Reviews code" } },
    { id: "m", kind: "model", to: "a", config: { provider: "anthropic", modelId: "sonnet" } },
    { id: "p", kind: "prompt", to: "a", config: { content: "Review diffs carefully." } },
    { id: "read", kind: "tool", to: "a", config: { tool: "read", mode: "allow" } },
    { id: "shell", kind: "tool", to: "a", config: { tool: "shell", mode: "ask" } },
    { id: "edit", kind: "tool", to: "a", config: { tool: "edit", mode: "deny" } },
    { id: "policy", kind: "policy", to: "a", config: { denyCommands: ["rm *"] } },
    { id: "hook", kind: "hook", to: "a", config: { name: "Lint", event: "postToolUse", scope: "edit", command: "npm run lint" } },
    { id: "sub", kind: "agent", to: "a", config: { name: "Security Auditor", description: "Checks for secrets" } },
    { id: "subPrompt", kind: "prompt", to: "sub", config: { content: "Audit for secrets." } },
  ]);
  return compileGraph(nodes, edges).config!;
};

describe("play tools", () => {
  const config = harness();

  it("offers denied tools so a rehearsal can show the block", () => {
    const names = playTools(config, config.root).map((tool) => tool.name);
    expect(names).toContain("edit");
    expect(names).toContain("delegate_security-auditor");
  });

  it("asks, denies, and allows according to the cards", () => {
    expect(toolVerdict(config.root, "read").verdict).toBe("allow");
    expect(toolVerdict(config.root, "shell").verdict).toBe("ask");
    expect(toolVerdict(config.root, "edit").verdict).toBe("deny");
    expect(toolVerdict(config.root, "shell", "rm -rf /").verdict).toBe("deny");
  });

  it("suggests a prompt that should trip a permission", () => {
    expect(starterPrompts(config).some((prompt) => /block/i.test(prompt))).toBe(true);
    expect(starterPrompts(config).some((prompt) => /Security Auditor/.test(prompt))).toBe(true);
  });

  it("asks only for the keys the diagram needs", () => {
    expect(requiredKeys(config)).toEqual({ providers: ["anthropic"], jev: false });
  });

  it("maps export aliases to API model ids and keeps real ids", () => {
    expect(resolveApiModel("anthropic", "sonnet")).toBe("claude-sonnet-4-5");
    expect(resolveApiModel("anthropic", "claude-opus-4-1")).toBe("claude-opus-4-1");
  });

  it("blocks when Jev says yes at the threshold, and when the key is missing", () => {
    const question = {
      name: "block",
      type: "noul" as const,
      instructions: "Should this be blocked?",
      criteria: [],
      blockChoices: [],
      blockAt: 0.5,
    };
    expect(jevBlocks([question], { block: { type: "noul", noul: 0.8 } }).blocked).toBe(true);
    expect(jevBlocks([question], null).blocked).toBe(true);
    expect(jevBlocks([question], null).reason).toMatch(/TYPESAFE_API_KEY/);
  });

  it("names what changed between two harnesses", () => {
    const next = structuredClone(config);
    next.root.instructions[0].content = "Be brief.";
    expect(changeSummary(config, next)).toMatch(/System Prompt/);
    expect(changeSummary(config, config)).toBeNull();
  });

  it("sums up what the harness changed", () => {
    const effects = harnessEffects(config, [
      { id: "1", nodeId: "edit", edgeId: null, title: "Blocked by Edit files", detail: "", tone: "deny" },
      { id: "2", nodeId: "sub", edgeId: null, title: "Handed to Security Auditor", detail: "", tone: "neutral", children: [] },
    ]);
    expect(effects[0]).toMatch(/System Prompt/);
    expect(effects.some((line) => /Blocked Edit files/.test(line))).toBe(true);
    expect(effects.some((line) => /Handed work to Security Auditor/.test(line))).toBe(true);
  });

  it("says when the harness changed nothing", () => {
    const { nodes, edges } = buildGraph([
      { id: "a", kind: "agent", config: { name: "Bare" } },
      { id: "m", kind: "model", to: "a", config: { provider: "anthropic", modelId: "sonnet" } },
    ]);
    const bare = compileGraph(nodes, edges).config!;
    expect(harnessEffects(bare, [])).toEqual([]);
  });

  it("caps a turn", () => {
    expect(STEP_CAP).toBeGreaterThan(0);
    expect(STEP_CAP).toBeLessThanOrEqual(8);
  });
});
