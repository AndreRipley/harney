import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

afterEach(() => vi.unstubAllGlobals());

const request = (provider: string) =>
  new Request("http://localhost/api/try", {
    method: "POST",
    body: JSON.stringify({
      provider,
      model: "m",
      apiKey: "k",
      system: "",
      tools: [],
      messages: [{ role: "user", content: "Hello" }],
    }),
  });

const providerReply: Record<string, unknown> = {
  anthropic: { content: [{ type: "text", text: "Hi" }] },
  openai: { choices: [{ message: { content: "Hi" } }] },
  google: { candidates: [{ content: { parts: [{ text: "Hi" }] } }] },
};

describe("/api/try with no harness", () => {
  for (const provider of ["anthropic", "openai", "google"]) {
    it(`leaves out the system prompt and tools for ${provider}`, async () => {
      const fetchMock = vi.fn(async () => Response.json(providerReply[provider]));
      vi.stubGlobal("fetch", fetchMock);
      const response = await POST(request(provider) as never);
      expect((await response.json()).text).toBe("Hi");
      const sent = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
      expect(sent).not.toHaveProperty("system");
      expect(sent).not.toHaveProperty("systemInstruction");
      expect(sent).not.toHaveProperty("tools");
      if (provider === "openai") expect(sent.messages.some((m: { role: string }) => m.role === "system")).toBe(false);
    });
  }
});
