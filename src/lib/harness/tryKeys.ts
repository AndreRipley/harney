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
