import { afterEach, describe, expect, it, vi } from "vitest";
import { plainReply } from "./playRun";

afterEach(() => vi.unstubAllGlobals());

describe("plainReply", () => {
  it("sends the same model with no system prompt and no tools", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({ text: "Hi", toolCalls: [], usage: { input: 3, output: 1 } }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const result = await plainReply({
      provider: "anthropic",
      modelId: "sonnet",
      apiKey: "k",
      history: [],
      userText: "Hello",
      signal: new AbortController().signal,
    });
    const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body.system).toBe("");
    expect(body.tools).toEqual([]);
    expect(body.model).toBe("claude-sonnet-4-5");
    expect(result.text).toBe("Hi");
    expect(result.messages.at(-1)).toEqual({ role: "assistant", content: "Hi" });
  });
});
