"use client";

import { Search } from "lucide-react";
import { type DragEvent, useState } from "react";
import { KIND_ICONS } from "@/components/harness/kindIcons";
import { Input } from "@/components/ui/input";
import { DND_MIME, useCanvasActions } from "@/hooks/useCanvasActions";
import { GROUP_LABELS, KIND_META, KIND_ORDER, type KindGroup } from "@/lib/harness/kinds";
import type { NodeKind } from "@/lib/harness/types";
import { cn } from "@/lib/utils";

const GROUPS: KindGroup[] = ["core", "capabilities", "guardrails"];

export function PaletteList({ onAdded, compact = false }: { onAdded?: () => void; compact?: boolean }) {
  const [query, setQuery] = useState("");
  const { addCard } = useCanvasActions();
  const q = query.trim().toLowerCase();
  const visible = KIND_ORDER.filter(
    (kind) => !q || KIND_META[kind].label.toLowerCase().includes(q) || KIND_META[kind].blurb.toLowerCase().includes(q),
  );

  const onDragStart = (event: DragEvent, kind: NodeKind) => {
    event.dataTransfer.setData(DND_MIME, kind);
    event.dataTransfer.effectAllowed = "copy";
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="relative px-3 pt-3 pb-2">
        <Search className="pointer-events-none absolute top-1/2 left-5.5 mt-0.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search parts"
          aria-label="Search parts"
          className="pl-8"
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        {GROUPS.map((group) => {
          const kinds = visible.filter((k) => KIND_META[k].group === group);
          if (kinds.length === 0) return null;
          return (
            <section key={group} className="mt-3 first:mt-1">
              <h3 className="mb-1.5 px-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {GROUP_LABELS[group]}
              </h3>
              <ul className={cn("grid gap-1.5", compact && "grid-cols-2")}>
                {kinds.map((kind) => {
                  const meta = KIND_META[kind];
                  const Icon = KIND_ICONS[kind];
                  return (
                    <li key={kind}>
                      <button
                        type="button"
                        draggable
                        onDragStart={(e) => onDragStart(e, kind)}
                        onClick={() => {
                          addCard(kind);
                          onAdded?.();
                        }}
                        title={`Drag onto the canvas, or click to add a ${meta.label}`}
                        className="group flex w-full cursor-grab items-start gap-2.5 rounded-lg border bg-card p-2 text-left transition-all hover:-translate-y-px hover:border-foreground/15 hover:shadow-sm focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 active:cursor-grabbing"
                      >
                        <span
                          className="mt-px grid size-7 shrink-0 place-items-center rounded-md"
                          style={{ background: `${meta.color}1f`, color: meta.color }}
                        >
                          <Icon className="size-4" />
                        </span>
                        <span className="min-w-0">
                          <span className="block text-sm font-medium leading-tight">{meta.label}</span>
                          {!compact && (
                            <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">{meta.blurb}</span>
                          )}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
        {visible.length === 0 && (
          <p className="px-1 py-6 text-center text-sm text-muted-foreground">No parts match &ldquo;{query}&rdquo;.</p>
        )}
      </div>
    </div>
  );
}

export function Palette({ className }: { className?: string }) {
  return (
    <aside aria-label="Parts" className={cn("w-64 shrink-0 flex-col border-r bg-sidebar", className)}>
      <PaletteList />
      <p className="border-t px-4 py-3 text-xs leading-relaxed text-muted-foreground">
        <span className="font-medium text-foreground">Tip:</span> select an agent first, then click a part to add
        and connect it in one step.
      </p>
    </aside>
  );
}
