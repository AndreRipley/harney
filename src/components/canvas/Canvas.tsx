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
import { type DragEvent, useCallback, useMemo } from "react";
import { toast } from "sonner";
import { useShallow } from "zustand/react/shallow";
import { DND_MIME, nodeIdAtPoint, useCanvasActions } from "@/hooks/useCanvasActions";
import { resolveConnection } from "@/lib/harness/connections";
import { KIND_META } from "@/lib/harness/kinds";
import type { HarnessEdge, HarnessNode, NodeKind } from "@/lib/harness/types";
import { cn } from "@/lib/utils";
import { useHarnessStore } from "@/store/harnessStore";
import { EmptyState } from "./EmptyState";
import { HarnessNodeCard } from "./HarnessNodeCard";

const nodeTypes = { harness: HarnessNodeCard };

const defaultEdgeOptions = { type: "default", style: { strokeWidth: 2 } };

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
  const liveNodeId = useHarnessStore((s) => s.playActiveNodeId);
  const liveEdgeId = useHarnessStore((s) => s.playActiveEdgeId);
  const shownNodes = useMemo(
    () => nodes.map((node) => (node.id === liveNodeId ? { ...node, className: "harness-live" } : node)),
    [nodes, liveNodeId],
  );
  const shownEdges = useMemo(
    () => edges.map((edge) => (edge.id === liveEdgeId ? { ...edge, className: cn(edge.className, "harness-live") } : edge)),
    [edges, liveEdgeId],
  );
  const { resolvedTheme } = useTheme();
  const { addCard } = useCanvasActions();

  const isValidConnection = useCallback<IsValidConnection<HarnessEdge>>((connection) => {
    const { nodes: current, edges: currentEdges } = useHarnessStore.getState();
    return resolveConnection(connection.source, connection.target, current, currentEdges, connection).ok;
  }, []);

  const tryConnect = useCallback(
    (connection: Connection) => {
      const { nodes: current, edges: currentEdges } = useHarnessStore.getState();
      const result = resolveConnection(connection.source, connection.target, current, currentEdges, connection);
      if (result.ok) connect(result.connection);
      else toast.error(result.reason, { id: "connection" });
    },
    [connect],
  );

  const onConnectEnd = useCallback<OnConnectEnd>(
    (event, state) => {
      if (state.isValid || !state.fromNode) return;
      const point = "changedTouches" in event ? event.changedTouches[0] : event;
      const hitId = state.toHandle?.nodeId ?? nodeIdAtPoint({ x: point.clientX, y: point.clientY });
      if (!hitId || hitId === state.fromNode.id) return;
      const { nodes: current, edges: currentEdges } = useHarnessStore.getState();
      const result = resolveConnection(state.fromNode.id, hitId, current, currentEdges, {
        sourceHandle: state.fromHandle?.id,
        targetHandle: state.toHandle?.id,
      });
      if (!result.ok) {
        toast.error(result.reason, { id: "connection" });
        return;
      }
      if (!state.toHandle) connect(result.connection);
    },
    [connect],
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
        nodes={shownNodes}
        edges={shownEdges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={tryConnect}
        onConnectEnd={onConnectEnd}
        onNodeClick={(_event, node) => useHarnessStore.getState().selectOnly(node.id)}
        onNodeDragStart={beginDrag}
        isValidConnection={isValidConnection}
        defaultEdgeOptions={defaultEdgeOptions}
        connectionLineType={ConnectionLineType.Bezier}
        connectionLineStyle={{ strokeWidth: 2, strokeDasharray: "6 4" }}
        colorMode={resolvedTheme === "dark" ? "dark" : "light"}
        panOnScroll
        panOnScrollSpeed={0.6875}
        zoomOnScroll={false}
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
