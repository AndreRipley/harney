"use client";

import { Bot, MousePointerClick, Plus, Spline } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCanvasActions } from "@/hooks/useCanvasActions";
import { useDocumentActions } from "@/hooks/useDocumentActions";
import { PRESETS } from "@/lib/harness/presets";

const STEPS = [
  { icon: Bot, title: "Add an Agent", text: "Drag it in from the left, or click it." },
  { icon: Spline, title: "Connect cards", text: "Drag a line to an agent. A part joins it. Another agent becomes a subagent." },
  { icon: MousePointerClick, title: "Click to configure", text: "Each card's settings open on the right." },
];

export function EmptyState() {
  const { addCard } = useCanvasActions();
  const { loadPreset } = useDocumentActions();

  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-4">
      <div aria-hidden className="absolute left-1/2 top-1/2 -z-0 hidden -translate-x-1/2 -translate-y-1/2 opacity-60 sm:block">
        <div className="relative h-72 w-[560px]">
          {[0, 1, 2].map((i) => (
            <div key={i} className="absolute left-0 h-14 w-44 rounded-xl border-2 border-dashed border-foreground/10" style={{ top: 30 + i * 80 }} />
          ))}
          <div className="absolute right-0 top-[98px] h-24 w-52 rounded-2xl border-2 border-dashed border-indigo-400/30" />
        </div>
      </div>

      <div className="pointer-events-auto relative w-full max-w-md rounded-2xl border bg-card/95 p-6 text-center shadow-xl backdrop-blur">
        <div className="mx-auto grid size-11 place-items-center rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-300">
          <Bot className="size-5" />
        </div>
        <h2 className="mt-3 text-lg font-semibold">Design your AI harness</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Drag an Agent here to start, or begin from a template and adjust it.
        </p>

        <ol className="mt-5 grid gap-2 text-left sm:grid-cols-3">
          {STEPS.map(({ icon: Icon, title, text }, index) => (
            <li key={title} className="rounded-lg bg-muted/60 p-2.5">
              <div className="flex items-center gap-1.5 text-xs font-semibold">
                <span className="grid size-4 place-items-center rounded-full bg-foreground text-[10px] text-background">{index + 1}</span>
                <Icon className="size-3.5 text-muted-foreground" />
              </div>
              <div className="mt-1.5 text-xs font-medium">{title}</div>
              <div className="text-[11px] leading-snug text-muted-foreground">{text}</div>
            </li>
          ))}
        </ol>

        <Button className="mt-5 w-full" size="lg" onClick={() => addCard("agent")}>
          <Plus /> Add an Agent
        </Button>

        <div className="mt-4 text-xs font-medium text-muted-foreground">Or start from a template</div>
        <div className="mt-2 grid gap-2">
          {PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => loadPreset(preset)}
              className="rounded-lg border px-3 py-2 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <div className="text-sm font-medium">{preset.name}</div>
              <div className="text-xs text-muted-foreground">{preset.description}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
