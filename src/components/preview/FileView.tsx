"use client";

import type { ExportFile } from "@/lib/harness/types";
import { cn } from "@/lib/utils";
import { CopyButton } from "./CopyButton";

export function FileView({ file, className }: { file: ExportFile; className?: string }) {
  const lines = file.content.replace(/\n$/, "").split("\n");
  return (
    <div className={cn("flex min-h-0 min-w-0 flex-col", className)}>
      <div className="flex items-center gap-2 border-b px-3 py-1.5">
        <span className="truncate font-mono text-xs font-medium">{file.path}</span>
        <span className="hidden truncate text-xs text-muted-foreground md:inline">{file.description}</span>
        <CopyButton text={file.content} label={`Copy ${file.path}`} className="ml-auto" />
      </div>
      <div className="min-h-0 flex-1 overflow-auto bg-muted/30">
        <pre className="py-2 font-mono text-[12.5px] leading-5">
          <code>
            {lines.map((line, index) => (
              <div key={index} className="flex">
                <span aria-hidden className="w-10 shrink-0 select-none pr-3 text-right text-muted-foreground/60 tabular-nums">
                  {index + 1}
                </span>
                <span className="whitespace-pre pr-4">{line || " "}</span>
              </div>
            ))}
          </code>
        </pre>
      </div>
    </div>
  );
}
