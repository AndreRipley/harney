import { describe, expect, it } from "vitest";
import { compileGraph } from "./compile";
import { buildGraph, PRESETS } from "./presets";

describe("compileGraph", () => {
  it("asks for an agent on an empty board", () => {
    const result = compileGraph([], []);
    expect(result.config).toBeNull();
    expect(result.issues[0].severity).toBe("error");
  });

  it("leaves disconnected parts out with a warning", () => {
    const { nodes, edges } = buildGraph([
      { id: "a", kind: "agent", config: { name: "Main" } },
      { id: "p", kind: "prompt", to: "a", config: { content: "Be helpful" } },
      { id: "loose", kind: "rule", config: { name: "Orphan", content: "x" } },
    ]);
    const result = compileGraph(nodes, edges);
    expect(result.config?.root.rules).toHaveLength(0);
    expect(result.connected.has("loose")).toBe(false);
    expect(result.issues.some((i) => i.nodeId === "loose" && /isn't connected/.test(i.message))).toBe(true);
  });

  it("nests subagents under the main agent", () => {
    const { nodes, edges } = PRESETS.find((p) => p.id === "orchestrator")!.build();
    const result = compileGraph(nodes, edges);
    expect(result.config?.root.name).toBe("Tech Lead");
    expect(result.config?.subagents.map((s) => s.name)).toEqual(["Security Auditor", "Test Writer"]);
    expect(result.issues.filter((i) => i.severity === "error")).toEqual([]);
  });

  it("flags extra top-level agents as errors", () => {
    const { nodes, edges } = buildGraph([
      { id: "a", kind: "agent", config: { name: "One" } },
      { id: "b", kind: "agent", config: { name: "Two" } },
    ]);
    const errors = compileGraph(nodes, edges).issues.filter((i) => i.severity === "error");
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toMatch(/isn't connected/);
  });

  it("requires instructions on subagents", () => {
    const { nodes, edges } = buildGraph([
      { id: "a", kind: "agent", config: { name: "Main" } },
      { id: "b", kind: "agent", config: { name: "Helper", description: "helps" }, to: "a" },
    ]);
    const errors = compileGraph(nodes, edges).issues.filter((i) => i.severity === "error");
    expect(errors.map((e) => e.nodeId)).toEqual(["b"]);
  });

  it("keeps a Jev decision on its agent and asks for a real question", () => {
    const { nodes, edges } = buildGraph([
      { id: "a", kind: "agent", config: { name: "Main" } },
      { id: "p", kind: "prompt", to: "a", config: { content: "Be careful." } },
      {
        id: "d",
        kind: "decision",
        to: "a",
        config: { name: "Safety", questions: [{ name: "block", type: "noul", instructions: "", criteria: [], blockChoices: [], blockAt: 0.5 }] },
      },
    ]);
    const result = compileGraph(nodes, edges);
    expect(result.config?.root.decisions).toHaveLength(1);
    expect(result.config?.root.decisions[0].model).toBe("jev-latest");
    expect(result.issues.some((issue) => issue.nodeId === "d" && /instructions/.test(issue.message))).toBe(true);
  });

  it("validates MCP servers", () => {
    const { nodes, edges } = buildGraph([
      { id: "a", kind: "agent", config: { name: "Main" } },
      { id: "m", kind: "mcp", to: "a", config: { name: "remote", transport: "http", url: "ftp://x" } },
    ]);
    const issues = compileGraph(nodes, edges).issues;
    expect(issues.some((i) => i.nodeId === "m" && /http/.test(i.message))).toBe(true);
  });
});
