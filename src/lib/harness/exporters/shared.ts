import type { CompiledAgent, Feature, RuleData } from "../types";

export type SupportLevel = "full" | "partial" | "none";

export interface FeatureSupport {
  level: SupportLevel;
  note: string;
}

export const FEATURE_LABELS: Record<Feature, string> = {
  model: "Model choice",
  temperature: "Temperature",
  maxTokens: "Max output tokens",
  reasoning: "Reasoning effort",
  instructions: "System prompt",
  rules: "Rules",
  ruleGlobs: "Rule file patterns",
  toolPermissions: "Tool access",
  commandRules: "Command allow/block lists",
  network: "Network access",
  mcp: "MCP servers",
  hooks: "Hooks",
  decisions: "Jev decisions",
  subagents: "Subagents",
};

export const JSON_INDENT = 2;
export const toJson = (value: unknown) => `${JSON.stringify(value, null, JSON_INDENT)}\n`;

/** Markdown for an agent's prompts: a single prompt is inlined, several get headings. */
export function renderInstructions(agent: CompiledAgent, headingLevel = 2): string {
  const prompts = agent.instructions.filter((i) => i.content.trim());
  if (prompts.length === 0) return "";
  if (prompts.length === 1) return prompts[0].content.trim();
  const hashes = "#".repeat(headingLevel);
  return prompts.map((p) => `${hashes} ${p.title.trim() || "Instructions"}\n\n${p.content.trim()}`).join("\n\n");
}

export function ruleScope(rule: RuleData): string | null {
  if (rule.alwaysApply || rule.globs.length === 0) return null;
  return rule.globs.map((g) => `\`${g}\``).join(", ");
}

/** Rules as markdown sections, for tools that have no per-file rule files. */
export function renderRulesSection(rules: RuleData[], headingLevel = 2): string {
  const withContent = rules.filter((r) => r.content.trim());
  if (withContent.length === 0) return "";
  const h = "#".repeat(headingLevel);
  const body = withContent
    .map((rule) => {
      const scope = ruleScope(rule);
      const lines = [`${h}# ${rule.name.trim()}`];
      if (scope) lines.push(`_Applies to ${scope} files._`);
      if (rule.description.trim()) lines.push(rule.description.trim());
      lines.push(rule.content.trim());
      return lines.join("\n\n");
    })
    .join("\n\n");
  return `${h} Rules\n\n${body}`;
}

export function joinSections(...sections: (string | null | undefined | false)[]): string {
  return `${sections.filter((s): s is string => Boolean(s && s.trim())).join("\n\n").trim()}\n`;
}

/** Returns a name that doesn't collide with names already handed out. */
export function uniqueNamer() {
  const used = new Set<string>();
  return (base: string) => {
    let name = base;
    let counter = 2;
    while (used.has(name)) name = `${base}-${counter++}`;
    used.add(name);
    return name;
  };
}

export const yamlString = (value: string) => JSON.stringify(value.replace(/\s+/g, " ").trim());
