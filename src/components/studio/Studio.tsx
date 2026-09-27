"use client";

import { ReactFlowProvider } from "@xyflow/react";
import { Plus } from "lucide-react";
import { useEffect } from "react";
import { Canvas } from "@/components/canvas/Canvas";
import { Palette, PaletteList } from "@/components/canvas/Palette";
import { ExportDialog } from "@/components/export/ExportDialog";
import { Inspector, InspectorContent } from "@/components/inspector/Inspector";
import { PreviewDrawer } from "@/components/preview/PreviewDrawer";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useMediaQuery } from "@/hooks/useMediaQuery";
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
  const open = !isDesktop && selectedCount > 0 && !exportOpen;
  return (
    <Sheet open={open} onOpenChange={(next) => !next && selectOnly(null)}>
      <SheetContent side="bottom" className="max-h-[80dvh] gap-0 overflow-y-auto rounded-t-2xl" showCloseButton>
        <SheetTitle className="sr-only">Card settings</SheetTitle>
        <SheetDescription className="sr-only">Edit the selected card.</SheetDescription>
        <div className="pt-8">
          <InspectorContent />
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function Studio() {
  useKeyboardShortcuts();
  const previewOpen = useHarnessStore((s) => s.previewOpen);

  return (
    <ReactFlowProvider>
      <div className="flex h-dvh flex-col overflow-hidden bg-background">
        <TopBar />
        <div className="flex min-h-0 flex-1">
          <Palette className="hidden md:flex" />
          <main className="relative flex min-w-0 flex-1 flex-col">
            <div className="relative min-h-0 flex-1">
              <Canvas />
              <MobilePalette />
            </div>
            {previewOpen && <PreviewDrawer />}
          </main>
          <Inspector className="hidden lg:flex" />
        </div>
        <MobileInspector />
        <ExportDialog />
      </div>
    </ReactFlowProvider>
  );
}
