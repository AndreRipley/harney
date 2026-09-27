"use client";

import JSZip from "jszip";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CircleAlert,
  CircleCheck,
  CircleDot,
  CircleMinus,
  Download,
  Loader2,
  Save,
  TriangleAlert,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { IssueList } from "@/components/inspector/Inspector";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useCanvasActions } from "@/hooks/useCanvasActions";
import { useDocumentActions } from "@/hooks/useDocumentActions";
import { useExport } from "@/hooks/useExport";
import { downloadBlob } from "@/lib/download";
import { runExport, TARGET_ORDER, TARGETS } from "@/lib/harness/exporters";
import { zipFileName } from "@/lib/harness/setupGuide";
import type { HarnessConfig, Issue, TargetId } from "@/lib/harness/types";
import { cn } from "@/lib/utils";
import { useCompiled, useHarnessStore } from "@/store/harnessStore";
import { SetupGuide } from "./SetupGuide";

const STEPS = ["Choose your tool", "Review", "Download and set up"] as const;

const TARGET_BADGES: Record<TargetId, { label: string; className: string }> = {
  claude: { label: "CC", className: "bg-[#d97757] text-white" },
  cursor: { label: "Cu", className: "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900" },
  codex: { label: "Cx", className: "bg-[#10a37f] text-white" },
};

function TargetBadge({ id, size = "md" }: { id: TargetId; size?: "sm" | "md" }) {
  const badge = TARGET_BADGES[id];
  return (
    <span
      aria-hidden
      className={cn(
        "grid shrink-0 place-items-center rounded-xl font-bold tracking-tight",
        size === "md" ? "size-11 text-base" : "size-8 text-xs",
        badge.className,
      )}
    >
      {badge.label}
    </span>
  );
}

function Stepper({ step, onStep }: { step: number; onStep: (step: number) => void }) {
  return (
    <ol className="flex items-center gap-2" aria-label="Export steps">
      {STEPS.map((label, index) => {
        const complete = index < step;
        const current = index === step;
        return (
          <li key={label} className="flex min-w-0 flex-1 items-center gap-2">
            <button
              type="button"
              disabled={index > step}
              onClick={() => onStep(index)}
              aria-current={current ? "step" : undefined}
              className="flex min-w-0 items-center gap-2 rounded-md text-left focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-default"
            >
              <span
                className={cn(
                  "grid size-6 shrink-0 place-items-center rounded-full text-xs font-semibold transition-colors",
                  complete && "bg-emerald-500 text-white",
                  current && "bg-foreground text-background",
                  !complete && !current && "bg-muted text-muted-foreground",
                )}
              >
                {complete ? <Check className="size-3.5" /> : index + 1}
              </span>
              <span className={cn("truncate text-xs font-medium", current ? "text-foreground" : "text-muted-foreground", !current && "hidden sm:inline")}>
                {label}
              </span>
            </button>
            {index < STEPS.length - 1 && (
              <span className={cn("h-px flex-1 transition-colors", complete ? "bg-emerald-500" : "bg-border")} />
            )}
          </li>
        );
      })}
    </ol>
  );
}

function TargetPicker({
  config,
  value,
  onChange,
}: {
  config: HarnessConfig;
  value: TargetId;
  onChange: (id: TargetId) => void;
}) {
  return (
    <div className="grid gap-4">
      <div>
        <h3 className="text-base font-semibold">Which tool will run your harness?</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Each tool reads its own set of files. Pick the one you use; you can come back and export for another.
        </p>
      </div>
      <div role="radiogroup" aria-label="Export target" className="grid gap-3 md:grid-cols-3">
        {TARGET_ORDER.map((id) => {
          const target = TARGETS[id];
          const result = runExport(config, id);
          const selected = id === value;
          const pct = result.totalCount ? Math.round((result.usedCount / result.totalCount) * 100) : 100;
          const unused = result.features.filter((f) => f.support.level === "none").map((f) => f.label);
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(id)}
              className={cn(
                "relative flex flex-col gap-3 rounded-xl border-2 bg-card p-4 text-left transition-all focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                selected ? "border-foreground shadow-md" : "border-border hover:border-foreground/30",
              )}
            >
              {selected && (
                <span className="absolute top-3 right-3 grid size-5 place-items-center rounded-full bg-foreground text-background">
                  <Check className="size-3.5" />
                </span>
              )}
              <div className="flex items-center gap-3">
                <TargetBadge id={id} />
                <div>
                  <div className="font-semibold">{target.name}</div>
                  <div className="text-xs text-muted-foreground">by {target.maker}</div>
                </div>
              </div>
              <p className="text-sm leading-snug text-muted-foreground">{target.tagline}</p>
              <div className="mt-auto grid gap-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium">
                    Uses {result.usedCount} of {result.totalCount} settings
                  </span>
                  <span className="text-muted-foreground tabular-nums">{pct}%</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn("h-full rounded-full", pct >= 85 ? "bg-emerald-500" : pct >= 60 ? "bg-amber-500" : "bg-orange-500")}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                {unused.length > 0 && (
                  <p className="text-xs leading-snug text-muted-foreground">
                    Won&apos;t use: {unused.slice(0, 3).join(", ")}
                    {unused.length > 3 && ` and ${unused.length - 3} more`}
                  </p>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

const LEVEL_ICONS = {
  full: { icon: CircleCheck, className: "text-emerald-600 dark:text-emerald-400" },
  partial: { icon: CircleDot, className: "text-amber-600 dark:text-amber-400" },
  none: { icon: CircleMinus, className: "text-muted-foreground" },
} as const;

function ReviewStep({ targetId, onFix }: { targetId: TargetId; onFix: (issue: Issue) => void }) {
  const { issues, config } = useCompiled();
  const bundle = useExport(targetId);
  const errors = issues.filter((i) => i.severity === "error");
  const warnings = issues.filter((i) => i.severity === "warning");
  const target = TARGETS[targetId];
  if (!config || !bundle) return null;
  const partCount = [config.root, ...config.subagents].reduce(
    (sum, a) =>
      sum + (a.model ? 1 : 0) + a.instructions.length + a.rules.length + a.tools.length + a.policies.length + a.mcpServers.length + a.hooks.length,
    0,
  );

  return (
    <div className="grid gap-5">
      {errors.length > 0 ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4">
          <div className="flex items-center gap-2 font-semibold text-destructive">
            <CircleAlert className="size-5" />
            {errors.length === 1 ? "One thing to fix before exporting" : `${errors.length} things to fix before exporting`}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">Click a problem to jump to that card on the canvas.</p>
          <div className="mt-3">
            <IssueList issues={errors} onSelect={onFix} />
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-4 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4">
          <span className="grid size-12 shrink-0 place-items-center rounded-full bg-emerald-500 text-white">
            <Check className="size-6" />
          </span>
          <div>
            <div className="text-base font-semibold">Ready to export</div>
            <p className="text-sm text-muted-foreground">
              {config.root.name}
              {config.subagents.length > 0 && ` and ${config.subagents.length} ${config.subagents.length === 1 ? "subagent" : "subagents"}`}, with {partCount}{" "}
              {partCount === 1 ? "part" : "parts"}, will become {bundle.files.length} files for {target.name}.
            </p>
          </div>
        </div>
      )}

      {warnings.length > 0 && (
        <section className="grid gap-2">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <TriangleAlert className="size-4 text-amber-600 dark:text-amber-400" />
            Worth a look <span className="font-normal text-muted-foreground">(these won&apos;t stop the export)</span>
          </h3>
          <IssueList issues={warnings} onSelect={onFix} />
        </section>
      )}

      <section className="grid gap-2">
        <h3 className="text-sm font-semibold">How {target.name} uses your diagram</h3>
        <ul className="divide-y rounded-xl border">
          {bundle.result.features.map((f) => {
            const { icon: Icon, className } = LEVEL_ICONS[f.support.level];
            return (
              <li key={f.feature} className="flex items-start gap-3 px-3 py-2.5">
                <Icon className={cn("mt-0.5 size-4 shrink-0", className)} aria-hidden />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">{f.label}</div>
                  <div className="text-xs leading-snug text-muted-foreground">{f.support.note}</div>
                </div>
                <span className={cn("shrink-0 text-xs font-medium", className)}>
                  {f.support.level === "full" ? "Used" : f.support.level === "partial" ? "Partly used" : "Not used"}
                </span>
              </li>
            );
          })}
          {bundle.result.notes.map((note) => (
            <li key={note.message} className="flex items-start gap-3 bg-amber-500/5 px-3 py-2.5">
              <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
              <div className="text-xs leading-snug text-muted-foreground">{note.message}</div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function SetupStepView({ targetId }: { targetId: TargetId }) {
  const { config } = useCompiled();
  const bundle = useExport(targetId);
  const [downloading, setDownloading] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const [done, setDone] = useState<Set<string>>(new Set());
  if (!config || !bundle) return null;
  const target = TARGETS[targetId];
  const filename = zipFileName(config, targetId);
  const checkable = bundle.steps.filter((s) => s.kind !== "warning");
  const doneCount = checkable.filter((s) => done.has(s.id)).length;

  const download = async () => {
    setDownloading(true);
    try {
      const zip = new JSZip();
      for (const file of bundle.files) zip.file(file.path, file.content);
      downloadBlob(await zip.generateAsync({ type: "blob" }), filename);
      setDownloaded(true);
    } catch {
      toast.error("Couldn't build the zip file. Try again, or copy the files one by one.");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="grid gap-5">
      <div className="flex flex-col items-start gap-4 rounded-xl border bg-gradient-to-br from-muted/60 to-transparent p-5 sm:flex-row sm:items-center">
        <TargetBadge id={targetId} />
        <div className="min-w-0 flex-1">
          <div className="text-base font-semibold">Your {target.name} files are ready</div>
          <p className="text-sm text-muted-foreground">
            <span className="font-mono text-xs">{filename}</span> · {bundle.files.length} files, including these setup steps
          </p>
        </div>
        <Button size="lg" className="h-11 px-5 text-sm" onClick={download} disabled={downloading}>
          {downloading ? <Loader2 className="animate-spin" /> : downloaded ? <Check /> : <Download />}
          {downloaded ? "Download again" : "Download zip"}
        </Button>
      </div>

      <div className="flex items-end justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold">Set it up in {target.name}</h3>
          <p className="text-sm text-muted-foreground">Tick each step off as you go.</p>
        </div>
        <span className="shrink-0 text-xs font-medium text-muted-foreground tabular-nums">
          {doneCount} of {checkable.length} done
        </span>
      </div>

      <SetupGuide
        steps={bundle.steps}
        files={bundle.files}
        done={done}
        onToggle={(id) =>
          setDone((current) => {
            const next = new Set(current);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
          })
        }
      />

      {doneCount === checkable.length && (
        <div className="flex items-center gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 text-sm">
          <CircleCheck className="size-5 shrink-0 text-emerald-600" />
          <span>
            <span className="font-semibold">All set.</span> Your harness is running in {target.name}. Come back any time to change it and export again.
          </span>
        </div>
      )}
    </div>
  );
}

export function ExportDialog() {
  const open = useHarnessStore((s) => s.exportOpen);
  const setOpen = useHarnessStore((s) => s.setExportOpen);
  const target = useHarnessStore((s) => s.previewTarget);
  const setTarget = useHarnessStore((s) => s.setPreviewTarget);
  const { config, issues } = useCompiled();
  const { focusNode } = useCanvasActions();
  const { saveDiagram } = useDocumentActions();
  const [step, setStep] = useState(0);
  const [wasOpen, setWasOpen] = useState(open);
  const hasErrors = issues.some((i) => i.severity === "error");

  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setStep(0);
  }

  const close = () => setOpen(false);
  const fix = (issue: Issue) => {
    close();
    if (issue.nodeId) window.setTimeout(() => focusNode(issue.nodeId!), 150);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
    >
      <DialogContent className="flex h-[min(92dvh,880px)] w-[calc(100%-1.5rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-4xl">
        <div className="grid gap-4 border-b px-5 pt-5 pb-4 sm:px-6">
          <div className="pr-8">
            <DialogTitle className="text-lg font-semibold">Export your harness</DialogTitle>
            <DialogDescription className="mt-1">
              Turn your diagram into files your AI tool understands, then follow the steps to start using it.
            </DialogDescription>
          </div>
          <Stepper step={step} onStep={setStep} />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
          {!config ? (
            <div className="grid h-full place-items-center text-center">
              <div>
                <div className="font-semibold">Nothing to export yet</div>
                <p className="mt-1 text-sm text-muted-foreground">Add an Agent to the canvas first.</p>
                <Button className="mt-4" variant="outline" onClick={close}>
                  Back to canvas
                </Button>
              </div>
            </div>
          ) : step === 0 ? (
            <TargetPicker config={config} value={target} onChange={setTarget} />
          ) : step === 1 ? (
            <ReviewStep targetId={target} onFix={fix} />
          ) : (
            <SetupStepView key={target} targetId={target} />
          )}
        </div>

        <div className="flex items-center gap-2 border-t bg-muted/40 px-5 py-3 sm:px-6">
          <Button variant="ghost" onClick={saveDiagram} disabled={!config}>
            <Save /> <span className="hidden sm:inline">Save diagram</span>
          </Button>
          <div className="ml-auto flex items-center gap-2">
            {step > 0 && (
              <Button variant="outline" onClick={() => setStep(step - 1)}>
                <ArrowLeft /> Back
              </Button>
            )}
            {step < 2 ? (
              <Button
                onClick={() => setStep(step + 1)}
                disabled={!config || (step === 1 && hasErrors)}
                title={step === 1 && hasErrors ? "Fix the problems above first" : undefined}
              >
                {step === 0 ? `Continue with ${TARGETS[target].name}` : "Continue"} <ArrowRight />
              </Button>
            ) : (
              <Button onClick={close}>Back to canvas</Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
