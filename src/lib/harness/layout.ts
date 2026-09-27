import { isDelegateEdge, isPartsEdge } from "./connections";
import type { HarnessEdge, HarnessNode } from "./types";

export const CARD_WIDTH = 240;
export const AGENT_WIDTH = 272;
const CARD_HEIGHT = 92;
const AGENT_HEIGHT = 124;
const PART_GAP = 20;
const COLUMN_GAP = 96;
const ROW_GAP = 120;
const TREE_GAP = 80;

const heightOf = (node: HarnessNode) =>
  node.measured?.height ?? (node.data.kind === "agent" ? AGENT_HEIGHT : CARD_HEIGHT);

/**
 * Tidy left-to-right layout: each agent's parts stack in a column on its left,
 * and its subagents sit in a row underneath. Loose cards go in a column on the right.
 */
export function autoLayout(nodes: HarnessNode[], edges: HarnessEdge[]): HarnessNode[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const positions = new Map<string, { x: number; y: number }>();
  const childrenOf = (id: string) =>
    edges.filter((e) => isDelegateEdge(e) && e.source === id).map((e) => e.target).filter((t) => byId.has(t));
  const partsOf = (id: string) =>
    edges
      .filter((e) => isPartsEdge(e) && e.target === id)
      .map((e) => byId.get(e.source))
      .filter((n): n is HarnessNode => Boolean(n))
      .sort((a, b) => a.position.y - b.position.y);

  const treeWidth = CARD_WIDTH + COLUMN_GAP + AGENT_WIDTH;

  /** Lays out an agent subtree with its top-left at (x, y). Returns the subtree's size. */
  const place = (agentId: string, x: number, y: number): { width: number; height: number } => {
    const agent = byId.get(agentId)!;
    const parts = partsOf(agentId).filter((p) => !positions.has(p.id));
    const partsHeight = parts.reduce((sum, p) => sum + heightOf(p), 0) + Math.max(0, parts.length - 1) * PART_GAP;
    const blockHeight = Math.max(partsHeight, heightOf(agent));

    let cursor = y + (blockHeight - partsHeight) / 2;
    for (const part of parts) {
      positions.set(part.id, { x, y: cursor });
      cursor += heightOf(part) + PART_GAP;
    }
    const agentX = x + CARD_WIDTH + COLUMN_GAP;
    positions.set(agentId, { x: agentX, y: y + (blockHeight - heightOf(agent)) / 2 });

    let width = treeWidth;
    let height = blockHeight;
    const children = childrenOf(agentId).filter((c) => !positions.has(c));
    if (children.length) {
      let childX = x;
      const childY = y + blockHeight + ROW_GAP;
      let rowHeight = 0;
      for (const child of children) {
        const size = place(child, childX, childY);
        childX += size.width + TREE_GAP;
        rowHeight = Math.max(rowHeight, size.height);
      }
      width = Math.max(width, childX - TREE_GAP - x);
      height = blockHeight + ROW_GAP + rowHeight;
    }
    return { width, height };
  };

  const agents = nodes.filter((n) => n.data.kind === "agent");
  const childIds = new Set(edges.filter(isDelegateEdge).map((e) => e.target));
  const roots = agents.filter((a) => !childIds.has(a.id));

  let offsetX = 0;
  for (const root of roots) {
    const size = place(root.id, offsetX, 0);
    offsetX += size.width + TREE_GAP * 2;
  }

  let looseY = 0;
  for (const node of nodes) {
    if (positions.has(node.id)) continue;
    positions.set(node.id, { x: offsetX, y: looseY });
    looseY += heightOf(node) + PART_GAP;
  }

  return nodes.map((n) => ({ ...n, position: positions.get(n.id) ?? n.position }));
}
