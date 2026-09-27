"use client";

import { Check, Copy } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { copyText } from "@/lib/download";

export function CopyButton({
  text,
  label = "Copy",
  showLabel = false,
  className,
}: {
  text: string;
  label?: string;
  showLabel?: boolean;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1500);
    return () => window.clearTimeout(timer);
  }, [copied]);

  return (
    <Button
      type="button"
      variant="ghost"
      size={showLabel ? "sm" : "icon-sm"}
      aria-label={label}
      className={className}
      onClick={async () => {
        if (await copyText(text)) setCopied(true);
        else toast.error("Couldn't copy. Select the text and copy it manually.");
      }}
    >
      {copied ? <Check className="text-emerald-600" /> : <Copy />}
      {showLabel && (copied ? "Copied" : label)}
    </Button>
  );
}
