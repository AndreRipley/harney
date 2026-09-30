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

describe("/api/try errors", () => {
  it("says which provider rejected the key and where a valid one comes from", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ error: { type: "authentication_error", message: "invalid x-api-key" } }), { status: 401 })),
    );
    const response = await POST(request("anthropic") as never);
    const body = await response.json();
    expect(response.status).toBe(502);
    expect(body.error).toContain("Anthropic rejected the API key");
    expect(body.error).toContain("calling m");
    expect(body.error).toContain("sk-ant-");
    expect(body.error).toContain("invalid x-api-key");
  });
});

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
