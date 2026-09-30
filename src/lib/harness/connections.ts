import type { Edge } from "@xyflow/react";
import { nodeTitle } from "./kinds";
import type { HarnessEdge, HarnessNode } from "./types";

/** Older diagrams stored the relationship on these handle ids. */
export const HANDLES = {
  linkOut: "link-out",
  linkIn: "link-in",
  out: "out",
  parts: "parts",
  parent: "parent",
  delegate: "delegate",
} as const;

/** Two connectors on the top and bottom, one on each side. */
export const CONNECTORS = [
  { id: "top-a", side: "top", along: 32 },
  { id: "top-b", side: "top", along: 68 },
  { id: "bottom-a", side: "bottom", along: 32 },
  { id: "bottom-b", side: "bottom", along: 68 },
  { id: "left", side: "left", along: 50 },
  { id: "right", side: "right", along: 50 },
] as const;

export type ConnectorId = (typeof CONNECTORS)[number]["id"];

const CONNECTOR_IDS = new Set<string>(CONNECTORS.map((connector) => connector.id));

export interface DragHandles {
  sourceHandle?: string | null;
  targetHandle?: string | null;
}

/** The connector a handle belongs to, including ids from older diagrams. */
export function connectorId(handle: string | null | undefined): ConnectorId | null {
  if (!handle) return null;
  const port = handle.replace(/-(out|in)$/, "");
  if (CONNECTOR_IDS.has(port)) return port as ConnectorId;
  if (handle === HANDLES.linkOut || handle === HANDLES.linkIn || handle === HANDLES.out) return "right";
  if (handle === HANDLES.parts) return "left";
  if (handle === HANDLES.parent) return "top-a";
  if (handle === HANDLES.delegate) return "bottom-a";
  return null;
}

const sourceHandleFor = (port: ConnectorId) => `${port}-out`;
const targetHandleFor = (port: ConnectorId) => `${port}-in`;

/** The connector on `from` that faces `toward`. */
function connectorToward(from: HarnessNode, toward: HarnessNode): ConnectorId {
  const dx = toward.position.x - from.position.x;
  const dy = toward.position.y - from.position.y;
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? "right" : "left";
  return dy > 0 ? "bottom-a" : "top-a";
}

export type EdgeRole = "parts" | "delegate";

export interface ConnectionAttempt {
  source: string | null;
  target: string | null;
}

export type ConnectionCheck = { ok: true } | { ok: false; reason: string };

export type ResolveResult = { ok: true; connection: ResolvedConnection } | { ok: false; reason: string };

export interface ResolvedConnection {
  source: string;
  target: string;
  sourceHandle: string;
  targetHandle: string;
  data: { role: EdgeRole };
}

const fail = (reason: string): { ok: false; reason: string } => ({ ok: false, reason });

/** Reads the relationship, including diagrams saved when it lived on the connection dots. */
export function edgeRole(edge: {
  data?: { role?: string } | null;
  sourceHandle?: string | null;
  targetHandle?: string | null;
}): EdgeRole | null {
  const role = edge.data?.role;
  if (role === "parts" || role === "delegate") return role;
  if (edge.targetHandle === HANDLES.parent || edge.sourceHandle === HANDLES.delegate) return "delegate";
  if (edge.targetHandle === HANDLES.parts || edge.sourceHandle === HANDLES.out) return "parts";
  return null;
}

export const isPartsEdge = (edge: HarnessEdge) => edgeRole(edge) === "parts";
export const isDelegateEdge = (edge: HarnessEdge) => edgeRole(edge) === "delegate";

/** Map of child agent id to parent agent id. */
export function parentMap(edges: HarnessEdge[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const edge of edges) {
    if (isDelegateEdge(edge)) map.set(edge.target, edge.source);
  }
  return map;
}

const DELEGATE_LABEL: Partial<Edge> = {
  label: "delegates",
  labelShowBg: true,
  labelBgPadding: [6, 2],
  labelBgBorderRadius: 6,
  className: "harness-delegate",
};

/**
 * Draws the line from the connector it was started on to the connector it was dropped on.
 */
export function presentEdge(edge: HarnessEdge): HarnessEdge {
  const role = edgeRole(edge) ?? "parts";
  const sourcePort = connectorId(edge.sourceHandle) ?? (role === "delegate" ? "bottom-a" : "right");
  const targetPort = connectorId(edge.targetHandle) ?? (role === "delegate" ? "top-a" : "left");
  const routing = { sourceHandle: sourceHandleFor(sourcePort), targetHandle: targetHandleFor(targetPort) };
  const { label: _label, labelShowBg: _show, className: _className, ...rest } = edge;
  return {
    ...rest,
    ...routing,
    data: { role },
    style: { strokeWidth: 2, ...edge.style },
    ...(role === "delegate" ? DELEGATE_LABEL : { label: undefined, labelShowBg: false, className: "harness-part" }),
  };
}

/**
 * The card you drag from and the card you drop on decide the link.
 * A part belongs to an agent. The agent you drag from becomes the parent of the other agent.
 */
export function resolveConnection(
  source: string | null,
  target: string | null,
  nodes: HarnessNode[],
  edges: HarnessEdge[],
  handles: DragHandles = {},
): ResolveResult {
  if (!source || !target) return fail("Drop the line on a card.");
  if (source === target) return fail("A card can't connect to itself.");

  const sourceNode = nodes.find((n) => n.id === source);
  const targetNode = nodes.find((n) => n.id === target);
  if (!sourceNode || !targetNode) return fail("That card no longer exists.");

  const sourceIsAgent = sourceNode.data.kind === "agent";
  const targetIsAgent = targetNode.data.kind === "agent";

  if (!sourceIsAgent && !targetIsAgent) {
    return fail("Connect parts to an Agent card, not to other parts.");
  }

  if (sourceIsAgent && targetIsAgent) {
    return resolveDelegate(source, target, targetNode, nodes, edges, handles);
  }

  const part = sourceIsAgent ? targetNode : sourceNode;
  const agent = sourceIsAgent ? sourceNode : targetNode;
  return resolvePart(part, agent, source, nodes, edges, handles);
}

function endpoints(
  logicalSource: HarnessNode,
  logicalTarget: HarnessNode,
  dragSourceId: string,
  handles: DragHandles,
) {
  const startedOnSource = dragSourceId === logicalSource.id;
  const sourcePort = startedOnSource
    ? connectorId(handles.sourceHandle) ?? connectorToward(logicalSource, logicalTarget)
    : connectorId(handles.targetHandle) ?? connectorToward(logicalSource, logicalTarget);
  const targetPort = startedOnSource
    ? connectorId(handles.targetHandle) ?? connectorToward(logicalTarget, logicalSource)
    : connectorId(handles.sourceHandle) ?? connectorToward(logicalTarget, logicalSource);
  return { sourceHandle: sourceHandleFor(sourcePort), targetHandle: targetHandleFor(targetPort) };
}

function resolvePart(
  part: HarnessNode,
  agent: HarnessNode,
  dragSourceId: string,
  nodes: HarnessNode[],
  edges: HarnessEdge[],
  handles: DragHandles,
): ResolveResult {
  const already = edges.some((e) => isPartsEdge(e) && e.source === part.id && e.target === agent.id);
  if (already) return fail("These cards are already connected.");

  if (part.data.kind === "model") {
    const hasModel = edges.some(
      (e) => isPartsEdge(e) && e.target === agent.id && nodes.find((n) => n.id === e.source)?.data.kind === "model",
    );
    if (hasModel) {
      return fail(
        `${nodeTitle(agent.data)} already has a model. An agent can only have one; remove the current connection first.`,
      );
    }
  }

  return {
    ok: true,
    connection: {
      source: part.id,
      target: agent.id,
      ...endpoints(part, agent, dragSourceId, handles),
      data: { role: "parts" },
    },
  };
}

function resolveDelegate(
  parentId: string,
  childId: string,
  childNode: HarnessNode,
  nodes: HarnessNode[],
  edges: HarnessEdge[],
  handles: DragHandles,
): ResolveResult {
  const already = edges.some((e) => isDelegateEdge(e) && e.source === parentId && e.target === childId);
  if (already) return fail("These cards are already connected.");

  const parents = parentMap(edges);
  const existingParent = parents.get(childId);
  if (existingParent) {
    const existing = nodes.find((n) => n.id === existingParent);
    const parentName = existing ? nodeTitle(existing.data) : "another agent";
    return fail(`${nodeTitle(childNode.data)} already reports to ${parentName}. An agent can only have one parent.`);
  }

  let cursor: string | undefined = parentId;
  while (cursor) {
    if (cursor === childId) return fail("That would create a loop of agents delegating to each other.");
    cursor = parents.get(cursor);
  }

  return {
    ok: true,
    connection: {
      source: parentId,
      target: childId,
      ...endpoints(
        nodes.find((node) => node.id === parentId) ?? childNode,
        childNode,
        parentId,
        handles,
      ),
      data: { role: "delegate" },
    },
  };
}

/** Whether a drag between two cards is allowed. */
export function checkConnection(
  attempt: ConnectionAttempt,
  nodes: HarnessNode[],
  edges: HarnessEdge[],
): ConnectionCheck {
  const resolved = resolveConnection(attempt.source, attempt.target, nodes, edges);
  if (!resolved.ok) return resolved;
  return { ok: true };
}
