"use client";

import { CircleAlert, CircleCheck, CircleMinus, CircleDot, Copy, PanelRightClose, Trash2, TriangleAlert } from "lucide-react";
import { KindIcon, NodeIcon } from "@/components/harness/kindIcons";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useCanvasActions } from "@/hooks/useCanvasActions";
import { isDelegateEdge } from "@/lib/harness/connections";
import { KIND_META, nodeTitle } from "@/lib/harness/kinds";
import { nodeFeatures, nodeSupport } from "@/lib/harness/support";
import type { HarnessNode, Issue, NodeKind } from "@/lib/harness/types";
import { cn } from "@/lib/utils";
import { useCompiled, useHarnessStore } from "@/store/harnessStore";
import { NodeForm } from "./NodeForm";

const SHORTCUTS: [string, string][] = [
  ["Delete", "Remove selected"],
  ["⌘/Ctrl D", "Duplicate"],
  ["⌘/Ctrl Z", "Undo"],
  ["⇧ ⌘/Ctrl Z", "Redo"],
  ["⌘/Ctrl A", "Select all"],
  ["Shift + drag", "Box select"],
];

export function IssueList({ issues, onSelect }: { issues: Issue[]; onSelect?: (issue: Issue) => void }) {
  return (
    <ul className="grid gap-1.5">
      {issues.map((issue) => {
        const isError = issue.severity === "error";
        const Icon = isError ? CircleAlert : TriangleAlert;
        const content = (
          <>
            <Icon className={cn("mt-0.5 size-4 shrink-0", isError ? "text-destructive" : "text-amber-600 dark:text-amber-400")} />
            <span className="text-xs leading-snug">{issue.message}</span>
          </>
        );
        return (
          <li key={issue.id}>
            {onSelect && issue.nodeId ? (
              <button
                type="button"
                onClick={() => onSelect(issue)}
                className="flex w-full items-start gap-2 rounded-lg border bg-card p-2.5 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                {content}
              </button>
            ) : (
              <div className="flex items-start gap-2 rounded-lg border bg-card p-2.5">{content}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function Overview() {
  const { issues, config } = useCompiled();
  const nodes = useHarnessStore((s) => s.nodes);
  const { focusNode } = useCanvasActions();
  const errors = issues.filter((i) => i.severity === "error");
  const warnings = issues.filter((i) => i.severity === "warning");

  const status = errors.length
    ? { icon: CircleAlert, tone: "border-destructive/30 bg-destructive/5 text-destructive", title: `${errors.length} ${errors.length === 1 ? "problem" : "problems"} to fix before exporting` }
    : warnings.length
      ? { icon: TriangleAlert, tone: "border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-300", title: `Ready to export, with ${warnings.length} ${warnings.length === 1 ? "suggestion" : "suggestions"}` }
      : { icon: CircleCheck, tone: "border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300", title: "Ready to export" };
  const StatusIcon = status.icon;

  return (
    <div className="grid gap-5 p-4">
      <div>
        <h2 className="text-sm font-semibold">Harness overview</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">Select a card to edit it. Problems show up here.</p>
      </div>

      {nodes.length > 0 && (
        <div className={cn("flex items-center gap-2 rounded-lg border p-3 text-sm font-medium", status.tone)}>
          <StatusIcon className="size-4 shrink-0" />
          {status.title}
        </div>
      )}

      {config && (
        <dl className="grid grid-cols-3 gap-2 text-center">
          {[
            ["Agents", 1 + config.subagents.length],
            ["Cards", nodes.length],
            ["Issues", issues.length],
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg bg-muted/60 py-2">
              <dt className="text-[11px] text-muted-foreground">{label}</dt>
              <dd className="text-lg font-semibold tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
      )}

      {issues.length > 0 && nodes.length > 0 && (
        <section className="grid gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">To review</h3>
          <IssueList issues={issues} onSelect={(issue) => issue.nodeId && focusNode(issue.nodeId)} />
        </section>
      )}

      <section className="grid gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Shortcuts</h3>
        <dl className="grid gap-1 text-xs">
          {SHORTCUTS.map(([keys, action]) => (
            <div key={keys} className="flex items-center justify-between gap-2">
              <dt className="text-muted-foreground">{action}</dt>
              <dd>
                <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[11px]">{keys}</kbd>
              </dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}

const SUPPORT_ICONS = {
  full: { icon: CircleCheck, className: "text-emerald-600 dark:text-emerald-400", label: "Used" },
  partial: { icon: CircleDot, className: "text-amber-600 dark:text-amber-400", label: "Partly used" },
  none: { icon: CircleMinus, className: "text-muted-foreground", label: "Not used" },
} as const;

function WorksWith({ node, isSubagent }: { node: HarnessNode; isSubagent: boolean }) {
  const { config, connected } = useCompiled();
  if (!connected.has(node.id) && node.data.kind !== "agent") return null;
  const rows = nodeSupport(node, isSubagent, config);
  if (nodeFeatures(node, isSubagent).length === 0 && rows.every((r) => r.notes.length === 0)) return null;
  return (
    <section className="grid gap-2">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Works with</h3>
      <ul className="grid gap-1.5">
        {rows.map((row) => {
          const meta = SUPPORT_ICONS[row.level];
          const Icon = meta.icon;
          return (
            <li key={row.target} className="rounded-lg border p-2.5">
              <div className="flex items-center gap-2 text-sm">
                <Icon className={cn("size-4", meta.className)} aria-hidden />
                <span className="font-medium">{row.name}</span>
                <span className={cn("ml-auto text-xs", meta.className)}>{meta.label}</span>
              </div>
              {row.notes.length > 0 && (
                <ul className="mt-1.5 grid gap-1 pl-6 text-xs leading-snug text-muted-foreground">
                  {row.notes.map((note) => (
                    <li key={note}>{note}</li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function NodePanel({ node }: { node: HarnessNode }) {
  const edges = useHarnessStore((s) => s.edges);
  const removeNodes = useHarnessStore((s) => s.removeNodes);
  const duplicateSelection = useHarnessStore((s) => s.duplicateSelection);
  const { issues, rootId } = useCompiled();
  const meta = KIND_META[node.data.kind];
  const isSubagent = node.data.kind === "agent" && edges.some((e) => e.target === node.id && isDelegateEdge(e));
  const nodeIssues = issues.filter((i) => i.nodeId === node.id);
  const role = node.data.kind === "agent" ? (node.id === rootId ? "Main agent" : isSubagent ? "Subagent" : "Agent") : meta.label;

  return (
    <div className="grid gap-5 p-4">
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg" style={{ background: `${meta.color}1f`, color: meta.color }}>
          <NodeIcon data={node.data} className="size-4.5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{role}</div>
          <h2 className="truncate text-sm font-semibold">{nodeTitle(node.data)}</h2>
        </div>
        <div className="flex gap-0.5">
          <Tooltip>
            <TooltipTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Duplicate card" onClick={duplicateSelection} />}>
              <Copy />
            </TooltipTrigger>
            <TooltipContent>Duplicate</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger
              render={<Button variant="ghost" size="icon-sm" aria-label="Delete card" onClick={() => removeNodes([node.id])} className="hover:text-destructive" />}
            >
              <Trash2 />
            </TooltipTrigger>
            <TooltipContent>Delete</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {nodeIssues.length > 0 && <IssueList issues={nodeIssues} />}

      <div key={node.id} className="grid gap-4">
        <NodeForm node={node} isSubagent={isSubagent} />
      </div>

      {node.data.kind === "agent" && <QuickAdd agentId={node.id} />}

      <WorksWith node={node} isSubagent={isSubagent} />
    </div>
  );
}

const QUICK_ADD: NodeKind[] = [
  "model",
  "prompt",
  "loop",
  "tool",
  "mcp",
  "skill",
  "context",
  "progress",
  "rule",
  "policy",
  "sandbox",
  "hook",
  "decision",
  "verifier",
  "agent",
];

function QuickAdd({ agentId }: { agentId: string }) {
  const { addCard } = useCanvasActions();
  const selectOnly = useHarnessStore((s) => s.selectOnly);
  return (
    <section className="grid gap-2">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Add to this agent</h3>
      <div className="flex flex-wrap gap-1.5">
        {QUICK_ADD.map((kind) => {
          const meta = KIND_META[kind];
          return (
            <Button
              key={kind}
              variant="outline"
              size="sm"
              onClick={() => {
                selectOnly(agentId);
                addCard(kind);
              }}
            >
              <KindIcon kind={kind} className="size-3.5" style={{ color: meta.color }} />
              {kind === "agent" ? "Subagent" : meta.label}
            </Button>
          );
        })}
      </div>
    </section>
  );
}

function MultiSelection({ nodes }: { nodes: HarnessNode[] }) {
  const removeNodes = useHarnessStore((s) => s.removeNodes);
  const duplicateSelection = useHarnessStore((s) => s.duplicateSelection);
  return (
    <div className="grid gap-4 p-4">
      <div>
        <h2 className="text-sm font-semibold">{nodes.length} cards selected</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">Drag any of them to move the group.</p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" onClick={duplicateSelection}>
          <Copy /> Duplicate
        </Button>
        <Button variant="destructive" onClick={() => removeNodes(nodes.map((n) => n.id))}>
          <Trash2 /> Delete
        </Button>
      </div>
    </div>
  );
}

export function InspectorContent() {
  const nodes = useHarnessStore((s) => s.nodes);
  const selected = nodes.filter((n) => n.selected);
  if (selected.length === 0) return <Overview />;
  if (selected.length > 1) return <MultiSelection nodes={selected} />;
  return <NodePanel node={selected[0]} />;
}

export function Inspector({ className }: { className?: string }) {
  const setInspectorOpen = useHarnessStore((s) => s.setInspectorOpen);
  return (
    <aside id="inspector" aria-label="Inspector" className={cn("w-96 shrink-0 flex-col overflow-hidden border-l bg-background", className)}>
      <div className="flex items-center gap-2 border-b bg-background py-1.5 pr-2 pl-4">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Inspector</h2>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button variant="ghost" size="icon-sm" aria-label="Close inspector" onClick={() => setInspectorOpen(false)} className="ml-auto" />
            }
          >
            <PanelRightClose />
          </TooltipTrigger>
          <TooltipContent>Hide panel</TooltipContent>
        </Tooltip>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <InspectorContent />
      </div>
    </aside>
  );
}
