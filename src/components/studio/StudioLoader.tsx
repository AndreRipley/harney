"use client";

import dynamic from "next/dynamic";

function StudioSkeleton() {
  return (
    <div className="flex h-dvh flex-col" aria-busy="true" aria-label="Loading Harness Studio">
      <div className="flex h-14 items-center gap-3 border-b px-3">
        <div className="size-8 animate-pulse rounded-lg bg-muted" />
        <div className="h-4 w-40 animate-pulse rounded bg-muted" />
        <div className="ml-auto h-8 w-40 animate-pulse rounded-lg bg-muted" />
      </div>
      <div className="flex flex-1">
        <div className="hidden w-64 space-y-2 border-r p-3 md:block">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
        <div className="flex-1 bg-[radial-gradient(circle,var(--border)_1px,transparent_1px)] [background-size:16px_16px]" />
        <div className="hidden w-80 border-l lg:block" />
      </div>
    </div>
  );
}

/** The studio reads saved work from the browser, so it renders on the client only. */
export const StudioLoader = dynamic(() => import("./Studio").then((m) => m.Studio), {
  ssr: false,
  loading: StudioSkeleton,
});
