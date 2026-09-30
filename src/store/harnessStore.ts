"use client";

import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type EdgeChange,
  type NodeChange,
  type XYPosition,
} from "@xyflow/react";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { compileGraph, type CompileResult } from "@/lib/harness/compile";
import { presentEdge, resolveConnection } from "@/lib/harness/connections";
import type { DiagramDocument } from "@/lib/harness/diagramFile";
import { makeNodeData } from "@/lib/harness/kinds";
import { autoLayout } from "@/lib/harness/layout";
import type { PlayStep } from "@/lib/harness/playRun";
import type {
  EvalScenario,
  HarnessConfig,
  HarnessEdge,
  HarnessNode,
  HarnessNodeData,
  KindDataMap,
  NodeKind,
  TargetId,
} from "@/lib/harness/types";

export interface PlayTurn {
  id: string;
  role: "user" | "assistant" | "notice";
  text: string;
  /** Pasted file or notes sent along with a user message. */
  context?: string;
  steps: PlayStep[];
  usage?: { input: number; output: number };
  startedAt?: number;
  finishedAt?: number;
  /** The same model with no harness, when Compare is on. */
  plain?: { text: string; usage?: { input: number; output: number }; error?: string; running?: boolean };
  effects?: string[];
  error?: string;
}

interface Snapshot {
  name: string;
  nodes: HarnessNode[];
  edges: HarnessEdge[];
}

const HISTORY_LIMIT = 100;
/** Edits to the same field within this window collapse into one undo step. */
const HISTORY_MERGE_MS = 800;

interface HarnessState {
  name: string;
  nodes: HarnessNode[];
  edges: HarnessEdge[];
  past: Snapshot[];
  future: Snapshot[];
  historyKey: string | null;
  historyAt: number;
  previewOpen: boolean;
  previewTarget: TargetId;
  exportOpen: boolean;
  paletteOpen: boolean;
  partsPanelOpen: boolean;
  inspectorOpen: boolean;
  rightTab: "inspect" | "try";
  tryUnread: boolean;
  playTurns: PlayTurn[];
  /** Notes from earlier Try turns, so a refresh can resume. */
  taskLog: string;
  evalScenarios: EvalScenario[];
  playRunning: boolean;
  playActiveNodeId: string | null;
  playActiveEdgeId: string | null;
  playBaseline: HarnessConfig | null;
  tryCompare: boolean;
  /** Pixel width of the test chat. Null keeps the default, about half the screen. */
  tryWidth: number | null;

  setName: (name: string) => void;
  onNodesChange: (changes: NodeChange<HarnessNode>[]) => void;
  onEdgesChange: (changes: EdgeChange<HarnessEdge>[]) => void;
  connect: (connection: Connection, recordHistory?: boolean) => void;
  addNode: (kind: NodeKind, position: XYPosition) => string;
  updateConfig: <K extends NodeKind>(id: string, patch: Partial<KindDataMap[K]>) => void;
  removeNodes: (ids: string[]) => void;
  duplicateSelection: () => void;
  selectOnly: (id: string | null) => void;
  selectAll: () => void;
  beginDrag: () => void;
  loadDocument: (doc: DiagramDocument) => void;
  applyLayout: () => void;
  undo: () => void;
  redo: () => void;
  setPreviewOpen: (open: boolean) => void;
  setPreviewTarget: (target: TargetId) => void;
  setExportOpen: (open: boolean) => void;
  setPaletteOpen: (open: boolean) => void;
  setPartsPanelOpen: (open: boolean) => void;
  setInspectorOpen: (open: boolean) => void;
  setRightTab: (tab: "inspect" | "try") => void;
  openTry: () => void;
  closeTry: () => void;
  setPlayHighlight: (nodeId: string | null, edgeId: string | null) => void;
  setPlayRunning: (running: boolean) => void;
  pushPlayTurn: (turn: PlayTurn) => void;
  patchPlayTurn: (id: string, patch: Partial<PlayTurn>) => void;
  clearPlay: () => void;
  appendTaskLog: (line: string) => void;
  addEvalScenario: (name: string, prompt: string) => void;
  removeEvalScenario: (id: string) => void;
  setPlayBaseline: (config: HarnessConfig | null) => void;
  markTryUnread: () => void;
  setTryCompare: (on: boolean) => void;
  setTryWidth: (width: number) => void;
}

const newId = (kind: string) => `${kind}-${crypto.randomUUID().slice(0, 8)}`;

const clean = (nodes: HarnessNode[]) => nodes.map((n) => ({ ...n, selected: false, dragging: false }));

function withHistory(state: HarnessState, key: string | null = null): Partial<HarnessState> {
  const now = Date.now();
  if (key && key === state.historyKey && now - state.historyAt < HISTORY_MERGE_MS) {
    return { historyAt: now };
  }
  const snapshot: Snapshot = { name: state.name, nodes: state.nodes, edges: state.edges };
  return {
    past: [...state.past, snapshot].slice(-HISTORY_LIMIT),
    future: [],
    historyKey: key,
    historyAt: now,
  };
}

export const useHarnessStore = create<HarnessState>()(
  persist(
    (set, get) => ({
      name: "Untitled harness",
      nodes: [],
      edges: [],
      past: [],
      future: [],
      historyKey: null,
      historyAt: 0,
      previewOpen: false,
      previewTarget: "claude",
      exportOpen: false,
      paletteOpen: false,
      partsPanelOpen: true,
      inspectorOpen: true,
      rightTab: "inspect",
      tryUnread: false,
      playTurns: [],
      taskLog: "",
      evalScenarios: [],
      playRunning: false,
      playActiveNodeId: null,
      playActiveEdgeId: null,
      playBaseline: null,
      tryCompare: true,
      tryWidth: null,

      setName: (name) => set((s) => ({ ...withHistory(s, "name"), name })),

      onNodesChange: (changes) =>
        set((s) => {
          const structural = changes.some((c) => c.type === "remove" || c.type === "add");
          const picked = s.rightTab === "try" && changes.some((c) => c.type === "select" && c.selected);
          return {
            ...(structural ? withHistory(s, "delete") : {}),
            ...(picked ? { rightTab: "inspect" as const, inspectorOpen: true } : {}),
            nodes: applyNodeChanges(changes, s.nodes),
          };
        }),

      onEdgesChange: (changes) =>
        set((s) => {
          const structural = changes.some((c) => c.type === "remove" || c.type === "add");
          return {
            ...(structural ? withHistory(s, "delete") : {}),
            edges: applyEdgeChanges(changes, s.edges),
          };
        }),

      connect: (connection, recordHistory = true) =>
        set((s) => {
          const resolved = resolveConnection(connection.source, connection.target, s.nodes, s.edges, connection);
          if (!resolved.ok) return s;
          return {
            ...(recordHistory ? withHistory(s) : {}),
            edges: addEdge(
              presentEdge({
                ...resolved.connection,
                id: `e-${resolved.connection.source}-${resolved.connection.target}-${Date.now()}`,
              }),
              s.edges,
            ),
          };
        }),

      addNode: (kind, position) => {
        const id = newId(kind);
        set((s) => ({
          ...withHistory(s),
          nodes: [
            ...s.nodes.map((n) => ({ ...n, selected: false })),
            { id, type: "harness", position, data: makeNodeData(kind), selected: true },
          ],
          edges: s.edges.map((e) => ({ ...e, selected: false })),
        }));
        return id;
      },

      updateConfig: (id, patch) =>
        set((s) => ({
          ...withHistory(s, `${id}:${Object.keys(patch).join(",")}`),
          nodes: s.nodes.map((n) =>
            n.id === id
              ? { ...n, data: { ...n.data, config: { ...n.data.config, ...patch } } as HarnessNodeData }
              : n,
          ),
        })),

      removeNodes: (ids) =>
        set((s) => ({
          ...withHistory(s),
          nodes: s.nodes.filter((n) => !ids.includes(n.id)),
          edges: s.edges.filter((e) => !ids.includes(e.source) && !ids.includes(e.target)),
        })),

      duplicateSelection: () =>
        set((s) => {
          const selected = s.nodes.filter((n) => n.selected);
          if (selected.length === 0) return {};
          const idMap = new Map(selected.map((n) => [n.id, newId(n.data.kind)]));
          const copies: HarnessNode[] = selected.map((n) => ({
            ...n,
            id: idMap.get(n.id)!,
            position: { x: n.position.x + 32, y: n.position.y + 32 },
            data: structuredClone(n.data),
            selected: true,
          }));
          const copiedEdges: HarnessEdge[] = s.edges
            .filter((e) => idMap.has(e.source) && idMap.has(e.target))
            .map((e) => ({
              ...e,
              id: `e-${idMap.get(e.source)}-${idMap.get(e.target)}`,
              source: idMap.get(e.source)!,
              target: idMap.get(e.target)!,
              selected: false,
            }));
          return {
            ...withHistory(s),
            nodes: [...s.nodes.map((n) => ({ ...n, selected: false })), ...copies],
            edges: [...s.edges, ...copiedEdges],
          };
        }),

      selectOnly: (id) =>
        set((s) => ({
          nodes: s.nodes.map((n) => (n.selected === (n.id === id) ? n : { ...n, selected: n.id === id })),
          edges: s.edges.map((e) => (e.selected ? { ...e, selected: false } : e)),
          ...(id ? { rightTab: "inspect" as const, inspectorOpen: true } : {}),
        })),

      selectAll: () => set((s) => ({ nodes: s.nodes.map((n) => ({ ...n, selected: true })) })),

      beginDrag: () => set((s) => withHistory(s, "drag")),

      loadDocument: (doc) =>
        set((s) => ({
          ...withHistory(s),
          name: doc.name,
          nodes: clean(doc.nodes),
          edges: doc.edges,
        })),

      applyLayout: () => set((s) => ({ ...withHistory(s), nodes: autoLayout(s.nodes, s.edges) })),

      undo: () => {
        const { past, future, name, nodes, edges } = get();
        const previous = past.at(-1);
        if (!previous) return;
        set({
          past: past.slice(0, -1),
          future: [{ name, nodes, edges }, ...future],
          name: previous.name,
          nodes: clean(previous.nodes),
          edges: previous.edges,
          historyKey: null,
        });
      },

      redo: () => {
        const { past, future, name, nodes, edges } = get();
        const next = future[0];
        if (!next) return;
        set({
          past: [...past, { name, nodes, edges }],
          future: future.slice(1),
          name: next.name,
          nodes: clean(next.nodes),
          edges: next.edges,
          historyKey: null,
        });
      },

      setPreviewOpen: (previewOpen) => set({ previewOpen }),
      setPreviewTarget: (previewTarget) => set({ previewTarget }),
      setExportOpen: (exportOpen) => set({ exportOpen }),
      setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
      setPartsPanelOpen: (partsPanelOpen) => set({ partsPanelOpen }),
      setInspectorOpen: (inspectorOpen) => set({ inspectorOpen }),
      setRightTab: (rightTab) => set({ rightTab, ...(rightTab === "try" ? { tryUnread: false } : {}) }),
      openTry: () => set({ rightTab: "try", tryUnread: false }),
      closeTry: () => set({ rightTab: "inspect" }),
      setPlayHighlight: (playActiveNodeId, playActiveEdgeId) => set({ playActiveNodeId, playActiveEdgeId }),
      setPlayRunning: (playRunning) => set({ playRunning }),
      pushPlayTurn: (turn) => set((s) => ({ playTurns: [...s.playTurns, turn] })),
      patchPlayTurn: (id, patch) =>
        set((s) => ({ playTurns: s.playTurns.map((turn) => (turn.id === id ? { ...turn, ...patch } : turn)) })),
      clearPlay: () => set({ playTurns: [], taskLog: "", playBaseline: null, playActiveNodeId: null, playActiveEdgeId: null, playRunning: false }),
      appendTaskLog: (line) =>
        set((s) => ({ taskLog: [s.taskLog, line].filter(Boolean).join("\n").slice(-4000) })),
      addEvalScenario: (name, prompt) =>
        set((s) => ({
          evalScenarios: [...s.evalScenarios, { id: crypto.randomUUID(), name: name.trim() || "Scenario", prompt: prompt.trim() }],
        })),
      removeEvalScenario: (id) => set((s) => ({ evalScenarios: s.evalScenarios.filter((scenario) => scenario.id !== id) })),
      setPlayBaseline: (playBaseline) => set({ playBaseline }),
      markTryUnread: () => set((s) => (s.rightTab === "try" ? {} : { tryUnread: true })),
      setTryCompare: (tryCompare) => set({ tryCompare }),
      setTryWidth: (tryWidth) => set({ tryWidth }),
    }),
    {
      name: "harness-studio:v1",
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        name: s.name,
        nodes: s.nodes.map(({ id, type, position, data }) => ({ id, type, position, data })),
        edges: s.edges.map(({ id, source, target, sourceHandle, targetHandle, data }) => ({
          id,
          source,
          target,
          sourceHandle,
          targetHandle,
          data,
        })),
        previewTarget: s.previewTarget,
        partsPanelOpen: s.partsPanelOpen,
        inspectorOpen: s.inspectorOpen,
        tryCompare: s.tryCompare,
        tryWidth: s.tryWidth,
        playTurns: s.playTurns,
        taskLog: s.taskLog,
        evalScenarios: s.evalScenarios,
      }),
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as Partial<HarnessState>;
        return {
          ...current,
          ...saved,
          edges: (saved.edges ?? current.edges).map((edge) => presentEdge(edge)),
        };
      },
    },
  ),
);

let lastInput: { nodes: HarnessNode[]; edges: HarnessEdge[] } | null = null;
let lastResult: CompileResult | null = null;

/** Compiles the graph once per change, shared by every component that asks. */
export function getCompiled(nodes: HarnessNode[], edges: HarnessEdge[]): CompileResult {
  if (lastInput && lastResult && lastInput.nodes === nodes && lastInput.edges === edges) return lastResult;
  lastInput = { nodes, edges };
  lastResult = compileGraph(nodes, edges);
  return lastResult;
}

export function useCompiled(): CompileResult {
  const nodes = useHarnessStore((s) => s.nodes);
  const edges = useHarnessStore((s) => s.edges);
  return getCompiled(nodes, edges);
}
