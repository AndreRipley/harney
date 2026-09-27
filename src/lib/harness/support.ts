import { runExport, TARGET_ORDER, TARGETS } from "./exporters";
import type { FeatureSupport } from "./exporters/shared";
import { FEATURE_LABELS } from "./exporters/shared";
import type { Feature, HarnessConfig, HarnessNode, TargetId } from "./types";

/** The harness features a single card contributes. */
export function nodeFeatures(node: HarnessNode, isSubagent: boolean): Feature[] {
  const data = node.data;
  switch (data.kind) {
    case "agent":
      return isSubagent ? ["subagents"] : [];
    case "model": {
      const features: Feature[] = ["model"];
      if (data.config.temperature !== null) features.push("temperature");
      if (data.config.maxOutputTokens !== null) features.push("maxTokens");
      if (data.config.reasoningEffort !== "default") features.push("reasoning");
      return features;
    }
    case "prompt":
      return ["instructions"];
    case "rule":
      return !data.config.alwaysApply && data.config.globs.length ? ["rules", "ruleGlobs"] : ["rules"];
    case "tool":
      return ["toolPermissions"];
    case "policy": {
      const features: Feature[] = [];
      if (data.config.allowCommands.length || data.config.denyCommands.length) features.push("commandRules");
      if (!data.config.allowNetwork || data.config.allowedDomains.length) features.push("network");
      return features;
    }
    case "mcp":
      return ["mcp"];
    case "hook":
      return ["hooks"];
  }
}

export interface NodeTargetSupport {
  target: TargetId;
  name: string;
  level: FeatureSupport["level"];
  notes: string[];
}

const RANK = { full: 0, partial: 1, none: 2 } as const;

/** How each export target handles one card, combining feature support with build-time notes. */
export function nodeSupport(
  node: HarnessNode,
  isSubagent: boolean,
  config: HarnessConfig | null,
): NodeTargetSupport[] {
  const features = nodeFeatures(node, isSubagent);
  return TARGET_ORDER.map((targetId) => {
    const target = TARGETS[targetId];
    let level: FeatureSupport["level"] = "full";
    const notes: string[] = [];
    for (const feature of features) {
      const support = target.support[feature];
      if (RANK[support.level] > RANK[level]) level = support.level;
      if (support.level !== "full") notes.push(`${FEATURE_LABELS[feature]}: ${support.note}`);
    }
    if (config) {
      for (const note of runExport(config, targetId).notes) {
        if (note.nodeIds.includes(node.id)) {
          notes.push(note.message);
          if (level === "full") level = "partial";
        }
      }
    }
    return { target: targetId, name: target.name, level, notes };
  });
}
