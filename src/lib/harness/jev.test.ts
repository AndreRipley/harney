import { describe, expect, it } from "vitest";
import {
  answerBlocks,
  blockPayload,
  jevQuestions,
  JEV_ENDPOINT,
  JEV_KEY_ENV,
  renderDecisionScript,
} from "./jev";
import type { DecisionQuestion } from "./types";

const noul: DecisionQuestion = {
  name: "block",
  type: "noul",
  instructions: "Should this be blocked?",
  criteria: [],
  blockChoices: [],
  blockAt: 0.5,
};

describe("Jev decisions", () => {
  it("blocks a yes at or above the threshold", () => {
    expect(answerBlocks(noul, { type: "noul", noul: 0.5 })).toBe(true);
    expect(answerBlocks(noul, { type: "noul", noul: 0.49 })).toBe(false);
  });

  it("blocks a choice only when the answer is listed", () => {
    const question: DecisionQuestion = { ...noul, type: "choice", blockChoices: ["deny"] };
    expect(answerBlocks(question, { type: "choice", choice: "deny" })).toBe(true);
    expect(answerBlocks(question, { type: "choice", choice: "allow" })).toBe(false);
  });

  it("blocks a score at or above the cutoff", () => {
    const question: DecisionQuestion = { ...noul, type: "score", blockAt: 2 };
    expect(answerBlocks(question, { type: "score", score: 2 })).toBe(true);
    expect(answerBlocks(question, { type: "score", score: 1.9 })).toBe(false);
  });

  it("turns option lines into a choice question", () => {
    expect(
      jevQuestions([{ ...noul, type: "choice", name: "topic", criteria: ["billing: money", "bug"] }]),
    ).toEqual({
      topic: {
        type: "choice",
        instructions: "Should this be blocked?",
        criteria: { billing: "money", bug: null },
      },
    });
  });

  it("writes a hook script that calls Jev and leaves the key out", () => {
    const script = renderDecisionScript(
      { name: "Safety", model: "jev-latest", event: "preToolUse", scope: "any", questions: [noul] },
      "claude",
    );
    expect(script).toContain(JEV_ENDPOINT);
    expect(script).toContain(JEV_KEY_ENV);
    expect(script).not.toContain("jv_live_");
    expect(script).toContain("permissionDecision");
    expect(blockPayload("cursor", "userPromptSubmit", "no")).toEqual({ continue: false, user_message: "no" });
    expect(blockPayload("cursor", "stop", "again")).toEqual({ followup_message: "again" });
    expect(blockPayload("codex", "stop", "again")).toEqual({ decision: "block", reason: "again" });
  });
});
