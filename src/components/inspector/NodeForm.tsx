"use client";

import { useId } from "react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  HOOK_EVENT_LABELS,
  HOOK_SCOPE_LABELS,
  isToolEvent,
  MODEL_SUGGESTIONS,
  PROVIDER_LABELS,
  REASONING_LABELS,
  TOOL_LABELS,
} from "@/lib/harness/kinds";
import type { HarnessNode, KindDataMap, NodeKind } from "@/lib/harness/types";
import { cn } from "@/lib/utils";
import { useHarnessStore } from "@/store/harnessStore";
import { Field, ListField, Segmented } from "./fields";

function SimpleSelect<T extends string>({
  id,
  label,
  value,
  onChange,
  options,
}: {
  id?: string;
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: Record<T, string>;
}) {
  const items = (Object.entries(options) as [T, string][]).map(([v, l]) => ({ value: v, label: l }));
  return (
    <Select value={value} onValueChange={(next) => next && onChange(next as T)} items={items}>
      <SelectTrigger id={id} aria-label={label} className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function SwitchRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border p-3">
      <label htmlFor={id} className="grid gap-0.5">
        <span className="text-sm font-medium">{label}</span>
        {description && <span className="text-xs text-muted-foreground">{description}</span>}
      </label>
      <Switch id={id} checked={checked} onCheckedChange={onChange} className="mt-0.5" />
    </div>
  );
}

function useUpdate<K extends NodeKind>(id: string) {
  const updateConfig = useHarnessStore((s) => s.updateConfig);
  return (patch: Partial<KindDataMap[K]>) => updateConfig<K>(id, patch);
}

function AgentForm({ id, config, isSubagent }: { id: string; config: KindDataMap["agent"]; isSubagent: boolean }) {
  const update = useUpdate<"agent">(id);
  const nameId = useId();
  const descId = useId();
  return (
    <>
      <Field label="Name" htmlFor={nameId}>
        <Input id={nameId} value={config.name} onChange={(e) => update({ name: e.target.value })} placeholder="PR Reviewer" />
      </Field>
      <Field
        label={isSubagent ? "When should it be used?" : "What is it for?"}
        htmlFor={descId}
        hint={
          isSubagent
            ? "The main agent reads this to decide when to hand work over, so be specific."
            : "A short summary that appears at the top of the exported instructions."
        }
      >
        <Textarea
          id={descId}
          value={config.description}
          rows={3}
          onChange={(e) => update({ description: e.target.value })}
          placeholder={isSubagent ? "Checks changes for security issues like injection and leaked secrets." : "Reviews pull requests for bugs and missing tests."}
        />
      </Field>
    </>
  );
}

function ModelForm({ id, config }: { id: string; config: KindDataMap["model"] }) {
  const update = useUpdate<"model">(id);
  const providerId = useId();
  const modelId = useId();
  const tokensId = useId();
  const reasoningId = useId();
  const suggestions = MODEL_SUGGESTIONS[config.provider];
  return (
    <>
      <Field label="Provider" htmlFor={providerId} hint="Claude Code runs Anthropic models; Codex runs OpenAI models.">
        <SimpleSelect
          id={providerId}
          label="Provider"
          value={config.provider}
          options={PROVIDER_LABELS}
          onChange={(provider) =>
            update({ provider, modelId: MODEL_SUGGESTIONS[provider][0] ?? config.modelId })
          }
        />
      </Field>
      <Field label="Model" htmlFor={modelId}>
        <Input
          id={modelId}
          value={config.modelId}
          onChange={(e) => update({ modelId: e.target.value })}
          placeholder="Model name"
          className="font-mono text-[13px]"
          spellCheck={false}
        />
        {suggestions.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {suggestions.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => update({ modelId: s })}
                className={cn(
                  "rounded-md border px-2 py-0.5 font-mono text-xs transition-colors hover:bg-muted",
                  config.modelId === s && "border-foreground/30 bg-muted",
                )}
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </Field>
      <Field label="Reasoning effort" htmlFor={reasoningId} hint="How long the model thinks before answering. Higher is slower but more careful.">
        <SimpleSelect
          id={reasoningId}
          label="Reasoning effort"
          value={config.reasoningEffort}
          options={REASONING_LABELS}
          onChange={(reasoningEffort) => update({ reasoningEffort })}
        />
      </Field>
      <div className="grid gap-2">
        <SwitchRow
          label="Set temperature"
          description="Lower is more focused, higher is more creative."
          checked={config.temperature !== null}
          onChange={(on) => update({ temperature: on ? 0.2 : null })}
        />
        {config.temperature !== null && (
          <div className="flex items-center gap-3 px-1">
            <Slider
              value={[config.temperature]}
              min={0}
              max={1}
              step={0.05}
              aria-label="Temperature"
              onValueChange={(v) => update({ temperature: Array.isArray(v) ? v[0] : v })}
            />
            <span className="w-10 text-right font-mono text-sm tabular-nums">{config.temperature.toFixed(2)}</span>
          </div>
        )}
      </div>
      <Field label="Max output tokens" htmlFor={tokensId} hint="Leave empty to use the tool's default.">
        <Input
          id={tokensId}
          type="number"
          min={1}
          inputMode="numeric"
          value={config.maxOutputTokens ?? ""}
          placeholder="Default"
          onChange={(e) => {
            const n = Number.parseInt(e.target.value, 10);
            update({ maxOutputTokens: Number.isFinite(n) && n > 0 ? n : null });
          }}
        />
      </Field>
    </>
  );
}

function PromptForm({ id, config }: { id: string; config: KindDataMap["prompt"] }) {
  const update = useUpdate<"prompt">(id);
  const titleId = useId();
  const contentId = useId();
  return (
    <>
      <Field label="Title" htmlFor={titleId}>
        <Input id={titleId} value={config.title} onChange={(e) => update({ title: e.target.value })} />
      </Field>
      <Field
        label="Instructions"
        htmlFor={contentId}
        hint="Written in plain language. Markdown works. Tell the agent what to do, how to do it, and what to avoid."
      >
        <Textarea
          id={contentId}
          value={config.content}
          rows={14}
          onChange={(e) => update({ content: e.target.value })}
          placeholder={"You review code changes.\n\nLook for bugs, security issues and missing tests. Explain each finding with the file, line and a suggested fix."}
          className="min-h-48 text-sm leading-relaxed"
        />
      </Field>
    </>
  );
}

function ToolForm({ id, config }: { id: string; config: KindDataMap["tool"] }) {
  const update = useUpdate<"tool">(id);
  const toolId = useId();
  return (
    <>
      <Field label="Tool" htmlFor={toolId}>
        <SimpleSelect id={toolId} label="Tool" value={config.tool} options={TOOL_LABELS} onChange={(tool) => update({ tool })} />
      </Field>
      <Field
        label="Access"
        hint={
          config.mode === "allow"
            ? "The agent uses this tool without asking."
            : config.mode === "ask"
              ? "The agent asks you before each use."
              : "The agent can't use this tool."
        }
      >
        <Segmented
          label="Access"
          value={config.mode}
          onChange={(mode) => update({ mode })}
          options={[
            { value: "allow", label: "Allow", activeClass: "text-emerald-700 dark:text-emerald-300" },
            { value: "ask", label: "Ask first", activeClass: "text-amber-700 dark:text-amber-300" },
            { value: "deny", label: "Deny", activeClass: "text-rose-700 dark:text-rose-300" },
          ]}
        />
      </Field>
    </>
  );
}

function McpForm({ id, config }: { id: string; config: KindDataMap["mcp"] }) {
  const update = useUpdate<"mcp">(id);
  const nameId = useId();
  const cmdId = useId();
  const urlId = useId();
  const tokenId = useId();
  return (
    <>
      <Field label="Name" htmlFor={nameId} hint="A short id, like github or linear.">
        <Input id={nameId} value={config.name} onChange={(e) => update({ name: e.target.value })} placeholder="github" className="font-mono text-[13px]" spellCheck={false} />
      </Field>
      <Field label="How it runs">
        <Segmented
          label="How it runs"
          value={config.transport}
          onChange={(transport) => update({ transport })}
          options={[
            { value: "stdio", label: "Local command" },
            { value: "http", label: "Remote URL" },
          ]}
        />
      </Field>
      {config.transport === "stdio" ? (
        <>
          <Field label="Command" htmlFor={cmdId} hint="The program that starts the server.">
            <Input id={cmdId} value={config.command} onChange={(e) => update({ command: e.target.value })} placeholder="npx" className="font-mono text-[13px]" spellCheck={false} />
          </Field>
          <ListField
            label="Arguments"
            hint="One per line."
            value={config.args}
            onChange={(args) => update({ args })}
            placeholder={"-y\n@modelcontextprotocol/server-github"}
          />
          <ListField
            label="Secrets it needs"
            hint="Environment variable names only, one per line. Real values stay on your computer; the files only mention the names."
            value={config.envVars}
            onChange={(envVars) => update({ envVars })}
            placeholder="GITHUB_PERSONAL_ACCESS_TOKEN"
            rows={2}
          />
        </>
      ) : (
        <>
          <Field label="Server URL" htmlFor={urlId}>
            <Input id={urlId} value={config.url} onChange={(e) => update({ url: e.target.value })} placeholder="https://mcp.example.com/mcp" className="font-mono text-[13px]" spellCheck={false} />
          </Field>
          <Field label="Token variable (optional)" htmlFor={tokenId} hint="The environment variable holding the access token. Sent as a Bearer token.">
            <Input id={tokenId} value={config.authTokenEnvVar} onChange={(e) => update({ authTokenEnvVar: e.target.value })} placeholder="EXAMPLE_API_TOKEN" className="font-mono text-[13px]" spellCheck={false} />
          </Field>
        </>
      )}
    </>
  );
}

function RuleForm({ id, config }: { id: string; config: KindDataMap["rule"] }) {
  const update = useUpdate<"rule">(id);
  const nameId = useId();
  const descId = useId();
  const contentId = useId();
  return (
    <>
      <Field label="Name" htmlFor={nameId}>
        <Input id={nameId} value={config.name} onChange={(e) => update({ name: e.target.value })} placeholder="TypeScript style" />
      </Field>
      <Field label="Description" htmlFor={descId} hint="When this rule matters. Some tools use it to decide when to apply the rule.">
        <Input id={descId} value={config.description} onChange={(e) => update({ description: e.target.value })} placeholder="Conventions for TypeScript files" />
      </Field>
      <SwitchRow
        label="Always apply"
        description="Turn off to apply this rule only to certain files."
        checked={config.alwaysApply}
        onChange={(alwaysApply) => update({ alwaysApply })}
      />
      {!config.alwaysApply && (
        <ListField
          label="Files it applies to"
          hint="File patterns, one per line. ** matches any folder."
          value={config.globs}
          onChange={(globs) => update({ globs })}
          placeholder={"**/*.ts\n**/*.tsx"}
          rows={2}
        />
      )}
      <Field label="Rule" htmlFor={contentId}>
        <Textarea
          id={contentId}
          value={config.content}
          rows={8}
          onChange={(e) => update({ content: e.target.value })}
          placeholder="Prefer named exports. Avoid any. Use early returns."
          className="text-sm leading-relaxed"
        />
      </Field>
    </>
  );
}

function PolicyForm({ id, config }: { id: string; config: KindDataMap["policy"] }) {
  const update = useUpdate<"policy">(id);
  const nameId = useId();
  return (
    <>
      <Field label="Name" htmlFor={nameId}>
        <Input id={nameId} value={config.name} onChange={(e) => update({ name: e.target.value })} />
      </Field>
      <ListField
        label="Commands it may run without asking"
        hint="One per line. Use * as a wildcard, like git diff *."
        value={config.allowCommands}
        onChange={(allowCommands) => update({ allowCommands })}
        placeholder={"npm test\ngit diff *"}
      />
      <ListField
        label="Commands it must never run"
        value={config.denyCommands}
        onChange={(denyCommands) => update({ denyCommands })}
        placeholder={"rm -rf *\ngit push --force *"}
      />
      <SwitchRow
        label="Allow network access"
        description="Turn off to stop the agent fetching from the internet."
        checked={config.allowNetwork}
        onChange={(allowNetwork) => update({ allowNetwork })}
      />
      {config.allowNetwork && (
        <ListField
          label="Websites it may fetch without asking (optional)"
          hint="Domains, one per line."
          value={config.allowedDomains}
          onChange={(allowedDomains) => update({ allowedDomains })}
          placeholder={"docs.github.com\nnodejs.org"}
          rows={2}
        />
      )}
    </>
  );
}

function HookForm({ id, config }: { id: string; config: KindDataMap["hook"] }) {
  const update = useUpdate<"hook">(id);
  const nameId = useId();
  const eventId = useId();
  const cmdId = useId();
  return (
    <>
      <Field label="Name" htmlFor={nameId}>
        <Input id={nameId} value={config.name} onChange={(e) => update({ name: e.target.value })} placeholder="Lint after edits" />
      </Field>
      <Field label="When it runs" htmlFor={eventId}>
        <SimpleSelect id={eventId} label="When it runs" value={config.event} options={HOOK_EVENT_LABELS} onChange={(event) => update({ event })} />
      </Field>
      {isToolEvent(config.event) && (
        <Field label="For which tools">
          <Segmented
            label="For which tools"
            value={config.scope}
            onChange={(scope) => update({ scope })}
            options={(Object.entries(HOOK_SCOPE_LABELS) as [KindDataMap["hook"]["scope"], string][]).map(([value, label]) => ({ value, label }))}
          />
        </Field>
      )}
      <Field label="Command" htmlFor={cmdId} hint="Runs in your project folder, like a terminal command.">
        <Input id={cmdId} value={config.command} onChange={(e) => update({ command: e.target.value })} placeholder="npm run lint" className="font-mono text-[13px]" spellCheck={false} />
      </Field>
    </>
  );
}

export function NodeForm({ node, isSubagent }: { node: HarnessNode; isSubagent: boolean }) {
  const { id, data } = node;
  switch (data.kind) {
    case "agent":
      return <AgentForm id={id} config={data.config} isSubagent={isSubagent} />;
    case "model":
      return <ModelForm id={id} config={data.config} />;
    case "prompt":
      return <PromptForm id={id} config={data.config} />;
    case "tool":
      return <ToolForm id={id} config={data.config} />;
    case "mcp":
      return <McpForm id={id} config={data.config} />;
    case "rule":
      return <RuleForm id={id} config={data.config} />;
    case "policy":
      return <PolicyForm id={id} config={data.config} />;
    case "hook":
      return <HookForm id={id} config={data.config} />;
  }
}
