import type { Provider } from "./types";

const SESSION_KEY = "harness-studio:try-keys";
const LOCAL_KEY = "harness-studio:try-keys:saved";

export interface TryKeys {
  anthropic: string;
  openai: string;
  google: string;
  jev: string;
  remember: boolean;
}

export const EMPTY_KEYS: TryKeys = { anthropic: "", openai: "", google: "", jev: "", remember: false };

const KEY_LABELS: Record<Exclude<Provider, "other"> | "jev", { label: string; placeholder: string }> = {
  anthropic: { label: "Anthropic API key", placeholder: "sk-ant-…" },
  openai: { label: "OpenAI API key", placeholder: "sk-…" },
  google: { label: "Google API key", placeholder: "AIza…" },
  jev: { label: "TypeSafe API key", placeholder: "For Jev decisions" },
};

export const keyField = (id: Exclude<Provider, "other"> | "jev") => KEY_LABELS[id];

const PROVIDER_KEY_HINT: Record<Exclude<Provider, "other">, string> = {
  anthropic: "Anthropic keys come from console.anthropic.com and start with sk-ant-. A Claude.ai or Cursor login is not an API key.",
  openai: "OpenAI keys come from platform.openai.com and start with sk-.",
  google: "Gemini keys come from aistudio.google.com and start with AIza.",
};

/**
 * A reason the key cannot belong to this model's provider, before any request is sent.
 * A well-formed key returns null and is checked by the provider itself.
 */
export function keyProblem(provider: Exclude<Provider, "other">, modelId: string, key: string): string | null {
  const value = key.trim();
  if (!value) return null;
  const who = `${modelId} (${keyField(provider).label.replace(" API key", "")})`;
  if (/\s/.test(value)) {
    return `The key for ${who} has a space or line break in it. Paste the key again as a single line.`;
  }
  if (provider === "anthropic" && !value.startsWith("sk-ant-")) {
    if (value.startsWith("sk-")) return `The key for ${who} looks like an OpenAI key: it starts with sk-, not sk-ant-. ${PROVIDER_KEY_HINT.anthropic}`;
    if (value.startsWith("AIza")) return `The key for ${who} looks like a Google key: it starts with AIza. ${PROVIDER_KEY_HINT.anthropic}`;
    return `The key for ${who} does not look like an Anthropic key. ${PROVIDER_KEY_HINT.anthropic}`;
  }
  if (provider === "openai" && value.startsWith("sk-ant-")) {
    return `The key for ${who} looks like an Anthropic key: it starts with sk-ant-. ${PROVIDER_KEY_HINT.openai}`;
  }
  if (provider === "openai" && value.startsWith("AIza")) {
    return `The key for ${who} looks like a Google key: it starts with AIza. ${PROVIDER_KEY_HINT.openai}`;
  }
  if (provider === "google" && value.startsWith("sk-")) {
    return `The key for ${who} looks like an Anthropic or OpenAI key: it starts with sk-. ${PROVIDER_KEY_HINT.google}`;
  }
  return null;
}

export function loadTryKeys(): TryKeys {
  if (typeof window === "undefined") return EMPTY_KEYS;
  try {
    const saved = window.localStorage.getItem(LOCAL_KEY);
    const session = window.sessionStorage.getItem(SESSION_KEY);
    const raw = saved ?? session;
    if (!raw) return EMPTY_KEYS;
    const parsed = JSON.parse(raw) as Partial<TryKeys>;
    return { ...EMPTY_KEYS, ...parsed, remember: Boolean(saved) };
  } catch {
    return EMPTY_KEYS;
  }
}

export function saveTryKeys(keys: TryKeys) {
  const payload = JSON.stringify({ anthropic: keys.anthropic, openai: keys.openai, google: keys.google, jev: keys.jev });
  if (keys.remember) {
    window.localStorage.setItem(LOCAL_KEY, payload);
    window.sessionStorage.removeItem(SESSION_KEY);
  } else {
    window.sessionStorage.setItem(SESSION_KEY, payload);
    window.localStorage.removeItem(LOCAL_KEY);
  }
}
