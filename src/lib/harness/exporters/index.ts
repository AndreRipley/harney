import { usedFeatures } from "../compile";
import type { ExportFile, Feature, HarnessConfig, TargetId, TargetNote } from "../types";
import { buildClaudeCode, CLAUDE_SUPPORT } from "./claudeCode";
import { buildCodex, CODEX_SUPPORT } from "./codex";
import { buildCursor, CURSOR_SUPPORT } from "./cursor";
import { FEATURE_LABELS, type FeatureSupport } from "./shared";

export interface TargetInfo {
  id: TargetId;
  name: string;
  maker: string;
  tagline: string;
  launchCommand: string | null;
  support: Record<Feature, FeatureSupport>;
  build: (config: HarnessConfig) => { files: ExportFile[]; notes: TargetNote[] };
}

export const TARGETS: Record<TargetId, TargetInfo> = {
  claude: {
    id: "claude",
    name: "Claude Code",
    maker: "Anthropic",
    tagline: "Anthropic's coding agent for the terminal and IDE. Supports nearly every card.",
    launchCommand: "claude",
    support: CLAUDE_SUPPORT,
    build: buildClaudeCode,
  },
  cursor: {
    id: "cursor",
    name: "Cursor",
    maker: "Anysphere",
    tagline: "The AI code editor. Project files cover rules, MCP servers and hooks.",
    launchCommand: null,
    support: CURSOR_SUPPORT,
    build: buildCursor,
  },
  codex: {
    id: "codex",
    name: "Codex",
    maker: "OpenAI",
    tagline: "OpenAI's coding agent. Permissions become sandbox and approval settings.",
    launchCommand: "codex",
    support: CODEX_SUPPORT,
    build: buildCodex,
  },
};

export const TARGET_ORDER: TargetId[] = ["claude", "cursor", "codex"];

export interface FeatureReport {
  feature: Feature;
  label: string;
  nodeIds: string[];
  support: FeatureSupport;
}

export interface ExportResult {
  target: TargetInfo;
  files: ExportFile[];
  /** Specific things left out or changed while building the files. */
  notes: TargetNote[];
  /** Every feature the diagram uses, and how well this tool supports it. */
  features: FeatureReport[];
  usedCount: number;
  totalCount: number;
}

export function runExport(config: HarnessConfig, targetId: TargetId): ExportResult {
  const target = TARGETS[targetId];
  const { files, notes } = target.build(config);
  const features: FeatureReport[] = [...usedFeatures(config).entries()].map(([feature, nodeIds]) => {
    const base = target.support[feature];
    const related = notes.filter((n) => n.nodeIds.some((id) => nodeIds.includes(id)));
    const allDropped = nodeIds.every((id) => related.some((n) => n.dropped && n.nodeIds.includes(id)));
    let support: FeatureSupport = base;
    if (related.length && allDropped) support = { level: "none", note: related[0].message };
    else if (related.length && base.level === "full") support = { level: "partial", note: related[0].message };
    return { feature, label: FEATURE_LABELS[feature], nodeIds, support };
  });
  const usedCount = features.filter((f) => f.support.level !== "none").length;
  return { target, files, notes, features, usedCount, totalCount: features.length };
}

export { FEATURE_LABELS };
export type { FeatureSupport };
