"use client";

import { Handle, type NodeProps, Position } from "@xyflow/react";
import { CircleAlert, TriangleAlert } from "lucide-react";
import { Fragment, memo } from "react";
import { NodeIcon } from "@/components/harness/kindIcons";
import { CONNECTORS, isDelegateEdge, isPartsEdge } from "@/lib/harness/connections";
import { KIND_META, nodeSummary, nodeTitle } from "@/lib/harness/kinds";
import type { HarnessNode, Issue, ToolMode } from "@/lib/harness/types";
import { cn } from "@/lib/utils";
import { useCompiled, useHarnessStore } from "@/store/harnessStore";

const FLOW_POSITION = {
  top: Position.Top,
  bottom: Position.Bottom,
  left: Position.Left,
  right: Position.Right,
} as const;

function Connectors({ color }: { color: string }) {
  const tint = { ["--handle-color" as string]: color };
  return (
    <>
      {CONNECTORS.map((connector) => {
        const style = {
          ...tint,
          ...(connector.side === "top" || connector.side === "bottom"
            ? { left: `${connector.along}%` }
            : { top: `${connector.along}%` }),
        };
        return (
          <Fragment key={connector.id}>
            <Handle type="source" position={FLOW_POSITION[connector.side]} id={`${connector.id}-out`} className="harness-handle" style={style} />
            <Handle
              type="target"
              position={FLOW_POSITION[connector.side]}
              id={`${connector.id}-in`}
              className="harness-handle harness-handle-target"
              style={style}
            />
          </Fragment>
        );
      })}
    </>
  );
}

const MODE_STYLES: Record<ToolMode, string> = {
  allow: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
  ask: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  deny: "bg-rose-500/12 text-rose-700 dark:text-rose-300",
};

function StatusBadge({ issues }: { issues: Issue[] }) {
  if (issues.length === 0) return null;
  const hasError = issues.some((i) => i.severity === "error");
  const Icon = hasError ? CircleAlert : TriangleAlert;
  return (
    <span
      title={issues.map((i) => i.message).join("\n")}
      aria-label={`${issues.length} ${issues.length === 1 ? "issue" : "issues"}: ${issues[0].message}`}
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold normal-case tracking-normal",
        hasError ? "bg-destructive/12 text-destructive" : "bg-amber-500/15 text-amber-700 dark:text-amber-300",
      )}
    >
      <Icon className="size-3" />
      {issues.length}
    </span>
  );
}

function HarnessNodeCardImpl({ id, data, selected }: NodeProps<HarnessNode>) {
  const { issues, connected, rootId } = useCompiled();
  const edges = useHarnessStore((s) => s.edges);
  const nodeIssues = issues.filter((i) => i.nodeId === id);
  const meta = KIND_META[data.kind];
  const color = meta.color;

  if (data.kind === "agent") {
    const partCount = edges.filter((e) => e.target === id && isPartsEdge(e)).length;
    const subCount = edges.filter((e) => e.source === id && isDelegateEdge(e)).length;
    const isChild = edges.some((e) => e.target === id && isDelegateEdge(e));
    const role = id === rootId ? "Main agent" : isChild ? "Subagent" : "Agent";
    return (
      <div
        className={cn(
          "group relative w-[272px] rounded-2xl border bg-card text-card-foreground shadow-sm transition-shadow",
          selected ? "shadow-lg ring-2 ring-offset-2 ring-offset-background" : "hover:shadow-md",
        )}
        style={{ ["--tw-ring-color" as string]: color }}
      >
        <div className="flex items-center gap-2 rounded-t-2xl px-3 py-2 text-white" style={{ background: color }}>
          <NodeIcon data={data} className="size-4" aria-hidden />
          <span className="text-[11px] font-semibold uppercase tracking-wider opacity-95">{role}</span>
          <span className="ml-auto">
            <StatusBadge issues={nodeIssues} />
          </span>
        </div>
        <div className="px-3 pt-2.5 pb-3">
          <div className="truncate text-[15px] font-semibold">{nodeTitle(data)}</div>
          <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{nodeSummary(data)}</div>
          <div className="mt-2.5 flex flex-wrap gap-1.5 text-[11px] font-medium text-muted-foreground">
            <span className="rounded-md bg-muted px-1.5 py-0.5">
              {partCount} {partCount === 1 ? "part" : "parts"}
            </span>
            {subCount > 0 && (
              <span className="rounded-md bg-muted px-1.5 py-0.5">
                {subCount} {subCount === 1 ? "subagent" : "subagents"}
              </span>
            )}
          </div>
        </div>
        <Connectors color={color} />
      </div>
    );
  }

  const isConnected = connected.has(id);
  return (
    <div
      className={cn(
        "group relative w-60 rounded-xl border bg-card text-card-foreground shadow-sm transition-shadow",
        !isConnected && "border-dashed",
        selected ? "shadow-lg ring-2 ring-offset-2 ring-offset-background" : "hover:shadow-md",
      )}
      style={{ ["--tw-ring-color" as string]: color }}
    >
      <div className="h-1 rounded-t-xl" style={{ background: color }} />
      <div className="px-3 pt-2 pb-3">
        <div className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
          <NodeIcon data={data} className="size-3.5" style={{ color }} aria-hidden />
          {meta.label}
          <span className="ml-auto flex items-center gap-1">
            {!isConnected && (
              <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] normal-case tracking-normal">
                Not connected
              </span>
            )}
            <StatusBadge issues={nodeIssues.filter((i) => !/isn't connected/.test(i.message))} />
          </span>
        </div>
        <div className="mt-1 truncate text-sm font-semibold">{nodeTitle(data)}</div>
        {data.kind === "tool" ? (
          <span className={cn("mt-1 inline-block rounded-md px-1.5 py-0.5 text-[11px] font-medium", MODE_STYLES[data.config.mode])}>
            {nodeSummary(data)}
          </span>
        ) : (
          <div className="truncate text-xs text-muted-foreground">{nodeSummary(data)}</div>
        )}
      </div>
      <Connectors color={color} />
    </div>
  );
}

export const HarnessNodeCard = memo(HarnessNodeCardImpl);
