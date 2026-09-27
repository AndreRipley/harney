# Harness Studio

A drag-and-drop designer for AI agent harnesses. You build an agent on a canvas, much as you would in Lucidchart: drop in a model, a system prompt, tools, MCP servers, rules, permission policies, hooks and subagents, then wire them together. Harness Studio then exports ready-to-use project files for **Claude Code**, **Cursor** or **Codex**, along with a setup guide written for your diagram.

Everything runs in the browser. There's no backend, no account and no AI in the export step. Your diagram autosaves to `localStorage`.

## Run it locally

Requires Node.js 20 or newer.

```bash
npm install
npm run dev
```

Then open [http://localhost:43127](http://localhost:43127).

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the dev server on port 43127 |
| `npm test` | Run the unit tests (Vitest) |
| `npm run typecheck` | Type-check with TypeScript |
| `npm run lint` | Lint with ESLint |
| `npm run build && npm start` | Production build and server |

## How it works

1. **Drag parts onto the canvas.** You can also click a part to add it. If an agent is selected, the new part connects to it automatically.
2. **Connect parts to an Agent.** Parts plug into an agent's left side. To make one agent a subagent of another, drag from the parent's bottom dot to the helper's top dot. Invalid connections are refused with a plain-language reason: a second model, a loop of agents, or a part connected to another part.
3. **Click a card to configure it** in the inspector on the right. The inspector's "Works with" section shows how Claude Code, Cursor and Codex each handle that card.
4. **Export.** A three-step dialog lets you choose a tool, review any problems, and download a zip. The zip includes a numbered `HARNESS-SETUP.md` covering file placement, secrets, installs, first launch and a test prompt.

## What gets exported

| Target | Files |
| --- | --- |
| Claude Code | `CLAUDE.md`, `.claude/settings.json` (model, permissions, hooks), `.mcp.json`, `.claude/agents/*.md` |
| Cursor | `.cursor/rules/*.mdc`, `.cursor/mcp.json`, `.cursor/hooks.json` |
| Codex | `AGENTS.md`, `.codex/config.toml` (model, sandbox, approvals, MCP, hooks), `.codex/rules/*.rules`, `.codex/agents/*.toml` |

Secrets are never written into the files. MCP servers reference environment variables by name, for example `${GITHUB_TOKEN}`, so the exported files are safe to commit.

Settings a tool can't use (such as temperature in Claude Code, or model choice in Cursor) are flagged in the inspector, the preview and the export review step, rather than silently dropped.

## Project layout

```
src/
  app/                      Next.js entry (layout, page, global styles)
  components/
    canvas/                 React Flow canvas, palette, node cards, empty state
    inspector/              Per-card settings forms and the overview panel
    preview/                Live file preview drawer
    export/                 Guided export dialog and setup guide
    studio/                 App shell, top bar, providers
  hooks/                    Canvas, document and export hooks
  lib/harness/
    types.ts                Node, config and export types
    kinds.ts                Card metadata, defaults and summaries
    connections.ts          Connection rules (one model per agent, no loops)
    compile.ts              Graph to harness config, plus validation issues
    exporters/              Claude Code, Cursor and Codex file builders
    setupGuide.ts           Setup steps and HARNESS-SETUP.md
    presets.ts              Starter templates
    diagramFile.ts          .harness.json save and import
  store/harnessStore.ts     Zustand store with undo/redo and autosave
```

Built with Next.js, TypeScript, Tailwind CSS, shadcn/ui, React Flow (`@xyflow/react`), Zustand, Zod, smol-toml and JSZip.
