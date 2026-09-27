"use client";

import {
  Background,
  BackgroundVariant,
  type Connection,
  ConnectionLineType,
  Controls,
  type IsValidConnection,
  MiniMap,
  type OnConnectEnd,
  ReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useTheme } from "next-themes";
import { type DragEvent, useCallback } from "react";
import { toast } from "sonner";
import { useShallow } from "zustand/react/shallow";
import { DND_MIME, nodeIdAtPoint, useCanvasActions } from "@/hooks/useCanvasActions";
import { checkConnection, HANDLES } from "@/lib/harness/connections";
import { KIND_META } from "@/lib/harness/kinds";
import type { HarnessEdge, HarnessNode, NodeKind } from "@/lib/harness/types";
import { useHarnessStore } from "@/store/harnessStore";
import { EmptyState } from "./EmptyState";
import { HarnessNodeCard } from "./HarnessNodeCard";

const nodeTypes = { harness: HarnessNodeCard };

const defaultEdgeOptions = { type: "default", style: { strokeWidth: 2 } };

/** Works out the intended connection when a line is dropped on a card body instead of a dot. */
function inferConnection(fromNodeId: string, fromHandle: string | null, toNodeId: string): Connection | null {
  const { nodes } = useHarnessStore.getState();
  const from = nodes.find((n) => n.id === fromNodeId);
  const to = nodes.find((n) => n.id === toNodeId);
  if (!from || !to || from.id === to.id) return null;

  if (from.data.kind !== "agent") {
    return { source: from.id, sourceHandle: HANDLES.out, target: to.id, targetHandle: HANDLES.parts };
  }
  if (fromHandle === HANDLES.delegate) {
    return { source: from.id, sourceHandle: HANDLES.delegate, target: to.id, targetHandle: HANDLES.parent };
  }
  if (fromHandle === HANDLES.parent) {
    return { source: to.id, sourceHandle: HANDLES.delegate, target: from.id, targetHandle: HANDLES.parent };
  }
  return to.data.kind === "agent"
    ? null
    : { source: to.id, sourceHandle: HANDLES.out, target: from.id, targetHandle: HANDLES.parts };
}

export function Canvas() {
  const { nodes, edges, onNodesChange, onEdgesChange, connect, beginDrag } = useHarnessStore(
    useShallow((s) => ({
      nodes: s.nodes,
      edges: s.edges,
      onNodesChange: s.onNodesChange,
      onEdgesChange: s.onEdgesChange,
      connect: s.connect,
      beginDrag: s.beginDrag,
    })),
  );
  const { resolvedTheme } = useTheme();
  const { addCard } = useCanvasActions();

  const isValidConnection = useCallback<IsValidConnection<HarnessEdge>>((connection) => {
    const { nodes: current, edges: currentEdges } = useHarnessStore.getState();
    return checkConnection(connection, current, currentEdges).ok;
  }, []);

  const tryConnect = useCallback(
    (connection: Connection) => {
      const { nodes: current, edges: currentEdges } = useHarnessStore.getState();
      const result = checkConnection(connection, current, currentEdges);
      if (result.ok) connect(connection);
      else toast.error(result.reason, { id: "connection" });
    },
    [connect],
  );

  const onConnectEnd = useCallback<OnConnectEnd>(
    (event, state) => {
      if (state.isValid || !state.fromNode) return;
      const point = "changedTouches" in event ? event.changedTouches[0] : event;
      if (state.toHandle) {
        const from = state.fromHandle;
        const to = state.toHandle;
        if (!from) return;
        const attempt =
          from.type === "source"
            ? { source: from.nodeId, sourceHandle: from.id, target: to.nodeId, targetHandle: to.id }
            : { source: to.nodeId, sourceHandle: to.id, target: from.nodeId, targetHandle: from.id };
        const { nodes: current, edges: currentEdges } = useHarnessStore.getState();
        const result = checkConnection(attempt, current, currentEdges);
        if (!result.ok) toast.error(result.reason, { id: "connection" });
        return;
      }
      const hitId = nodeIdAtPoint({ x: point.clientX, y: point.clientY });
      if (!hitId || hitId === state.fromNode.id) return;
      const inferred = inferConnection(state.fromNode.id, state.fromHandle?.id ?? null, hitId);
      if (inferred) tryConnect(inferred);
      else toast.error("Connect parts to an Agent card, not to other parts.", { id: "connection" });
    },
    [tryConnect],
  );

  const onDragOver = useCallback((event: DragEvent) => {
    if (!event.dataTransfer.types.includes(DND_MIME)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }, []);

  const onDrop = useCallback(
    (event: DragEvent) => {
      const kind = event.dataTransfer.getData(DND_MIME) as NodeKind;
      if (!kind || !(kind in KIND_META)) return;
      event.preventDefault();
      addCard(kind, { x: event.clientX, y: event.clientY });
    },
    [addCard],
  );

  return (
    <div className="absolute inset-0" onDragOver={onDragOver} onDrop={onDrop}>
      <ReactFlow<HarnessNode, HarnessEdge>
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={tryConnect}
        onConnectEnd={onConnectEnd}
        onNodeDragStart={beginDrag}
        isValidConnection={isValidConnection}
        defaultEdgeOptions={defaultEdgeOptions}
        connectionLineType={ConnectionLineType.Bezier}
        connectionLineStyle={{ strokeWidth: 2, strokeDasharray: "6 4" }}
        colorMode={resolvedTheme === "dark" ? "dark" : "light"}
        snapToGrid
        snapGrid={[16, 16]}
        fitView
        fitViewOptions={{ padding: 0.2, maxZoom: 1.1 }}
        minZoom={0.2}
        maxZoom={2}
        deleteKeyCode={["Backspace", "Delete"]}
        multiSelectionKeyCode={["Meta", "Control", "Shift"]}
        attributionPosition="top-right"
        aria-label="Harness diagram canvas"
      >
        <Background variant={BackgroundVariant.Dots} gap={16} size={1.2} />
        <Controls position="bottom-left" showInteractive={false} />
        <MiniMap
          position="bottom-right"
          pannable
          zoomable
          nodeColor={(node) => KIND_META[(node as HarnessNode).data.kind].color}
          nodeBorderRadius={8}
          style={{ width: 168, height: 112 }}
          className={nodes.length === 0 ? "!hidden" : "!hidden sm:!block"}
        />
      </ReactFlow>
      {nodes.length === 0 && <EmptyState />}
    </div>
  );
}
