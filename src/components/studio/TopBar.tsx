"use client";

import {
  Ellipsis,
  Eye,
  EyeOff,
  Download,
  LayoutGrid,
  LayoutTemplate,
  Moon,
  Redo2,
  Save,
  Sun,
  Trash2,
  Undo2,
  Upload,
  Workflow,
} from "lucide-react";
import { useTheme } from "next-themes";
import { type ReactNode, useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useCanvasActions } from "@/hooks/useCanvasActions";
import { useDocumentActions } from "@/hooks/useDocumentActions";
import { PRESETS } from "@/lib/harness/presets";
import { useHarnessStore } from "@/store/harnessStore";

function IconAction({
  label,
  shortcut,
  onClick,
  disabled,
  children,
  className,
}: {
  label: string;
  shortcut?: string;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={<Button variant="ghost" size="icon" aria-label={label} onClick={onClick} disabled={disabled} className={className} />}
      >
        {children}
      </TooltipTrigger>
      <TooltipContent>
        {label}
        {shortcut && <kbd className="ml-1.5 font-mono opacity-70">{shortcut}</kbd>}
      </TooltipContent>
    </Tooltip>
  );
}

export function TopBar() {
  const name = useHarnessStore((s) => s.name);
  const setName = useHarnessStore((s) => s.setName);
  const canUndo = useHarnessStore((s) => s.past.length > 0);
  const canRedo = useHarnessStore((s) => s.future.length > 0);
  const hasNodes = useHarnessStore((s) => s.nodes.length > 0);
  const undo = useHarnessStore((s) => s.undo);
  const redo = useHarnessStore((s) => s.redo);
  const applyLayout = useHarnessStore((s) => s.applyLayout);
  const previewOpen = useHarnessStore((s) => s.previewOpen);
  const setPreviewOpen = useHarnessStore((s) => s.setPreviewOpen);
  const setExportOpen = useHarnessStore((s) => s.setExportOpen);
  const { loadPreset, clearBoard, saveDiagram, importDiagram } = useDocumentActions();
  const { fitAll } = useCanvasActions();
  const { resolvedTheme, setTheme } = useTheme();
  const fileInput = useRef<HTMLInputElement>(null);

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b bg-background px-2 sm:px-3">
      <div className="flex items-center gap-2 pr-1">
        <span className="grid size-8 place-items-center rounded-lg bg-indigo-600 text-white shadow-sm">
          <Workflow className="size-4.5" />
        </span>
        <span className="hidden text-sm font-semibold tracking-tight lg:inline">Harness Studio</span>
      </div>
      <span className="hidden h-6 w-px bg-border sm:block" />
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        aria-label="Harness name"
        className="h-8 w-32 min-w-0 rounded-md bg-transparent px-2 text-sm font-medium transition-colors outline-none hover:bg-muted focus:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 sm:w-56"
      />

      <div className="ml-auto flex items-center gap-0.5 sm:gap-1">
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="ghost" className="hidden sm:inline-flex" />}>
            <LayoutTemplate /> Templates
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-72">
            <DropdownMenuGroup>
              <DropdownMenuLabel>Start from a template</DropdownMenuLabel>
              {PRESETS.map((preset) => (
                <DropdownMenuItem key={preset.id} onClick={() => loadPreset(preset)} className="flex-col items-start gap-0.5 py-2">
                  <span className="font-medium">{preset.name}</span>
                  <span className="text-xs text-muted-foreground">{preset.description}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        <IconAction label="Undo" shortcut="⌘Z" onClick={undo} disabled={!canUndo}>
          <Undo2 />
        </IconAction>
        <IconAction label="Redo" shortcut="⇧⌘Z" onClick={redo} disabled={!canRedo}>
          <Redo2 />
        </IconAction>
        <IconAction
          label="Tidy layout"
          onClick={() => {
            applyLayout();
            fitAll();
          }}
          disabled={!hasNodes}
          className="hidden sm:inline-flex"
        >
          <LayoutGrid />
        </IconAction>

        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label="More options" />}>
            <Ellipsis />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuGroup className="sm:hidden">
              <DropdownMenuLabel>Templates</DropdownMenuLabel>
              {PRESETS.map((preset) => (
                <DropdownMenuItem key={preset.id} onClick={() => loadPreset(preset)}>
                  <LayoutTemplate /> {preset.name}
                </DropdownMenuItem>
              ))}
              <DropdownMenuItem
                onClick={() => {
                  applyLayout();
                  fitAll();
                }}
                disabled={!hasNodes}
              >
                <LayoutGrid /> Tidy layout
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </DropdownMenuGroup>
            <DropdownMenuGroup>
              <DropdownMenuItem onClick={() => fileInput.current?.click()}>
                <Upload /> Import diagram…
              </DropdownMenuItem>
              <DropdownMenuItem onClick={saveDiagram} disabled={!hasNodes}>
                <Save /> Save diagram
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}>
                {resolvedTheme === "dark" ? <Sun /> : <Moon />}
                {resolvedTheme === "dark" ? "Light mode" : "Dark mode"}
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={clearBoard} disabled={!hasNodes}>
              <Trash2 /> Clear board
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <input
          ref={fileInput}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void importDiagram(file);
            e.target.value = "";
          }}
        />

        <Button variant={previewOpen ? "secondary" : "outline"} onClick={() => setPreviewOpen(!previewOpen)} aria-pressed={previewOpen} className="ml-1">
          {previewOpen ? <EyeOff /> : <Eye />}
          <span className="hidden sm:inline">Preview</span>
        </Button>
        <Button onClick={() => setExportOpen(true)} className="bg-indigo-600 text-white hover:bg-indigo-600/90">
          <Download />
          Export
        </Button>
      </div>
    </header>
  );
}
