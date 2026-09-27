"use client";

import { type ReactNode, useId, useState } from "react";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export function Field({
  label,
  hint,
  children,
  htmlFor,
  action,
}: {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
  htmlFor?: string;
  action?: ReactNode;
}) {
  return (
    <div className="grid gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={htmlFor} className="text-xs font-medium">
          {label}
        </Label>
        {action}
      </div>
      {children}
      {hint && <p className="text-xs leading-snug text-muted-foreground">{hint}</p>}
    </div>
  );
}

const parseLines = (text: string) =>
  text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

/** A textarea edited as one item per line, stored as a string array. */
export function ListField({
  label,
  hint,
  value,
  onChange,
  placeholder,
  mono = true,
  rows = 3,
}: {
  label: string;
  hint?: ReactNode;
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  mono?: boolean;
  rows?: number;
}) {
  const id = useId();
  const [text, setText] = useState(value.join("\n"));
  const [synced, setSynced] = useState(value);

  if (synced !== value) {
    setSynced(value);
    if (JSON.stringify(parseLines(text)) !== JSON.stringify(value)) setText(value.join("\n"));
  }

  return (
    <Field label={label} hint={hint} htmlFor={id}>
      <Textarea
        id={id}
        value={text}
        rows={rows}
        placeholder={placeholder}
        spellCheck={false}
        onChange={(e) => {
          setText(e.target.value);
          onChange(parseLines(e.target.value));
        }}
        className={cn("min-h-0 resize-y text-sm", mono && "font-mono text-[13px]")}
      />
    </Field>
  );
}

/** Radio-style button group for a handful of options. */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string; activeClass?: string }[];
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="grid auto-cols-fr grid-flow-col gap-1 rounded-lg bg-muted p-1">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.value)}
            className={cn(
              "rounded-md px-2 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
              active ? cn("bg-background text-foreground shadow-sm", option.activeClass) : "text-muted-foreground hover:text-foreground",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
