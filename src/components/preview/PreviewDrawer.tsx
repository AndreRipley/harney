"use client";

import { ChevronDown, FileText, Info, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useExport } from "@/hooks/useExport";
import { TARGET_ORDER, TARGETS } from "@/lib/harness/exporters";
import type { TargetId } from "@/lib/harness/types";
import { cn } from "@/lib/utils";
import { useHarnessStore } from "@/store/harnessStore";
import { FileView } from "./FileView";

export function PreviewDrawer() {
  const target = useHarnessStore((s) => s.previewTarget);
  const setTarget = useHarnessStore((s) => s.setPreviewTarget);
  const setOpen = useHarnessStore((s) => s.setPreviewOpen);
  const bundle = useExport(target);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [notesOpen, setNotesOpen] = useState(false);

  const files = bundle?.files ?? [];
  const file = files.find((f) => f.path === selectedPath) ?? files[0];
  const unused = bundle?.result.features.filter((f) => f.support.level !== "full") ?? [];
  const noteCount = unused.length + (bundle?.result.notes.length ?? 0);

  return (
    <section aria-label="File preview" className="flex h-[46%] min-h-72 flex-col border-t bg-background shadow-[0_-8px_24px_-12px_rgb(0_0_0/0.15)]">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b px-3 py-2">
        <h2 className="text-sm font-semibold">Preview</h2>
        <Tabs value={target} onValueChange={(v) => setTarget(v as TargetId)}>
          <TabsList>
            {TARGET_ORDER.map((id) => (
              <TabsTrigger key={id} value={id} className="px-2.5">
                {TARGETS[id].name}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        {bundle && (
          <span className="text-xs text-muted-foreground">
            Uses {bundle.result.usedCount} of {bundle.result.totalCount} settings from your diagram
          </span>
        )}
        <Button variant="ghost" size="icon-sm" className="ml-auto" aria-label="Close preview" onClick={() => setOpen(false)}>
          <X />
        </Button>
      </div>

      {!bundle ? (
        <div className="grid flex-1 place-items-center p-6 text-center text-sm text-muted-foreground">
          Add an Agent to see the files it will export.
        </div>
      ) : (
        <>
          {noteCount > 0 && (
            <div className="border-b bg-amber-500/5">
              <button
                type="button"
                onClick={() => setNotesOpen((o) => !o)}
                aria-expanded={notesOpen}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-amber-800 dark:text-amber-300"
              >
                <Info className="size-3.5" />
                {noteCount} {noteCount === 1 ? "thing" : "things"} {TARGETS[target].name} handles differently
                <ChevronDown className={cn("ml-auto size-3.5 transition-transform", notesOpen && "rotate-180")} />
              </button>
              {notesOpen && (
                <ul className="grid max-h-28 gap-1 overflow-y-auto px-3 pb-2 pl-8 text-xs text-muted-foreground">
                  {unused.map((f) => (
                    <li key={f.feature}>
                      <span className="font-medium text-foreground">{f.label}:</span> {f.support.note}
                    </li>
                  ))}
                  {bundle.result.notes.map((n) => (
                    <li key={n.message}>{n.message}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
          <div className="flex min-h-0 flex-1">
            <nav aria-label="Files" className="hidden w-56 shrink-0 overflow-y-auto border-r p-1.5 sm:block">
              {files.map((f) => (
                <button
                  key={f.path}
                  type="button"
                  onClick={() => setSelectedPath(f.path)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left font-mono text-xs transition-colors",
                    f.path === file?.path ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                  )}
                >
                  <FileText className="size-3.5 shrink-0" />
                  <span className="truncate">{f.path}</span>
                </button>
              ))}
            </nav>
            <div className="flex min-w-0 flex-1 flex-col">
              <select
                aria-label="File"
                className="border-b bg-transparent px-3 py-2 font-mono text-xs sm:hidden"
                value={file?.path}
                onChange={(e) => setSelectedPath(e.target.value)}
              >
                {files.map((f) => (
                  <option key={f.path} value={f.path}>
                    {f.path}
                  </option>
                ))}
              </select>
              {file && <FileView file={file} className="flex-1" />}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
