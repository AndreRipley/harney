import { describe, expect, it } from "vitest";
import { keyProblem } from "./tryKeys";

describe("keyProblem", () => {
  it("explains an OpenAI key used on an Anthropic model", () => {
    expect(keyProblem("anthropic", "sonnet", "sk-proj-abc")).toMatch(/OpenAI key/);
    expect(keyProblem("anthropic", "sonnet", "sk-proj-abc")).toMatch(/sk-ant-/);
  });

  it("explains a key with a space in the middle, and ignores space around it", () => {
    expect(keyProblem("anthropic", "sonnet", "sk-ant-abc def")).toMatch(/space or line break/);
    expect(keyProblem("anthropic", "sonnet", "  sk-ant-api03-real\n")).toBeNull();
  });

  it("lets a matching key through", () => {
    expect(keyProblem("anthropic", "sonnet", "sk-ant-api03-real")).toBeNull();
    expect(keyProblem("openai", "gpt-4.1", "sk-proj-real")).toBeNull();
  });
});
