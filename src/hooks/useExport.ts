"use client";

import { useMemo } from "react";
import { type ExportResult, runExport } from "@/lib/harness/exporters";
import { bundleFiles, type SetupStep } from "@/lib/harness/setupGuide";
import type { ExportFile, TargetId } from "@/lib/harness/types";
import { useCompiled } from "@/store/harnessStore";

export interface ExportBundle {
  result: ExportResult;
  files: ExportFile[];
  steps: SetupStep[];
}

export function useExport(targetId: TargetId): ExportBundle | null {
  const { config } = useCompiled();
  return useMemo(() => {
    if (!config) return null;
    const result = runExport(config, targetId);
    const { files, steps } = bundleFiles(config, targetId, result.files);
    return { result, files, steps };
  }, [config, targetId]);
}
