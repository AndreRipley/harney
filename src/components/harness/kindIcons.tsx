import {
  BookOpenText,
  Bot,
  Cpu,
  FilePen,
  FileSearch,
  Globe,
  type LucideIcon,
  Plug,
  Scale,
  ScrollText,
  Search,
  ShieldCheck,
  SquareTerminal,
  Webhook,
  Wrench,
} from "lucide-react";
import { createElement, type SVGProps } from "react";
import type { BuiltinTool, HarnessNodeData, NodeKind } from "@/lib/harness/types";

export const KIND_ICONS: Record<NodeKind, LucideIcon> = {
  agent: Bot,
  model: Cpu,
  prompt: ScrollText,
  tool: Wrench,
  mcp: Plug,
  rule: BookOpenText,
  policy: ShieldCheck,
  hook: Webhook,
  decision: Scale,
};

export const TOOL_ICONS: Record<BuiltinTool, LucideIcon> = {
  read: FileSearch,
  edit: FilePen,
  shell: SquareTerminal,
  webSearch: Search,
  webFetch: Globe,
};

export function KindIcon({ kind, ...props }: { kind: NodeKind } & SVGProps<SVGSVGElement>) {
  return createElement(KIND_ICONS[kind], props);
}

export function NodeIcon({ data, ...props }: { data: HarnessNodeData } & SVGProps<SVGSVGElement>) {
  const icon = data.kind === "tool" ? TOOL_ICONS[data.config.tool] : KIND_ICONS[data.kind];
  return createElement(icon, props);
}
