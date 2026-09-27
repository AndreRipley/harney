import { describe, expect, it } from "vitest";
import { parseDiagram, serializeDiagram } from "./diagramFile";
import { PRESETS } from "./presets";

describe("diagram files", () => {
  it("round-trips a preset", () => {
    const { nodes, edges } = PRESETS[2].build();
    const doc = parseDiagram(serializeDiagram({ name: "Team setup", nodes, edges }));
    expect(doc.name).toBe("Team setup");
    expect(doc.nodes.map((n) => n.data)).toEqual(nodes.map((n) => n.data));
    expect(doc.edges).toHaveLength(edges.length);
  });

  it("fills in missing settings with defaults", () => {
    const doc = parseDiagram(
      JSON.stringify({
        version: 1,
        name: "Old",
        nodes: [{ id: "m", position: { x: 0, y: 0 }, data: { kind: "mcp", config: { name: "gh" } } }],
        edges: [],
      }),
    );
    expect(doc.nodes[0].data).toMatchObject({ kind: "mcp", config: { name: "gh", transport: "stdio", args: [] } });
  });

  it("explains bad files", () => {
    expect(() => parseDiagram("nope")).toThrow(/valid JSON/);
    expect(() => parseDiagram("{}")).toThrow(/doesn't look like/);
  });
});
