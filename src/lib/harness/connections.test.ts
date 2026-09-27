import { describe, expect, it } from "vitest";
import { checkConnection, HANDLES } from "./connections";
import { buildGraph } from "./presets";

const graph = () =>
  buildGraph([
    { id: "a", kind: "agent", config: { name: "Main" } },
    { id: "b", kind: "agent", config: { name: "Helper" }, to: "a" },
    { id: "c", kind: "agent", config: { name: "Loose" } },
    { id: "m1", kind: "model", to: "a" },
    { id: "m2", kind: "model" },
    { id: "p", kind: "prompt" },
  ]);

const part = (source: string, target: string) => ({
  source,
  target,
  sourceHandle: HANDLES.out,
  targetHandle: HANDLES.parts,
});
const delegate = (source: string, target: string) => ({
  source,
  target,
  sourceHandle: HANDLES.delegate,
  targetHandle: HANDLES.parent,
});

describe("checkConnection", () => {
  it("lets a part plug into an agent", () => {
    const { nodes, edges } = graph();
    expect(checkConnection(part("p", "a"), nodes, edges)).toEqual({ ok: true });
  });

  it("allows only one model per agent", () => {
    const { nodes, edges } = graph();
    const result = checkConnection(part("m2", "a"), nodes, edges);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.reason).toMatch(/already has a model/);
  });

  it("rejects connecting parts to parts", () => {
    const { nodes, edges } = graph();
    expect(checkConnection(part("p", "m2"), nodes, edges).ok).toBe(false);
  });

  it("rejects agent loops", () => {
    const { nodes, edges } = graph();
    const result = checkConnection(delegate("b", "a"), nodes, edges);
    expect(!result.ok && result.reason).toMatch(/loop/);
  });

  it("rejects a second parent", () => {
    const { nodes, edges } = graph();
    const result = checkConnection(delegate("c", "b"), nodes, edges);
    expect(!result.ok && result.reason).toMatch(/already reports to Main/);
  });

  it("allows a new subagent", () => {
    const { nodes, edges } = graph();
    expect(checkConnection(delegate("b", "c"), nodes, edges)).toEqual({ ok: true });
  });

  it("explains agent-to-parts drops", () => {
    const { nodes, edges } = graph();
    const result = checkConnection({ ...delegate("a", "c"), targetHandle: HANDLES.parts }, nodes, edges);
    expect(!result.ok && result.reason).toMatch(/bottom of the main agent/);
  });
});
