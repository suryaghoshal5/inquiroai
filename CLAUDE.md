# CLAUDE.md — InquiroAI

## Project Overview

InquiroAI is a domain expert's AI operating system — a multi-model chat platform with persistent memory, prompt intelligence, and structured output generation. It is NOT a generic AI chat wrapper.

**Repo:** https://github.com/suryaghoshal5/inquiroai
**Stack:** React 18 + TypeScript + Vite + Tailwind + shadcn/ui (frontend) | Node.js + Express + PostgreSQL/Neon + Drizzle ORM (backend)
**Current State:** Layers 0–5 + all UI/UX sprints are COMPLETE. Do NOT rebuild from scratch.

**Full specs:** See `docs/spec/layers.md` (Layers 0–5) and `docs/spec/additional-features.md` (A-series + Sprint 3 decisions).

---

## Golden Rules

1. **Never rewrite working code.** Extend, don't replace.
2. **Every AI call goes through the pipeline** — Evaluator → Router → Context Manager → OpenRouter → Response.
3. **Fail gracefully.** If any layer (evaluator, router, summarizer) fails, fall through silently to the base AI call.
4. **OpenRouter is the only AI backend.** All AI calls go through `callAI()` in `server/openrouter.ts`.
5. **TypeScript strict mode everywhere.** No `any` types.
6. **Environment variables** for all secrets — never hardcoded.
7. **Role is chat-level only** — never inherit role from a project (Design Decision D1).
8. **Auto model is the default** — users can override, not the other way around (Design Decision D2).

---

## What Is Built (Do Not Touch Unless Instructed)

| Layer | Feature | Location |
|-------|---------|----------|
| Layer 0 | Projects table, CRUD API, field inheritance | `server/routes.ts`, `shared/schema.ts` |
| Layer 0 | NewProject, EditProject, ProjectDashboard | `client/src/pages/` |
| Layer 0 | NewProjectChat, FileBrowser, ModelPicker | `client/src/components/` |
| Layer 0 | Home Dashboard, two-tier sidebar, LinkToProjectModal | `client/src/pages/`, `client/src/components/` |
| Layer 0 | Local folder browsing + file extraction API | `server/routes.ts` |
| Layer 1 | OpenRouter client + 50+ provider catalog | `server/openrouter.ts`, `server/openrouter-models.ts` |
| Layer 2 | Prompt evaluator + model router | `server/promptEvaluator.ts`, `server/modelRouter.ts` |
| Layer 2 | PromptSuggestionBanner + auto model pill UI | `client/src/components/` |
| Layer 3 | Context manager (auto-compress at 70%) | `server/contextManager.ts` |
| Layer 3 | ContextStatusBar UI | `client/src/components/` |
| Layer 4 | Notion memory backend + archive endpoint | `server/notionMemory.ts`, `server/routes.ts` |
| Layer 5 | Obsidian entity extractor + vault writer | `server/obsidianGraph.ts`, `server/obsidianWriter.ts` |
| UX | Streaming (SSE), chat search, rename, reorder | `client/src/`, `server/` |
| UX | Tab-based forms, hover states, chat header pills | `client/src/pages/`, `client/src/components/` |
| UX | Tooltips, empty state, a11y fixes, mobile sidebar | `client/src/` |

---

## Current Sprint

**Sprint 2 Build** — File Intelligence Tier 1 + Code Intelligence C1+C2.
See `NEW_ASANA_TICKETS.md` for full ticket list.

**Carryover (do first):**
- `SEC-1`: Remove hardcoded `OPENROUTER_API_KEY` from `server/config.ts` — read from env only

**Phase 1 — File Intelligence Tier 1 (Apr 3–12):**
- `FI-T1.1` Schema: `project_files` + `chat_files` tables
- `FI-T1.2` File cache service: `extractAndCache`, `getProjectFiles`, `invalidateFile`
- `FI-T1.3` File API: attach/detach/list-cached endpoints
- `FI-T1.4` Structured `<file>` prompt assembly with 30K token cap
- `FI-T1.5` FileBrowser upgrade: cached section + stale badge
- `FI-T1.6` Attached-files pill bar in chat UI

**Phase 2 — Code Intelligence C1+C2 (Apr 14–23):**
- `CI-C1.1` `codeContextAssembler.ts`: stack detection, schema reading, 5-min cache
- `CI-C1.2` Code context injection into system prompt (`<codebase_context>` block, 8K cap)
- `CI-C1.3` `CodeContextIndicator` UI
- `CI-C2.1` `codeResponseProcessor.ts`: diff engine, path hint detection
- `CI-C2.2` DiffViewer + CodeBlockActions + ApplyButton UI
- `CI-C2.3` Apply-to-file API (path traversal prevention, extension allowlist, 2MB limit)

---

## Environment Variables

```bash
DATABASE_URL=postgresql://...
SESSION_SECRET=...
ENCRYPTION_KEY=...       # Must be exactly 32 bytes
OPENROUTER_API_KEY=sk-or-...
APP_URL=http://localhost:5000
NOTION_API_KEY=secret_...
NOTION_MEMORY_DATABASE_ID=...
OBSIDIAN_VAULT_PATH=/path/to/vault   # optional — can be set per-user in settings
```

---

## Notes for Claude Code

- TypeScript monorepo: frontend in `client/`, backend in `server/`, shared types in `shared/`.
- Drizzle ORM for all DB operations — never raw SQL.
- Use existing shadcn/ui components where possible.
- All new server modules: named exports, not default exports.
- Error handling: wrap all AI calls in try/catch; fall through to base behavior on failure.
- Never `console.log` sensitive data (API keys, user messages).
- Run `npm run dev` to start frontend + backend concurrently.
- Shell-quoted paths are stripped server-side before `fs.access()` — see A8 in `docs/spec/additional-features.md`.
- Route order matters in `App.tsx`: specific routes (e.g. `/projects/:id/edit`) before wildcards (e.g. `/projects/:id`).
