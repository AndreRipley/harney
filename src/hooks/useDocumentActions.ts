"use client";

import { useCallback } from "react";
import { toast } from "sonner";
import { downloadBlob } from "@/lib/download";
import { parseDiagram, serializeDiagram } from "@/lib/harness/diagramFile";
import { slugify } from "@/lib/harness/kinds";
import type { Preset } from "@/lib/harness/presets";
import { useHarnessStore } from "@/store/harnessStore";
import { useCanvasActions } from "./useCanvasActions";

const undoAction = { label: "Undo", onClick: () => useHarnessStore.getState().undo() };

export function useDocumentActions() {
  const { fitAll } = useCanvasActions();

  const loadPreset = useCallback(
    (preset: Preset) => {
      const { nodes, edges } = preset.build();
      useHarnessStore.getState().loadDocument({ name: preset.name, nodes, edges });
      fitAll();
      toast.success(`Loaded "${preset.name}"`, { description: "Click any card to change its settings.", action: undoAction });
    },
    [fitAll],
  );

  const clearBoard = useCallback(() => {
    useHarnessStore.getState().loadDocument({ name: "Untitled harness", nodes: [], edges: [] });
    toast("Board cleared", { action: undoAction });
  }, []);

  const saveDiagram = useCallback(() => {
    const { name, nodes, edges } = useHarnessStore.getState();
    const blob = new Blob([serializeDiagram({ name, nodes, edges })], { type: "application/json" });
    downloadBlob(blob, `${slugify(name, "harness")}.harness.json`);
    toast.success("Diagram saved", { description: "Import it later to keep editing, or share it with a teammate." });
  }, []);

  const importDiagram = useCallback(
    async (file: File) => {
      try {
        const doc = parseDiagram(await file.text());
        useHarnessStore.getState().loadDocument(doc);
        fitAll();
        toast.success(`Imported "${doc.name}"`, { action: undoAction });
      } catch (error) {
        toast.error("Couldn't import that file", {
          description: error instanceof Error ? error.message : "Something went wrong reading it.",
        });
      }
    },
    [fitAll],
  );

  return { loadPreset, clearBoard, saveDiagram, importDiagram };
}
