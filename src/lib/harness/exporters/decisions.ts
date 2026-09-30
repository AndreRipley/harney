import { projectDecisions } from "../compile";
import { renderDecisionScript } from "../jev";
import { slugify } from "../kinds";
import type { DecisionData, DecisionEvent, ExportFile, HarnessConfig, HookScope, TargetId } from "../types";
import { uniqueNamer } from "./shared";

export interface DecisionHookEntry {
  nodeId: string;
  name: string;
  event: DecisionEvent;
  scope: HookScope;
  command: string;
}

/** Cursor's hook name for a decision, or null when that moment doesn't exist there. */
export function cursorDecisionEvent(decision: Pick<DecisionData, "event" | "scope">): string | null {
  if (decision.event === "userPromptSubmit") return "beforeSubmitPrompt";
  if (decision.event === "stop") return "stop";
  if (decision.scope === "edit") return null;
  if (decision.scope === "shell") return "beforeShellExecution";
  return "preToolUse";
}

export function buildDecisionExport(config: HarnessConfig, target: TargetId): {
  files: ExportFile[];
  entries: DecisionHookEntry[];
  skipped: string[];
} {
  const files: ExportFile[] = [];
  const entries: DecisionHookEntry[] = [];
  const skipped: string[] = [];
  const name = uniqueNamer();

  for (const decision of projectDecisions(config)) {
    if (target === "cursor" && !cursorDecisionEvent(decision)) {
      skipped.push(decision.nodeId);
      continue;
    }
    const slug = name(slugify(decision.name, "jev"));
    const command = `node .harness/decisions/${slug}.mjs`;
    files.push({
      path: `.harness/decisions/${slug}.mjs`,
      content: renderDecisionScript(decision, target),
      description: `Asks Jev ("${decision.name}") and blocks when an answer crosses the line you set. Reads ${"TYPESAFE_API_KEY"} from the environment.`,
    });
    entries.push({
      nodeId: decision.nodeId,
      name: decision.name,
      event: decision.event,
      scope: decision.scope,
      command,
    });
  }

  return { files, entries, skipped };
}
