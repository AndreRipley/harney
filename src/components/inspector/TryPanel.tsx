"use client";

import { Check, Circle, MessagesSquare, Paperclip, Plus, RotateCcw, Square, X } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useCanvasActions } from "@/hooks/useCanvasActions";
import { PROVIDER_LABELS } from "@/lib/harness/kinds";
import { changeSummary, harnessEffects, requiredKeys, starterPrompts } from "@/lib/harness/play";
import { type ModelMessage, type PlayStep, plainReply, rehearse } from "@/lib/harness/playRun";
import { harnessMetrics, sessionNote, wrapUntrusted } from "@/lib/harness/runtime";
import { EMPTY_KEYS, keyField, keyProblem, loadTryKeys, saveTryKeys, type TryKeys } from "@/lib/harness/tryKeys";
import type { HarnessConfig, Provider } from "@/lib/harness/types";
import { cn } from "@/lib/utils";
import { type PlayTurn, useCompiled, useHarnessStore } from "@/store/harnessStore";

type ApiProvider = Exclude<Provider, "other">;
type Needs = ReturnType<typeof requiredKeys>;

const NO_CHANGE = "Your harness didn't change anything here. Try a message your prompt or permissions should affect.";

const TONE = {
  neutral: "border-border bg-muted/60",
  allow: "border-emerald-500/30 bg-emerald-500/10",
  ask: "border-amber-500/40 bg-amber-500/10",
  deny: "border-destructive/30 bg-destructive/10",
};

const errorText = (err: unknown) => (err instanceof Error ? err.message : "The request failed.");

function StepList({ steps, onFocus, onDecide }: { steps: PlayStep[]; onFocus: (step: PlayStep) => void; onDecide: (id: string, choice: "approve" | "deny") => void }) {
  return (
    <ul className="grid gap-1.5">
      {steps.map((step) => (
        <li key={step.id}>
          <button
            type="button"
            onClick={() => step.nodeId && onFocus(step)}
            className={cn("w-full rounded-md border px-2 py-1.5 text-left", TONE[step.tone])}
          >
            <div className="text-xs font-medium">{step.title}</div>
            {step.requested && (
              <div className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                <span className="font-medium text-foreground">Requested. </span>
                {step.requested}
              </div>
            )}
            {step.result && (
              <div className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                <span className="font-medium text-foreground">Result. </span>
                {step.result}
              </div>
            )}
            {step.detail && <div className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{step.detail}</div>}
          </button>
          {step.pending && (
            <div className="mt-1 flex gap-1.5">
              <Button size="sm" variant="outline" onClick={() => onDecide(step.id, "approve")}>
                Approve
              </Button>
              <Button size="sm" variant="outline" onClick={() => onDecide(step.id, "deny")}>
                Deny
              </Button>
            </div>
          )}
          {step.children && step.children.length > 0 && (
            <div className="mt-1.5 ml-3 border-l pl-2">
              <StepList steps={step.children} onFocus={onFocus} onDecide={onDecide} />
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

function KeyField({ id, value, onChange }: { id: ApiProvider | "jev"; value: string; onChange: (value: string) => void }) {
  const field = keyField(id);
  return (
    <label className="grid gap-1 text-[11px] font-medium">
      {field.label}
      <Input type="password" value={value} placeholder={field.placeholder} autoComplete="off" onChange={(event) => onChange(event.target.value)} className="h-8 font-mono text-xs" />
    </label>
  );
}

function SetupRow({ done, optional, label, detail, children }: { done: boolean; optional?: boolean; label: string; detail: string; children?: ReactNode }) {
  const Icon = done ? Check : Circle;
  return (
    <li className="flex gap-2.5">
      <Icon className={cn("mt-0.5 size-4 shrink-0", done ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground")} aria-hidden />
      <div className="grid min-w-0 flex-1 gap-1.5">
        <div>
          <div className="text-sm font-medium">
            {label}
            {optional && <span className="ml-1.5 text-xs font-normal text-muted-foreground">optional</span>}
            <span className="sr-only">{done ? ", done" : ", to do"}</span>
          </div>
          <p className="text-xs leading-snug text-muted-foreground">{detail}</p>
        </div>
        {children}
      </div>
    </li>
  );
}

function Metrics({ turns }: { turns: PlayTurn[] }) {
  const metrics = harnessMetrics(turns);
  if (metrics.runs === 0) return null;
  const items = [
    ["Verified", metrics.verifiedCompletion],
    ["Corrections", metrics.humanCorrection],
    ["Refused", metrics.unauthorized],
    ["Time", metrics.time],
    ["Tokens / success", metrics.tokensPerSuccess],
  ] as const;
  return (
    <dl className="grid grid-cols-2 gap-x-3 gap-y-1 rounded-lg border px-2.5 py-2 text-[11px] sm:grid-cols-5" aria-label="Rehearsal measurements">
      {items.map(([label, value]) => (
        <div key={label}>
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="font-medium" title={label === "Tokens / success" ? "Token count stands in for cost in this rehearsal." : undefined}>
            {value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function Scenarios({ running, onRun }: { running: boolean; onRun: (prompt: string) => void }) {
  const scenarios = useHarnessStore((s) => s.evalScenarios);
  const addEvalScenario = useHarnessStore((s) => s.addEvalScenario);
  const removeEvalScenario = useHarnessStore((s) => s.removeEvalScenario);
  const [name, setName] = useState("");
  const [prompt, setPrompt] = useState("");
  return (
    <details className="rounded-lg border px-2.5 py-2 text-xs">
      <summary className="cursor-pointer font-medium">Scenarios</summary>
      <div className="mt-2 grid gap-2">
        {scenarios.length === 0 && <p className="text-muted-foreground">Save a prompt and replay it after you change the harness.</p>}
        <ul className="grid gap-1">
          {scenarios.map((scenario) => (
            <li key={scenario.id} className="flex items-center gap-2">
              <button type="button" disabled={running} className="min-w-0 flex-1 truncate text-left hover:underline disabled:opacity-50" onClick={() => onRun(scenario.prompt)}>
                {scenario.name}
              </button>
              <button type="button" className="text-muted-foreground hover:text-foreground" aria-label={`Remove ${scenario.name}`} onClick={() => removeEvalScenario(scenario.id)}>
                <X className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
        <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Name" aria-label="Scenario name" className="h-8 text-xs" />
        <Textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="The message to replay" aria-label="Scenario prompt" rows={2} className="text-xs" />
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="justify-self-start"
          disabled={!prompt.trim()}
          onClick={() => {
            addEvalScenario(name, prompt);
            setName("");
            setPrompt("");
          }}
        >
          Save scenario
        </Button>
      </div>
    </details>
  );
}

function TrySetup({
  config,
  rootId,
  keys,
  needs,
  ready,
  onKeys,
  onDone,
}: {
  config: HarnessConfig | null;
  rootId: string | null;
  keys: TryKeys;
  needs: Needs;
  ready: boolean;
  onKeys: (patch: Partial<TryKeys>) => void;
  onDone: () => void;
}) {
  const { addCard, addPartTo, focusNode } = useCanvasActions();
  const model = config?.root.model ?? null;
  const prompts = config?.root.instructions ?? [];
  const hasPrompt = prompts.some((item) => item.content.trim());
  const keysDone = needs.providers.every((provider) => keys[provider].trim()) && (!needs.jev || Boolean(keys.jev.trim()));

  const modelDetail = !config
    ? "Add an agent first."
    : !model
      ? "Pick which AI model your agent thinks with."
      : model.provider === "other"
        ? "Try runs Anthropic, OpenAI, or Google models. Change the provider on the Model card."
        : `${model.modelId} (${PROVIDER_LABELS[model.provider]})`;

  return (
    <section className="grid gap-4 rounded-lg border p-3" aria-label="Set up a test run">
      <div>
        <h3 className="text-sm font-semibold">Set up a test run</h3>
        <p className="mt-0.5 text-xs leading-snug text-muted-foreground">
          Each message goes to the plain model and to your harness, so you can see what your harness adds.
        </p>
      </div>
      <ol className="grid gap-3">
        <SetupRow done={Boolean(config)} label="Main agent" detail={config ? config.root.name || "Your agent" : "Everything starts from an agent card."}>
          {!config && (
            <Button size="sm" variant="outline" className="justify-self-start" onClick={() => addCard("agent")}>
              <Plus /> Add an agent
            </Button>
          )}
        </SetupRow>
        <SetupRow done={Boolean(model && model.provider !== "other")} label="Model" detail={modelDetail}>
          {config && rootId && !model && (
            <Button size="sm" variant="outline" className="justify-self-start" onClick={() => addPartTo(rootId, "model")}>
              <Plus /> Add a model
            </Button>
          )}
          {model?.provider === "other" && (
            <Button size="sm" variant="outline" className="justify-self-start" onClick={() => focusNode(model.nodeId)}>
              Edit the model
            </Button>
          )}
        </SetupRow>
        {(needs.providers.length > 0 || needs.jev) && (
          <SetupRow done={keysDone} label="API key" detail="Sent with each request and never saved on a server.">
            {needs.providers.map((provider) => (
              <KeyField key={provider} id={provider} value={keys[provider]} onChange={(value) => onKeys({ [provider]: value })} />
            ))}
            {needs.jev && <KeyField id="jev" value={keys.jev} onChange={(value) => onKeys({ jev: value })} />}
            <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <input type="checkbox" checked={keys.remember} onChange={(event) => onKeys({ remember: event.target.checked })} />
              Remember on this device
            </label>
          </SetupRow>
        )}
        {config && rootId && (
          <SetupRow
            done={hasPrompt}
            optional
            label="System prompt"
            detail={hasPrompt ? "Your agent's instructions are in." : "Without one, both sides will answer about the same."}
          >
            {!hasPrompt && (
              <Button
                size="sm"
                variant="outline"
                className="justify-self-start"
                onClick={() => (prompts[0] ? focusNode(prompts[0].nodeId) : addPartTo(rootId, "prompt"))}
              >
                {prompts[0] ? "Write the prompt" : (
                  <>
                    <Plus /> Add a system prompt
                  </>
                )}
              </Button>
            )}
          </SetupRow>
        )}
      </ol>
      {ready && (
        <Button size="sm" className="justify-self-start" onClick={onDone}>
          Done
        </Button>
      )}
    </section>
  );
}

function Column({
  title,
  text,
  usage,
  error,
  pending,
  highlight,
  children,
}: {
  title: string;
  text: string;
  usage?: { input: number; output: number };
  error?: string;
  pending: boolean;
  highlight?: boolean;
  children?: ReactNode;
}) {
  const tokens = usage ? usage.input + usage.output : 0;
  return (
    <section className={cn("grid min-w-0 content-start gap-2 rounded-lg border p-2.5", highlight && "border-primary/30 bg-primary/[0.03]")} aria-label={title}>
      <header className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        <span className="truncate">{title}</span>
        {tokens > 0 && <span className="ml-auto shrink-0 font-normal normal-case tracking-normal tabular-nums">{tokens} tokens</span>}
      </header>
      {error ? (
        <p className="text-xs leading-snug text-destructive">{error}</p>
      ) : text ? (
        <p className="whitespace-pre-wrap break-words text-sm leading-snug">{text}</p>
      ) : (
        pending && <p className="text-xs text-muted-foreground">Thinking…</p>
      )}
      {children}
    </section>
  );
}

function CompareColumns({
  reply,
  modelLabel,
  live,
  stacked,
  onFocus,
  onDecide,
}: {
  reply: PlayTurn;
  modelLabel: string;
  live: boolean;
  stacked: boolean;
  onFocus: (step: PlayStep) => void;
  onDecide: (id: string, choice: "approve" | "deny") => void;
}) {
  const [shown, setShown] = useState<"plain" | "harness">("harness");
  const harness = (
    <Column title="Your harness" text={reply.text} usage={reply.usage} error={reply.error} pending={live} highlight>
      {reply.steps.length > 0 && <StepList steps={reply.steps} onFocus={onFocus} onDecide={onDecide} />}
    </Column>
  );
  if (!reply.plain) return harness;
  const plain = (
    <Column title={`Plain ${modelLabel}`} text={reply.plain.text} usage={reply.plain.usage} error={reply.plain.error} pending={Boolean(reply.plain.running)} />
  );
  if (stacked) {
    return (
      <div className="grid gap-2">
        <div role="group" aria-label="Which answer to show" className="inline-flex justify-self-start rounded-lg bg-muted p-0.5 text-xs">
          {(["plain", "harness"] as const).map((side) => (
            <button
              key={side}
              type="button"
              aria-pressed={shown === side}
              onClick={() => setShown(side)}
              className={cn("rounded-md px-2.5 py-1 font-medium", shown === side ? "bg-background shadow-sm" : "text-muted-foreground")}
            >
              {side === "plain" ? "Plain" : "Harness"}
            </button>
          ))}
        </div>
        {shown === "plain" ? plain : harness}
      </div>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-2">
      {plain}
      {harness}
    </div>
  );
}

function TurnRow({
  user,
  reply,
  modelLabel,
  live,
  running,
  stacked,
  onRerun,
  onFocus,
  onDecide,
}: {
  user: PlayTurn;
  reply?: PlayTurn;
  modelLabel: string;
  live: boolean;
  running: boolean;
  stacked: boolean;
  onRerun: () => void;
  onFocus: (step: PlayStep) => void;
  onDecide: (id: string, choice: "approve" | "deny") => void;
}) {
  return (
    <li className="grid gap-2">
      <div className="rounded-lg bg-muted px-3 py-2 text-sm">
        <p className="whitespace-pre-wrap break-words">{user.text}</p>
        <div className="mt-1 flex items-center gap-3 text-[11px] text-muted-foreground">
          {user.context && (
            <span className="inline-flex items-center gap-1">
              <Paperclip className="size-3" /> Pasted context
            </span>
          )}
          <button type="button" className="inline-flex items-center gap-1 hover:text-foreground disabled:opacity-50" onClick={onRerun} disabled={running}>
            <RotateCcw className="size-3" /> Rerun
          </button>
        </div>
      </div>
      {reply && <CompareColumns reply={reply} modelLabel={modelLabel} live={live} stacked={stacked} onFocus={onFocus} onDecide={onDecide} />}
      {reply?.effects && (
        <p className="rounded-md border border-dashed px-3 py-2 text-xs leading-snug">
          <span className="font-medium">What your harness changed: </span>
          <span className="text-muted-foreground">{reply.effects.length ? reply.effects.join(" ") : NO_CHANGE}</span>
        </p>
      )}
    </li>
  );
}

function Composer({
  ready,
  running,
  compare,
  onCompare,
  onSend,
  onStop,
}: {
  ready: boolean;
  running: boolean;
  compare: boolean;
  onCompare: (on: boolean) => void;
  onSend: (message: string, context: string) => void;
  onStop: () => void;
}) {
  const [draft, setDraft] = useState("");
  const [context, setContext] = useState("");
  const [contextOpen, setContextOpen] = useState(false);
  const canSend = ready && !running && Boolean(draft.trim());

  const submit = () => {
    if (!canSend) return;
    onSend(draft, context);
    setDraft("");
    setContext("");
    setContextOpen(false);
  };

  return (
    <form
      className="grid gap-2 border-t px-3 py-2"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <Textarea
        value={draft}
        rows={2}
        aria-label="Message"
        placeholder={ready ? "Message your harness" : "Finish setup to send a message"}
        disabled={!ready}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            submit();
          }
        }}
      />
      {contextOpen && (
        <Textarea
          value={context}
          rows={3}
          autoFocus
          aria-label="Pasted context"
          placeholder="Paste a file or notes the agent should see"
          onChange={(event) => setContext(event.target.value)}
          onBlur={() => context.trim() && setContextOpen(false)}
        />
      )}
      <div className="flex items-center gap-2">
        {!contextOpen && context.trim() ? (
          <span className="inline-flex min-w-0 items-center gap-1 rounded-md border bg-muted/60 py-0.5 pr-0.5 pl-2 text-[11px]">
            <button type="button" className="inline-flex min-w-0 items-center gap-1" onClick={() => setContextOpen(true)}>
              <Paperclip className="size-3 shrink-0" />
              <span className="truncate">Pasted context · {context.trim().length} characters</span>
            </button>
            <button type="button" aria-label="Remove pasted context" className="rounded p-0.5 hover:bg-muted" onClick={() => setContext("")}>
              <X className="size-3" />
            </button>
          </span>
        ) : (
          !contextOpen && (
            <button
              type="button"
              disabled={!ready}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
              onClick={() => setContextOpen(true)}
            >
              <Paperclip className="size-3.5" /> Add context
            </button>
          )
        )}
        <label className="ml-auto flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
          <Switch size="sm" checked={compare} onCheckedChange={onCompare} />
          Compare
        </label>
        {running ? (
          <Button type="button" size="sm" variant="outline" onClick={onStop}>
            <Square /> Stop
          </Button>
        ) : (
          <Button type="submit" size="sm" disabled={!canSend}>
            Send
          </Button>
        )}
      </div>
    </form>
  );
}

/** Lives outside the component so closing the panel mid-run keeps the conversation and the Stop button. */
const session = {
  harness: [] as ModelMessage[],
  plain: [] as ModelMessage[],
  abort: null as AbortController | null,
  askers: new Map<string, (choice: "approve" | "deny") => void>(),
};

function beginRun(): AbortController {
  session.abort = new AbortController();
  return session.abort;
}

function endRun(controller: AbortController) {
  if (session.abort === controller) session.abort = null;
}

function historyFromTurns(turns: PlayTurn[], untrusted: boolean): ModelMessage[] {
  const messages: ModelMessage[] = [];
  for (const turn of turns) {
    if (turn.role === "user") {
      const pasted = turn.context?.trim();
      const content = pasted ? `${turn.text}\n\n${untrusted ? wrapUntrusted(pasted) : `Pasted context:\n${pasted}`}` : turn.text;
      messages.push({ role: "user", content });
    } else if (turn.role === "assistant" && turn.text.trim() && !turn.error) {
      messages.push({ role: "assistant", content: turn.text });
    }
  }
  return messages;
}

/** Rehearse the harness live, next to the same model with no harness. */
export function TryPanel({ stacked = false }: { stacked?: boolean }) {
  const { config, rootId } = useCompiled();
  const turns = useHarnessStore((s) => s.playTurns);
  const running = useHarnessStore((s) => s.playRunning);
  const baseline = useHarnessStore((s) => s.playBaseline);
  const compare = useHarnessStore((s) => s.tryCompare);
  const setCompare = useHarnessStore((s) => s.setTryCompare);
  const pushPlayTurn = useHarnessStore((s) => s.pushPlayTurn);
  const patchPlayTurn = useHarnessStore((s) => s.patchPlayTurn);
  const setPlayRunning = useHarnessStore((s) => s.setPlayRunning);
  const setPlayHighlight = useHarnessStore((s) => s.setPlayHighlight);
  const setPlayBaseline = useHarnessStore((s) => s.setPlayBaseline);
  const clearPlay = useHarnessStore((s) => s.clearPlay);
  const taskLog = useHarnessStore((s) => s.taskLog);
  const appendTaskLog = useHarnessStore((s) => s.appendTaskLog);
  const markTryUnread = useHarnessStore((s) => s.markTryUnread);
  const { revealNode } = useCanvasActions();
  const [keys, setKeys] = useState<TryKeys>(() => (typeof window === "undefined" ? EMPTY_KEYS : loadTryKeys()));
  const scroller = useRef<HTMLDivElement>(null);

  const model = config?.root.model ?? null;
  const provider: ApiProvider | null = model && model.provider !== "other" ? model.provider : null;
  const needs: Needs = config ? requiredKeys(config) : { providers: [], jev: false };
  const missingKey = needs.providers.some((id) => !keys[id].trim()) || (needs.jev && !keys.jev.trim());
  const ready = Boolean(config && provider && !missingKey);
  const [setupOpen, setSetupOpen] = useState(() => !ready);
  if (!ready && !setupOpen) setSetupOpen(true);

  const changed = config && baseline ? changeSummary(baseline, config) : null;
  const starters = config ? starterPrompts(config) : [];
  const modelLabel = model?.modelId ?? "model";
  const lastUser = [...turns].reverse().find((turn) => turn.role === "user");

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [turns, running]);

  useEffect(() => {
    if (!running) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") session.abort?.abort();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [running]);

  const updateKeys = (patch: Partial<TryKeys>) => {
    const next = { ...keys, ...patch };
    setKeys(next);
    saveTryKeys(next);
  };

  const decide = (id: string, choice: "approve" | "deny") => session.askers.get(id)?.(choice);

  const focusStep = (step: PlayStep) => {
    if (!step.nodeId) return;
    setPlayHighlight(step.nodeId, step.edgeId);
    revealNode(step.nodeId);
  };

  const send = async (message: string, context = "") => {
    const text = message.trim();
    const pasted = context.trim();
    if (!config || !model || !provider || !ready || !text || running) return;
    setSetupOpen(false);
    const problem = keyProblem(provider, model.modelId, keys[provider]);
    const withPlain = compare;
    const replyId = crypto.randomUUID();
    pushPlayTurn({ id: crypto.randomUUID(), role: "user", text, context: pasted || undefined, steps: [] });
    pushPlayTurn({ id: replyId, role: "assistant", text: "", steps: [], plain: withPlain ? { text: "", running: true } : undefined });
    if (problem) {
      patchPlayTurn(replyId, { error: problem, plain: withPlain ? { text: "", error: problem } : undefined });
      markTryUnread();
      return;
    }
    setPlayRunning(true);
    setPlayBaseline(config);
    const startedAt = Date.now();
    patchPlayTurn(replyId, { startedAt });
    const controller = beginRun();
    const untrusted = config.root.contexts.length === 0 || config.root.contexts[0].treatAsUntrusted;
    if (session.harness.length === 0) session.harness = historyFromTurns(useHarnessStore.getState().playTurns.slice(0, -2), untrusted);
    const userText = pasted ? `${text}\n\n${untrusted ? wrapUntrusted(pasted) : `Pasted context:\n${pasted}`}` : text;
    const reply = () => useHarnessStore.getState().playTurns.find((turn) => turn.id === replyId);

    const plainSide = withPlain
      ? plainReply({ provider, modelId: model.modelId, apiKey: keys[provider].trim(), history: session.plain, userText, signal: controller.signal })
          .then((result) => {
            session.plain = result.messages;
            patchPlayTurn(replyId, { plain: { text: result.text, usage: result.usage } });
          })
          .catch((err) =>
            patchPlayTurn(replyId, { plain: controller.signal.aborted ? { text: "Stopped." } : { text: "", error: errorText(err) } }),
          )
      : Promise.resolve();

    const harnessSide = rehearse({
      config,
      agent: config.root,
      history: session.harness,
      userText,
      apiKey: keys[provider].trim(),
      jevKey: keys.jev,
      edges: useHarnessStore.getState().edges,
      signal: controller.signal,
      taskLog: useHarnessStore.getState().taskLog,
      onText: (reply) => patchPlayTurn(replyId, { text: reply }),
      onSteps: (steps) => patchPlayTurn(replyId, { steps }),
      onAsk: (step) =>
        new Promise((resolve) => {
          session.askers.set(step.id, resolve);
        }),
      onActive: setPlayHighlight,
    })
      .then((result) => {
        session.harness = result.messages;
        patchPlayTurn(replyId, { text: result.text, steps: result.steps, usage: result.usage, effects: harnessEffects(config, result.steps), finishedAt: Date.now() });
        appendTaskLog(sessionNote(result.text, result.steps));
      })
      .catch((err) => {
        if (controller.signal.aborted) {
          const text = reply()?.text || "Stopped.";
          patchPlayTurn(replyId, { text, finishedAt: Date.now() });
          appendTaskLog(sessionNote(text, reply()?.steps ?? []));
        } else patchPlayTurn(replyId, { error: errorText(err), finishedAt: Date.now() });
      });

    await Promise.all([plainSide, harnessSide]);
    markTryUnread();
    setPlayRunning(false);
    setPlayHighlight(null, null);
    endRun(controller);
  };

  const rows = turns.flatMap((turn, index) => {
    if (turn.role !== "user") return [];
    const next = turns[index + 1];
    return [{ user: turn, reply: next?.role === "assistant" ? next : undefined }];
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b px-3 py-1.5 text-xs">
        <p className="truncate text-muted-foreground">Tools don&apos;t really run here.</p>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {ready && !setupOpen && (
            <span className="text-muted-foreground">
              {modelLabel} · {keys.remember ? "key saved" : "key for this tab"} ·{" "}
              <button type="button" className="font-medium text-foreground hover:underline" onClick={() => setSetupOpen(true)}>
                Edit
              </button>
            </span>
          )}
          {turns.length > 0 && !running && (
            <Button type="button" size="xs" variant="ghost" onClick={() => void send("Continue from the saved progress. Pick up anything still unfinished.")}>
              Resume
            </Button>
          )}
          {turns.length > 0 && (
            <Button
              type="button"
              size="xs"
              variant="ghost"
              onClick={() => {
                session.abort?.abort();
                session.harness = [];
                session.plain = [];
                clearPlay();
              }}
            >
              New chat
            </Button>
          )}
        </div>
      </div>
      <div ref={scroller} className="grid min-h-0 flex-1 content-start gap-4 overflow-y-auto px-3 py-3" aria-live="polite">
        {setupOpen && (
          <TrySetup config={config} rootId={rootId} keys={keys} needs={needs} ready={ready} onKeys={updateKeys} onDone={() => setSetupOpen(false)} />
        )}
        {config && <Scenarios running={running} onRun={(prompt) => void send(prompt)} />}
        {ready && <Metrics turns={turns} />}
        {ready && taskLog && rows.length === 0 && (
          <p className="text-xs text-muted-foreground">Saved progress is still here. Resume picks up from it.</p>
        )}
        {ready && rows.length === 0 && (
          <div className="grid gap-2">
            <p className="text-xs text-muted-foreground">
              {compare ? "Send a message to see both answers side by side." : "Send a message to see how your harness answers."}
            </p>
            {starters.map((prompt) => (
              <button
                key={prompt}
                type="button"
                disabled={running}
                onClick={() => void send(prompt)}
                className="rounded-lg border px-2.5 py-2 text-left text-xs hover:bg-muted disabled:opacity-50"
              >
                {prompt}
              </button>
            ))}
          </div>
        )}
        {ready && rows.length > 0 && (
          <ol className="grid gap-5">
            {rows.map(({ user, reply }, index) => (
              <TurnRow
                key={user.id}
                user={user}
                reply={reply}
                modelLabel={modelLabel}
                live={running && index === rows.length - 1}
                running={running}
                stacked={stacked}
                onRerun={() => void send(user.text, user.context)}
                onFocus={focusStep}
                onDecide={decide}
              />
            ))}
          </ol>
        )}
        {ready && changed && lastUser && !running && (
          <div className="flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-xs">
            <span>{changed}.</span>
            <button type="button" className="ml-auto shrink-0 font-medium hover:underline" onClick={() => void send(lastUser.text, lastUser.context)}>
              Rerun last message
            </button>
          </div>
        )}
      </div>
      <Composer ready={ready} running={running} compare={compare} onCompare={setCompare} onSend={(message, context) => void send(message, context)} onStop={() => session.abort?.abort()} />
    </div>
  );
}

const TRY_MIN_WIDTH = 360;

function tryMaxWidth(viewport: number) {
  return Math.max(TRY_MIN_WIDTH, viewport - 280);
}

function clampTryWidth(width: number) {
  return Math.round(Math.min(Math.max(width, TRY_MIN_WIDTH), tryMaxWidth(window.innerWidth)));
}

/** The chat's own right-hand panel. It takes the Inspector's place while open. */
export function TryDock({ className }: { className?: string }) {
  const closeTry = useHarnessStore((s) => s.closeTry);
  const storedWidth = useHarnessStore((s) => s.tryWidth);
  const setTryWidth = useHarnessStore((s) => s.setTryWidth);
  const aside = useRef<HTMLElement>(null);
  const drag = useRef<{ x: number; width: number } | null>(null);
  const [viewport, setViewport] = useState(0);

  useEffect(() => {
    const update = () => setViewport(window.innerWidth);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const width = storedWidth == null || viewport === 0 ? null : Math.min(storedWidth, tryMaxWidth(viewport));

  const resizeBy = (delta: number) => {
    const current = aside.current?.getBoundingClientRect().width ?? TRY_MIN_WIDTH;
    setTryWidth(clampTryWidth(current + delta));
  };

  return (
    <aside
      ref={aside}
      id="try-panel"
      aria-label="Test your harness"
      style={width == null ? undefined : { width }}
      className={cn("relative shrink-0 flex-col overflow-hidden border-l bg-background", width == null && "w-[min(50vw,56rem)]", className)}
    >
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize test chat"
        aria-valuemin={TRY_MIN_WIDTH}
        aria-valuemax={viewport ? tryMaxWidth(viewport) : undefined}
        aria-valuenow={width ?? undefined}
        tabIndex={0}
        title="Drag to resize"
        onPointerDown={(event) => {
          event.preventDefault();
          drag.current = { x: event.clientX, width: aside.current?.getBoundingClientRect().width ?? TRY_MIN_WIDTH };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (!drag.current) return;
          setTryWidth(clampTryWidth(drag.current.width + drag.current.x - event.clientX));
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
        onKeyDown={(event) => {
          if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
          event.preventDefault();
          resizeBy(event.key === "ArrowLeft" ? 32 : -32);
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
        className="absolute inset-y-0 left-0 z-20 w-2 -translate-x-1/2 cursor-col-resize touch-none after:absolute after:inset-y-0 after:left-1/2 after:w-px after:-translate-x-1/2 after:bg-border hover:after:w-0.5 hover:after:bg-indigo-500 focus-visible:outline-none focus-visible:after:w-0.5 focus-visible:after:bg-indigo-500"
      />
      <div className="flex items-center gap-2 border-b py-1.5 pr-2 pl-4">
        <MessagesSquare className="size-4 text-indigo-500" aria-hidden />
        <h2 className="text-sm font-semibold">Test your harness</h2>
        <Button variant="ghost" size="icon-sm" aria-label="Close the test chat" onClick={closeTry} className="ml-auto">
          <X />
        </Button>
      </div>
      <TryPanel />
    </aside>
  );
}

/** Floating button on the canvas that opens the test chat. */
export function TryLauncher() {
  const open = useHarnessStore((s) => s.rightTab === "try");
  const hasNodes = useHarnessStore((s) => s.nodes.length > 0);
  const unread = useHarnessStore((s) => s.tryUnread);
  const running = useHarnessStore((s) => s.playRunning);
  const openTry = useHarnessStore((s) => s.openTry);
  if (open || !hasNodes) return null;
  return (
    <Button
      onClick={openTry}
      aria-controls="try-panel"
      aria-expanded={false}
      className="absolute bottom-4 left-1/2 z-10 h-10 -translate-x-1/2 gap-2 rounded-full bg-indigo-600 px-4 text-sm text-white shadow-lg hover:bg-indigo-600/90"
    >
      <MessagesSquare className="size-4" />
      Test your harness
      {(unread || running) && (
        <span className={cn("size-2 rounded-full bg-white", running && "animate-pulse")} aria-label={running ? "Running" : "Reply ready"} />
      )}
    </Button>
  );
}
