"use client";

import {
  ExternalLink,
  File,
  Folder,
  FolderTree,
  KeyRound,
  MessageSquareText,
  PackageCheck,
  Rocket,
  TriangleAlert,
} from "lucide-react";
import { Fragment, type ReactNode } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { CopyButton } from "@/components/preview/CopyButton";
import type { SetupStep, SetupStepKind } from "@/lib/harness/setupGuide";
import type { ExportFile } from "@/lib/harness/types";
import { cn } from "@/lib/utils";

const STEP_ICONS: Record<SetupStepKind, typeof File> = {
  files: FolderTree,
  warning: TriangleAlert,
  secrets: KeyRound,
  install: PackageCheck,
  launch: Rocket,
  try: MessageSquareText,
};

const CODE_PATTERN = /(\.[\w-]+\/[\w./*-]*|\b[\w-]+\.(?:md|json|toml|mdc|rules)\b|(?<![\w/])\/[a-z]+\b|@[\w-]+|~\/\.[\w]+)/g;

/** Plain text with file names, slash commands and mentions shown as code. */
export function RichText({ text }: { text: string }) {
  const parts = text.split(CODE_PATTERN);
  return (
    <>
      {parts.map((part, index) =>
        index % 2 === 1 ? (
          <code key={index} className="rounded bg-muted px-1 py-px font-mono text-[0.85em] text-foreground">
            {part}
          </code>
        ) : (
          <Fragment key={index}>{part}</Fragment>
        ),
      )}
    </>
  );
}

export function CommandBlock({ lines, prompt = true }: { lines: string[]; prompt?: boolean }) {
  return (
    <div className="relative rounded-lg bg-zinc-950 py-2.5 pr-10 pl-3 text-zinc-100 dark:bg-black/60 dark:ring-1 dark:ring-white/10">
      <pre className="overflow-x-auto font-mono text-[12.5px] leading-6 whitespace-pre-wrap">
        {lines.map((line) => (
          <div key={line}>
            {prompt && <span className="mr-2 select-none text-zinc-500">$</span>}
            {line}
          </div>
        ))}
      </pre>
      <CopyButton
        text={lines.join("\n")}
        label="Copy command"
        className="absolute top-1.5 right-1.5 text-zinc-400 hover:bg-white/10 hover:text-white"
      />
    </div>
  );
}

interface TreeNode {
  name: string;
  file?: ExportFile;
  children: Map<string, TreeNode>;
}

function buildTree(files: ExportFile[]): TreeNode {
  const root: TreeNode = { name: "", children: new Map() };
  for (const file of files) {
    const segments = file.path.split("/");
    let cursor = root;
    segments.forEach((segment, index) => {
      if (!cursor.children.has(segment)) cursor.children.set(segment, { name: segment, children: new Map() });
      cursor = cursor.children.get(segment)!;
      if (index === segments.length - 1) cursor.file = file;
    });
  }
  return root;
}

function TreeRows({ node, depth }: { node: TreeNode; depth: number }): ReactNode {
  const entries = [...node.children.values()].sort((a, b) => Number(Boolean(a.file)) - Number(Boolean(b.file)));
  return entries.map((child) => (
    <Fragment key={`${depth}-${child.name}`}>
      <li className="flex items-start gap-2 py-1.5 pr-1" style={{ paddingLeft: depth * 18 + 8 }}>
        {child.file ? (
          <File className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        ) : (
          <Folder className="mt-0.5 size-4 shrink-0 text-sky-600 dark:text-sky-400" />
        )}
        <div className="min-w-0 flex-1">
          <div className="font-mono text-[13px] font-medium">
            {child.name}
            {!child.file && "/"}
          </div>
          {child.file && <div className="text-xs leading-snug text-muted-foreground">{child.file.description}</div>}
        </div>
        {child.file && <CopyButton text={child.file.content} label={`Copy ${child.file.path}`} />}
      </li>
      {!child.file && <TreeRows node={child} depth={depth + 1} />}
    </Fragment>
  ));
}

export function FileTree({ files }: { files: ExportFile[] }) {
  return (
    <div className="rounded-lg border bg-card">
      <div className="flex items-center gap-2 border-b px-3 py-2 text-xs font-medium text-muted-foreground">
        <Folder className="size-3.5" /> your-project/
      </div>
      <ul className="divide-y divide-border/60 py-0.5">
        <TreeRows node={buildTree(files)} depth={0} />
      </ul>
    </div>
  );
}

export function SetupGuide({
  steps,
  files,
  done,
  onToggle,
}: {
  steps: SetupStep[];
  files: ExportFile[];
  done: Set<string>;
  onToggle: (id: string) => void;
}) {
  const numbers = new Map<string, number>();
  for (const step of steps) if (step.kind !== "warning") numbers.set(step.id, numbers.size + 1);
  return (
    <ol className="grid gap-3">
      {steps.map((step) => {
        const isWarning = step.kind === "warning";
        const isDone = done.has(step.id);
        const Icon = STEP_ICONS[step.kind];
        return (
          <li
            key={step.id}
            className={cn(
              "rounded-xl border p-4 transition-colors",
              isWarning ? "border-amber-500/30 bg-amber-500/5" : "bg-card",
              isDone && "bg-muted/40",
            )}
          >
            <div className="flex items-start gap-3">
              {isWarning ? (
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300">
                  <Icon className="size-4" />
                </span>
              ) : (
                <span
                  className={cn(
                    "grid size-7 shrink-0 place-items-center rounded-full text-sm font-semibold",
                    isDone ? "bg-emerald-500 text-white" : "bg-foreground text-background",
                  )}
                >
                  {numbers.get(step.id)}
                </span>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  {!isWarning && <Icon className="size-4 text-muted-foreground" aria-hidden />}
                  <h3 className={cn("text-sm font-semibold", isDone && "text-muted-foreground line-through decoration-muted-foreground/40")}>
                    {step.title}
                  </h3>
                  {!isWarning && (
                    <label className="ml-auto flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                      <Checkbox checked={isDone} onCheckedChange={() => onToggle(step.id)} aria-label={`Mark "${step.title}" as done`} />
                      Done
                    </label>
                  )}
                </div>

                <div className={cn("mt-2 grid gap-3", isDone && "opacity-60")}>
                  {step.body.map((paragraph) => (
                    <p key={paragraph} className="text-sm leading-relaxed text-muted-foreground">
                      <RichText text={paragraph} />
                    </p>
                  ))}

                  {step.kind === "files" && <FileTree files={files} />}

                  {step.kind === "secrets" && step.items && (
                    <ul className="grid gap-1.5">
                      {step.items.map((item) => (
                        <li key={item.name} className="flex flex-wrap items-baseline gap-x-2 text-sm">
                          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[12.5px] font-medium">{item.name}</code>
                          <span className="text-muted-foreground">{item.detail}</span>
                        </li>
                      ))}
                    </ul>
                  )}

                  {step.kind === "install" && step.items && (
                    <ul className="grid gap-2 sm:grid-cols-2">
                      {step.items.map((item) => (
                        <li key={item.name}>
                          <a
                            href={item.href}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-start gap-2 rounded-lg border p-2.5 transition-colors hover:bg-muted"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="text-sm font-medium">{item.name}</div>
                              <div className="text-xs text-muted-foreground">{item.detail}</div>
                            </div>
                            <ExternalLink className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                          </a>
                        </li>
                      ))}
                    </ul>
                  )}

                  {step.commands && step.commands.length > 0 && (
                    <CommandBlock lines={step.commands} prompt={step.kind !== "try"} />
                  )}
                </div>
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
