"use client";

import { ReactFlowProvider } from "@xyflow/react";
import { PanelLeftOpen, PanelRightOpen, Plus } from "lucide-react";
import { useEffect } from "react";
import { Canvas } from "@/components/canvas/Canvas";
import { Palette, PaletteList } from "@/components/canvas/Palette";
import { ExportDialog } from "@/components/export/ExportDialog";
import { Inspector, InspectorContent } from "@/components/inspector/Inspector";
import { TryDock, TryLauncher, TryPanel } from "@/components/inspector/TryPanel";
import { PreviewDrawer } from "@/components/preview/PreviewDrawer";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { cn } from "@/lib/utils";
import { useHarnessStore } from "@/store/harnessStore";
import { TopBar } from "./TopBar";

const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));

function useKeyboardShortcuts() {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey;
      if (!mod || isTyping(event.target)) return;
      const state = useHarnessStore.getState();
      if (state.exportOpen) return;
      const key = event.key.toLowerCase();
      if (key === "z" && !event.shiftKey) {
        event.preventDefault();
        state.undo();
      } else if ((key === "z" && event.shiftKey) || key === "y") {
        event.preventDefault();
        state.redo();
      } else if (key === "d") {
        event.preventDefault();
        state.duplicateSelection();
      } else if (key === "a") {
        event.preventDefault();
        state.selectAll();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}

function MobilePalette() {
  const open = useHarnessStore((s) => s.paletteOpen);
  const setOpen = useHarnessStore((s) => s.setPaletteOpen);
  return (
    <>
      <Button
        size="icon-lg"
        aria-label="Add a part"
        onClick={() => setOpen(true)}
        className="absolute right-4 bottom-4 z-10 size-12 rounded-full bg-indigo-600 text-white shadow-lg hover:bg-indigo-600/90 md:hidden"
      >
        <Plus className="size-5" />
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="max-h-[75dvh] gap-0 rounded-t-2xl">
          <SheetHeader className="pb-0">
            <SheetTitle>Add a part</SheetTitle>
            <SheetDescription>Tap to add. To add parts that connect automatically, tap an agent and use &ldquo;Add to this agent&rdquo;.</SheetDescription>
          </SheetHeader>
          <PaletteList compact onAdded={() => setOpen(false)} />
        </SheetContent>
      </Sheet>
    </>
  );
}

function MobileInspector() {
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const selectedCount = useHarnessStore((s) => s.nodes.filter((n) => n.selected).length);
  const exportOpen = useHarnessStore((s) => s.exportOpen);
  const selectOnly = useHarnessStore((s) => s.selectOnly);
  const tab = useHarnessStore((s) => s.rightTab);
  const setTab = useHarnessStore((s) => s.setRightTab);
  const open = !isDesktop && !exportOpen && (selectedCount > 0 || tab === "try");
  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (next) return;
        setTab("inspect");
        selectOnly(null);
      }}
    >
      <SheetContent side="bottom" className="flex h-[85dvh] max-h-[85dvh] flex-col gap-0 overflow-hidden rounded-t-2xl" showCloseButton>
        <SheetTitle className={tab === "try" ? "px-4 pt-4 text-sm font-semibold" : "sr-only"}>{tab === "try" ? "Test your harness" : "Card settings"}</SheetTitle>
        <SheetDescription className="sr-only">{tab === "try" ? "Chat with your harness next to the plain model." : "Edit the selected card."}</SheetDescription>
        <div className={cn("flex min-h-0 flex-1 flex-col overflow-hidden", tab === "try" ? "pt-2" : "pt-8")}>
          {tab === "try" ? <TryPanel stacked /> : <div className="h-full overflow-y-auto"><InspectorContent /></div>}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function PartsToggle() {
  const open = useHarnessStore((s) => s.partsPanelOpen);
  const setOpen = useHarnessStore((s) => s.setPartsPanelOpen);
  if (open) return null;
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Open parts"
            aria-expanded={false}
            aria-controls="parts"
            onClick={() => setOpen(true)}
            className="absolute top-8 left-3 z-10 hidden bg-background shadow-sm md:inline-flex"
          />
        }
      >
        <PanelLeftOpen />
      </TooltipTrigger>
      <TooltipContent>Show parts</TooltipContent>
    </Tooltip>
  );
}

function InspectorToggle() {
  const open = useHarnessStore((s) => s.inspectorOpen || s.rightTab === "try");
  const setOpen = useHarnessStore((s) => s.setInspectorOpen);
  if (open) return null;
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Open inspector"
            aria-expanded={false}
            aria-controls="inspector"
            onClick={() => setOpen(true)}
            className="absolute top-8 right-3 z-10 hidden bg-background shadow-sm lg:inline-flex"
          />
        }
      >
        <PanelRightOpen />
      </TooltipTrigger>
      <TooltipContent>Show inspector</TooltipContent>
    </Tooltip>
  );
}

export function Studio() {
  useKeyboardShortcuts();
  const previewOpen = useHarnessStore((s) => s.previewOpen);
  const partsPanelOpen = useHarnessStore((s) => s.partsPanelOpen);
  const inspectorOpen = useHarnessStore((s) => s.inspectorOpen);
  const tryOpen = useHarnessStore((s) => s.rightTab === "try");

  return (
    <ReactFlowProvider>
      <div className="flex h-dvh flex-col overflow-hidden bg-background">
        <TopBar />
        <div className="flex min-h-0 flex-1">
          {partsPanelOpen && <Palette className="hidden md:flex" />}
          <main className="relative flex min-w-0 flex-1 flex-col">
            <div className="relative min-h-0 flex-1">
              <Canvas />
              <MobilePalette />
              <PartsToggle />
              <InspectorToggle />
              <TryLauncher />
            </div>
            {previewOpen && <PreviewDrawer />}
          </main>
          {tryOpen ? <TryDock className="hidden lg:flex" /> : inspectorOpen && <Inspector className="hidden lg:flex" />}
        </div>
        <MobileInspector />
        <ExportDialog />
      </div>
    </ReactFlowProvider>
  );
}
