"use client";

import { type Connection, useReactFlow, type XYPosition } from "@xyflow/react";
import { useCallback } from "react";
import { toast } from "sonner";
import { checkConnection, isDelegateEdge, isPartsEdge } from "@/lib/harness/connections";
import { nodeTitle } from "@/lib/harness/kinds";
import { AGENT_WIDTH, CARD_WIDTH } from "@/lib/harness/layout";
import type { HarnessNode, NodeKind } from "@/lib/harness/types";
import { useHarnessStore } from "@/store/harnessStore";

export const DND_MIME = "application/x-harness-kind";

/** Finds the canvas card under a screen point, if any. */
export function nodeIdAtPoint(point: XYPosition): string | null {
  const element = document.elementFromPoint(point.x, point.y)?.closest(".react-flow__node");
  return element?.getAttribute("data-id") ?? null;
}

function connectionFor(kind: NodeKind, newId: string, agentId: string): Connection {
  return kind === "agent"
    ? { source: agentId, target: newId, sourceHandle: null, targetHandle: null }
    : { source: newId, target: agentId, sourceHandle: null, targetHandle: null };
}

function besideAgent(kind: NodeKind, agent: HarnessNode): XYPosition {
  const { edges } = useHarnessStore.getState();
  if (kind === "agent") {
    const siblings = edges.filter((e) => e.source === agent.id && isDelegateEdge(e)).length;
    return { x: agent.position.x + siblings * (AGENT_WIDTH + 60), y: agent.position.y + 260 };
  }
  const parts = edges.filter((e) => e.target === agent.id && isPartsEdge(e)).length;
  return { x: agent.position.x - CARD_WIDTH - 96, y: agent.position.y - 20 + parts * 112 };
}

function connectTo(kind: NodeKind, id: string, agent: HarnessNode): boolean {
  const connection = connectionFor(kind, id, agent.id);
  const latest = useHarnessStore.getState();
  const check = checkConnection(connection, latest.nodes, latest.edges);
  if (!check.ok) {
    toast.warning(check.reason, { id: "auto-connect" });
    return false;
  }
  latest.connect(connection, false);
  toast.success(`Connected to ${nodeTitle(agent.data)}`, { id: "auto-connect", duration: 1800 });
  return true;
}

export function useCanvasActions() {
  const { screenToFlowPosition, fitView, getNode, setCenter, getZoom } = useReactFlow<HarnessNode>();

  /**
   * Adds a card. Dropped on an agent, or added while one agent is selected,
   * it's placed beside that agent and connected automatically.
   */
  const addCard = useCallback(
    (kind: NodeKind, screenPoint?: XYPosition) => {
      const state = useHarnessStore.getState();
      const width = kind === "agent" ? AGENT_WIDTH : CARD_WIDTH;
      let position: XYPosition;
      let agent: HarnessNode | undefined;

      if (screenPoint) {
        const flow = screenToFlowPosition(screenPoint);
        position = { x: flow.x - width / 2, y: flow.y - 40 };
        const hitId = nodeIdAtPoint(screenPoint);
        agent = state.nodes.find((n) => n.id === hitId && n.data.kind === "agent");
      } else {
        const selected = state.nodes.filter((n) => n.selected);
        agent = selected.length === 1 && selected[0].data.kind === "agent" ? selected[0] : undefined;
        const bounds = document.querySelector(".react-flow")?.getBoundingClientRect();
        const center = bounds
          ? screenToFlowPosition({ x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 })
          : { x: 0, y: 0 };
        const jitter = (state.nodes.length % 6) * 24;
        position = { x: center.x - width / 2 + jitter, y: center.y - 50 + jitter };
      }

      if (agent) position = besideAgent(kind, agent);

      const id = state.addNode(kind, position);
      if (agent) connectTo(kind, id, agent);
      return id;
    },
    [screenToFlowPosition],
  );

  /**
   * Gives an agent a part without touching the selection: connects a loose card
   * of that kind if there is one, otherwise adds one beside the agent.
   */
  const addPartTo = useCallback(
    (agentId: string, kind: NodeKind) => {
      const state = useHarnessStore.getState();
      const agent = state.nodes.find((n) => n.id === agentId);
      if (!agent) return null;
      const loose = state.nodes.find(
        (n) => n.data.kind === kind && n.id !== agentId && !state.edges.some((e) => e.source === n.id || e.target === n.id),
      );
      const id = loose?.id ?? state.addNode(kind, besideAgent(kind, agent));
      return connectTo(kind, id, agent) ? id : null;
    },
    [],
  );

  const focusNode = useCallback(
    (id: string) => {
      const node = getNode(id);
      if (!node) return;
      useHarnessStore.getState().selectOnly(id);
      const width = node.measured?.width ?? CARD_WIDTH;
      const height = node.measured?.height ?? 90;
      setCenter(node.position.x + width / 2, node.position.y + height / 2, {
        zoom: Math.max(getZoom(), 1),
        duration: 450,
      });
    },
    [getNode, setCenter, getZoom],
  );

  const revealNode = useCallback(
    (id: string) => {
      const node = getNode(id);
      if (!node) return;
      const width = node.measured?.width ?? CARD_WIDTH;
      const height = node.measured?.height ?? 90;
      setCenter(node.position.x + width / 2, node.position.y + height / 2, {
        zoom: Math.max(getZoom(), 1),
        duration: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 450,
      });
    },
    [getNode, setCenter, getZoom],
  );

  const fitAll = useCallback(() => {
    window.setTimeout(() => fitView({ padding: 0.2, maxZoom: 1.1, duration: 450 }), 60);
  }, [fitView]);

  return { addCard, addPartTo, focusNode, revealNode, fitAll };
}
