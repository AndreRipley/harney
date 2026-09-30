import { presentEdge } from "./connections";
import { makeNodeData } from "./kinds";
import { autoLayout } from "./layout";
import type { HarnessEdge, HarnessNode, KindDataMap, NodeKind } from "./types";

type Spec = {
  [K in NodeKind]: {
    id: string;
    kind: K;
    config?: Partial<KindDataMap[K]>;
    /** For parts: the agent this card plugs into. For agents: the parent agent. */
    to?: string;
  };
}[NodeKind];

export interface Preset {
  id: string;
  name: string;
  description: string;
  build: () => { nodes: HarnessNode[]; edges: HarnessEdge[] };
}

export function buildGraph(specs: Spec[], idPrefix = ""): { nodes: HarnessNode[]; edges: HarnessEdge[] } {
  const pid = (id: string) => `${idPrefix}${id}`;
  const nodes: HarnessNode[] = specs.map((spec) => ({
    id: pid(spec.id),
    type: "harness",
    position: { x: 0, y: 0 },
    data: makeNodeData(spec.kind, spec.config as never),
  }));
  const edges: HarnessEdge[] = specs
    .filter((spec) => spec.to)
    .map((spec) => {
      const isAgent = spec.kind === "agent";
      const source = isAgent ? pid(spec.to!) : pid(spec.id);
      const target = isAgent ? pid(spec.id) : pid(spec.to!);
      return presentEdge({
        id: `e-${source}-${target}`,
        source,
        target,
        data: { role: isAgent ? "delegate" : "parts" },
      });
    });
  return { nodes: autoLayout(nodes, edges), edges };
}

const uid = () => `${Math.random().toString(36).slice(2, 7)}-`;

export const PRESETS: Preset[] = [
  {
    id: "reviewer",
    name: "Careful reviewer",
    description: "Reads and comments on code changes. Never edits files.",
    build: () =>
      buildGraph(
        [
          {
            id: "agent",
            kind: "agent",
            config: {
              name: "PR Reviewer",
              description: "Reviews code changes for bugs, security issues and missing tests.",
            },
          },
          { id: "model", kind: "model", to: "agent", config: { provider: "anthropic", modelId: "sonnet" } },
          {
            id: "prompt",
            kind: "prompt",
            to: "agent",
            config: {
              title: "Review guidelines",
              content:
                "You review code changes. Look for bugs, security issues, and missing tests.\n\nNever edit files. Explain each finding with the file, the line, why it matters, and a suggested fix. Lead with the most serious problems.",
            },
          },
          { id: "read", kind: "tool", to: "agent", config: { tool: "read", mode: "allow" } },
          { id: "edit", kind: "tool", to: "agent", config: { tool: "edit", mode: "deny" } },
          { id: "shell", kind: "tool", to: "agent", config: { tool: "shell", mode: "ask" } },
          {
            id: "policy",
            kind: "policy",
            to: "agent",
            config: {
              name: "Safe commands only",
              allowCommands: ["git diff *", "git log *", "npm test"],
              denyCommands: ["rm *", "git push *"],
              allowNetwork: true,
            },
          },
        ],
        uid(),
      ),
  },
  {
    id: "builder",
    name: "Autonomous builder",
    description: "Plans, writes and tests code on its own, with guardrails.",
    build: () =>
      buildGraph(
        [
          {
            id: "agent",
            kind: "agent",
            config: { name: "Builder", description: "Implements features end to end: plans, writes code and runs tests." },
          },
          {
            id: "model",
            kind: "model",
            to: "agent",
            config: { provider: "openai", modelId: "gpt-6-sol", reasoningEffort: "medium" },
          },
          {
            id: "prompt",
            kind: "prompt",
            to: "agent",
            config: {
              title: "How to work",
              content:
                "Work in small, verifiable steps. Before changing code, read the surrounding files and match their style.\n\nAfter each change, run the relevant tests and fix any failures before moving on. Finish with a short summary of what changed and why.",
            },
          },
          { id: "read", kind: "tool", to: "agent", config: { tool: "read", mode: "allow" } },
          { id: "edit", kind: "tool", to: "agent", config: { tool: "edit", mode: "allow" } },
          { id: "shell", kind: "tool", to: "agent", config: { tool: "shell", mode: "allow" } },
          { id: "web", kind: "tool", to: "agent", config: { tool: "webSearch", mode: "allow" } },
          {
            id: "policy",
            kind: "policy",
            to: "agent",
            config: {
              name: "Guardrails",
              allowCommands: ["npm run *", "git status", "git diff *"],
              denyCommands: ["rm -rf *", "git push --force *"],
              allowNetwork: true,
            },
          },
          {
            id: "rule",
            kind: "rule",
            to: "agent",
            config: {
              name: "Testing",
              description: "How to write and run tests",
              alwaysApply: true,
              content: "Every bug fix needs a test that fails without the fix. Put tests next to the code they cover.",
            },
          },
          {
            id: "hook",
            kind: "hook",
            to: "agent",
            config: { name: "Lint after edits", event: "postToolUse", scope: "edit", command: "npm run lint --silent" },
          },
          {
            id: "verifier",
            kind: "verifier",
            to: "agent",
            config: { name: "Tests pass", check: "command", command: "npm test", separateEvaluator: true },
          },
        ],
        uid(),
      ),
  },
  {
    id: "orchestrator",
    name: "Orchestrator with subagents",
    description: "A lead agent that hands security and testing to specialists.",
    build: () =>
      buildGraph(
        [
          {
            id: "lead",
            kind: "agent",
            config: { name: "Tech Lead", description: "Breaks work down and delegates to specialists." },
          },
          { id: "leadModel", kind: "model", to: "lead", config: { provider: "anthropic", modelId: "opus" } },
          {
            id: "leadPrompt",
            kind: "prompt",
            to: "lead",
            config: {
              title: "Lead instructions",
              content:
                "Plan the work before starting. Hand security reviews to the Security Auditor and new tests to the Test Writer, then combine their results into one clear answer.",
            },
          },
          {
            id: "github",
            kind: "mcp",
            to: "lead",
            config: {
              name: "github",
              transport: "stdio",
              command: "npx",
              args: ["-y", "@modelcontextprotocol/server-github"],
              envVars: ["GITHUB_PERSONAL_ACCESS_TOKEN"],
            },
          },
          {
            id: "auditor",
            kind: "agent",
            to: "lead",
            config: {
              name: "Security Auditor",
              description: "Checks changes for injection, auth flaws and leaked secrets.",
            },
          },
          { id: "auditorModel", kind: "model", to: "auditor", config: { provider: "anthropic", modelId: "sonnet" } },
          {
            id: "auditorPrompt",
            kind: "prompt",
            to: "auditor",
            config: {
              title: "Audit checklist",
              content:
                "Audit the given code for injection, broken authentication, unsafe deserialization, and secrets committed to the repo. Report each finding with severity and a fix. Don't edit files.",
            },
          },
          { id: "auditorRead", kind: "tool", to: "auditor", config: { tool: "read", mode: "allow" } },
          { id: "auditorEdit", kind: "tool", to: "auditor", config: { tool: "edit", mode: "deny" } },
          {
            id: "tester",
            kind: "agent",
            to: "lead",
            config: { name: "Test Writer", description: "Writes and runs tests for new or changed code." },
          },
          {
            id: "testerPrompt",
            kind: "prompt",
            to: "tester",
            config: {
              title: "Testing approach",
              content:
                "Write focused tests for the behavior that changed. Cover the happy path, edge cases, and one failure case. Run them and report the results.",
            },
          },
          { id: "testerEdit", kind: "tool", to: "tester", config: { tool: "edit", mode: "allow" } },
          {
            id: "testerRule",
            kind: "rule",
            to: "tester",
            config: {
              name: "Test conventions",
              description: "Conventions for test files",
              alwaysApply: false,
              globs: ["**/*.test.ts", "**/*.test.tsx"],
              content: "Use describe/it blocks. One behavior per test. No snapshot tests for logic.",
            },
          },
        ],
        uid(),
      ),
  },
  {
    id: "investigation",
    name: "Transaction investigation",
    description: "One agent, read-only tools, saved progress, and a check that the explanation cites evidence.",
    build: () =>
      buildGraph(
        [
          {
            id: "agent",
            kind: "agent",
            config: {
              name: "Investigator",
              description: "Investigates a failed customer transaction and cites the evidence.",
            },
          },
          { id: "model", kind: "model", to: "agent", config: { provider: "anthropic", modelId: "sonnet" } },
          {
            id: "prompt",
            kind: "prompt",
            to: "agent",
            config: {
              title: "How to investigate",
              content:
                "Find what happened to the transaction. Read the record and the operating procedure before you explain it.\n\nEvery claim needs the record it came from. If you cannot find it, say what is still unknown. Do not change the transaction.",
            },
          },
          { id: "read", kind: "tool", to: "agent", config: { tool: "read", mode: "allow" } },
          { id: "edit", kind: "tool", to: "agent", config: { tool: "edit", mode: "deny" } },
          { id: "shell", kind: "tool", to: "agent", config: { tool: "shell", mode: "deny" } },
          {
            id: "loop",
            kind: "loop",
            to: "agent",
            config: { name: "Investigation loop", mode: "autonomous", maxSteps: 8, stopOnBlocker: true },
          },
          {
            id: "context",
            kind: "context",
            to: "agent",
            config: {
              name: "Case file",
              budgetChars: 6000,
              compactHistory: true,
              alwaysLoad: [],
              onDemand: ["Transaction record", "Operating procedure"],
              treatAsUntrusted: true,
            },
          },
          {
            id: "progress",
            kind: "progress",
            to: "agent",
            config: {
              name: "Case progress",
              objective: "Explain the failed transaction with evidence.",
              checklist: ["Retrieve the transaction", "Read the operating procedure", "Record unresolved questions", "Cite evidence for the explanation"],
              notes: "",
            },
          },
          {
            id: "sandbox",
            kind: "sandbox",
            to: "agent",
            config: { name: "Read-only case", access: "read-only", timeoutSeconds: 20 },
          },
          {
            id: "skill",
            kind: "skill",
            to: "agent",
            config: {
              name: "Evidence",
              description: "Load when citing a finding.",
              content: "Every claim needs the record it came from. Quote the field, not a paraphrase, and say what is still unknown.",
            },
          },
          {
            id: "verifier",
            kind: "verifier",
            to: "agent",
            config: {
              name: "Evidence check",
              check: "rubric",
              rubric: "The explanation names the transaction, cites a procedure, and says what is still unknown.",
              separateEvaluator: true,
            },
          },
        ],
        uid(),
      ),
  },
];
