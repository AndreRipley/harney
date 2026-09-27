import { nodeTitle } from "./kinds";
import type { HarnessEdge, HarnessNode } from "./types";

export const HANDLES = {
  out: "out",
  parts: "parts",
  parent: "parent",
  delegate: "delegate",
} as const;

export interface ConnectionAttempt {
  source: string | null;
  sourceHandle?: string | null;
  target: string | null;
  targetHandle?: string | null;
}

export type ConnectionCheck = { ok: true } | { ok: false; reason: string };

const fail = (reason: string): ConnectionCheck => ({ ok: false, reason });

export const isPartsEdge = (edge: HarnessEdge) => edge.targetHandle === HANDLES.parts;
export const isDelegateEdge = (edge: HarnessEdge) => edge.targetHandle === HANDLES.parent;

/** Map of child agent id to parent agent id. */
export function parentMap(edges: HarnessEdge[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const edge of edges) {
    if (isDelegateEdge(edge)) map.set(edge.target, edge.source);
  }
  return map;
}

/**
 * Decides whether a connection is allowed, and if not, explains why in plain language.
 * Parts plug into an agent's left handle; subagents hang from an agent's bottom handle.
 */
export function checkConnection(
  attempt: ConnectionAttempt,
  nodes: HarnessNode[],
  edges: HarnessEdge[],
): ConnectionCheck {
  const { source, target, targetHandle } = attempt;
  if (!source || !target) return fail("Drop the line on a connection dot.");
  if (source === target) return fail("A card can't connect to itself.");

  const sourceNode = nodes.find((n) => n.id === source);
  const targetNode = nodes.find((n) => n.id === target);
  if (!sourceNode || !targetNode) return fail("That card no longer exists.");

  if (targetNode.data.kind !== "agent") {
    return fail("Connect parts to an Agent card, not to other parts.");
  }

  const alreadyConnected = edges.some(
    (e) => e.source === source && e.target === target && e.targetHandle === targetHandle,
  );
  if (alreadyConnected) return fail("These cards are already connected.");

  const targetName = nodeTitle(targetNode.data);

  if (sourceNode.data.kind !== "agent") {
    if (targetHandle !== HANDLES.parts) {
      return fail("Parts plug into the left side of an Agent.");
    }
    if (sourceNode.data.kind === "model") {
      const hasModel = edges.some(
        (e) =>
          e.target === target &&
          isPartsEdge(e) &&
          nodes.find((n) => n.id === e.source)?.data.kind === "model",
      );
      if (hasModel) {
        return fail(`${targetName} already has a model. An agent can only have one; remove the current connection first.`);
      }
    }
    return { ok: true };
  }

  if (targetHandle !== HANDLES.parent) {
    return fail(
      "To add a subagent, drag from the bottom of the main agent to the top of the helper agent.",
    );
  }

  const parents = parentMap(edges);
  const existingParent = parents.get(target);
  if (existingParent) {
    const parentNode = nodes.find((n) => n.id === existingParent);
    const parentName = parentNode ? nodeTitle(parentNode.data) : "another agent";
    return fail(`${targetName} already reports to ${parentName}. An agent can only have one parent.`);
  }

  let cursor: string | undefined = source;
  while (cursor) {
    if (cursor === target) return fail("That would create a loop of agents delegating to each other.");
    cursor = parents.get(cursor);
  }

  return { ok: true };
}
