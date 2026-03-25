# InquiroAI — Sprint 2 Build Plan
> Generated: 2026-03-25
> Roadmap source: `InquiroAI_Unified_Roadmap.xlsx` (Sprints 5 + 6)
> Asana project: **Create new** "InquiroAI — Sprint 2 Build" (separate from Sprint 1 Build)
> Timeline: Apr 3 – Apr 23, 2026 (~18 working days)

---

## Context: Where We Are

| Sprint (Roadmap) | Dates | Theme | Status |
|---|---|---|---|
| Sprint 1 | Mar 1–12 | Foundation + AI Backend (Layers 0–2) | ✅ Done |
| Sprint 2 | Mar 12–21 | Intelligence + Memory (Layers 3–4) | ✅ Done |
| Sprint 3 | Mar 21–24 | Design Polish + Auto Selection | ✅ Done |
| Sprint 4 | Mar 25 – Apr 2 | UX Completion (D4–D9) | ✅ Done |
| **Sprint 5** | **Apr 3–12** | **File Intelligence Tier 1** | **→ NEXT** |
| **Sprint 6** | **Apr 14–23** | **Code Intelligence C1+C2** | **→ NEXT** |

Sprint 2 Build (Asana) = Roadmap Sprints 5 + 6, plus carryovers.

---

## Carryovers from Sprint 1 Build

| Ticket | Title | Notes |
|---|---|---|
| **SEC-1** | Remove hardcoded OpenRouter key | Security — must ship before any sharing/demo |
| **B12** | Dark Mode | Low priority — push to end of sprint |

---

## Phase 1: File Intelligence — Tier 1 (Sprint 5)

**Goal:** Replace the fragile "dump full text into `inputData`" pipeline with persistent, cached, reusable file records. A file extracted once is available to every chat in the project without re-extraction. AI receives structured `<file>` context instead of raw text blobs.

**Source spec:** `InquiroAI_File_Intelligence_Spec.md` — Tier 1 section

**Effort:** ~9 days | **Dates:** Apr 3–12

**Prerequisite:** Layer 0 (projects + local folder) — ✅ already built

---

### FI-T1.1 — Schema: `project_files` + `chat_files` tables

**Priority:** High | **Effort:** S (1–2 days) | **Due:** 2026-04-04

**What to build:**

Add two new tables to `shared/schema.ts`:

**`project_files`** — persistent store of extracted file content:
- `id`, `projectId` (FK), `fileName`, `relativePath`, `absolutePath`
- `fileType`, `fileSizeBytes`, `contentHash` (SHA-256)
- `extractedText` (full content), `extractedLength`, `extractionMethod`
- `extractionQuality` (good/partial/failed), `fileModifiedAt` (source mtime)
- `version` (increments on re-extraction), `metadata` (jsonb), `isActive`

**`chat_files`** — junction table (chat ↔ project_files):
- `id`, `chatId` (FK), `projectFileId` (FK), `attachedAt`, `detachedAt` (null = attached)

Update relations: `projectsRelations` → add `files: many(projectFiles)`, `chatsRelations` → add `files`, create `projectFilesRelations` + `chatFilesRelations`.

Run migration: `npx drizzle-kit generate && npx drizzle-kit migrate`

**Acceptance criteria:**
- [ ] Both tables created and migrated successfully
- [ ] Relations defined in schema
- [ ] Existing chats/projects unaffected (no breaking changes)
- [ ] `chat_files.detachedAt` is nullable (active attachment = null)

---

### FI-T1.2 — File Cache Service (extract + hash + dedup + change detection)

**Priority:** High | **Effort:** M (3–4 days) | **Due:** 2026-04-08

**What to build** in `server/services/fileCache.ts`:

```typescript
// Core functions to implement:
extractAndCache(projectId, absolutePath, relativePath) → ProjectFile
  // 1. Read file, compute SHA-256 hash
  // 2. Check if project_files record exists with same path + hash → return cached
  // 3. If hash changed (file modified): re-extract, increment version, update record
  // 4. If new file: extract via existing FileProcessor, insert record
  // 5. Return the project_files row

getProjectFiles(projectId) → ProjectFile[] + staleStatus
  // Compare stored fileModifiedAt + fileSizeBytes against current fs stats
  // Return each file with isStale: boolean

invalidateFile(projectFileId) → void
  // Mark isActive=false (soft delete), detach from all chats
```

Reuse existing `FileProcessor.extractText()` for the actual extraction — don't rewrite extraction logic.

**Security:** Validate all paths stay within `project.localFolderPath` (path traversal prevention — same check as existing file browse endpoint).

**Acceptance criteria:**
- [ ] First attachment of a file triggers extraction and stores in DB
- [ ] Second attachment of the same file (same hash) returns cached result instantly (no FileProcessor call)
- [ ] File modified on disk → `isStale: true` returned → re-extraction on next attach
- [ ] SHA-256 hash correctly computed and stored
- [ ] Path traversal attack returns 403

---

### FI-T1.3 — File API Endpoints (attach / detach / list-cached)

**Priority:** High | **Effort:** S (1–2 days) | **Due:** 2026-04-09

**What to build** in `server/routes.ts`:

```
POST /api/projects/:id/files/attach
  Body: { relativePath: string }
  → Calls extractAndCache(), creates project_files record if needed
  → Returns: ProjectFile (with extractedText, metadata)

DELETE /api/projects/:id/files/:fileId
  → Soft-deletes from project_files (isActive=false)
  → Sets detachedAt on all active chat_files rows for this file

POST /api/chats/:chatId/files/attach
  Body: { projectFileId: number }
  → Creates chat_files row (attachedAt = now, detachedAt = null)
  → Returns the updated chat_files list

DELETE /api/chats/:chatId/files/:chatFileId
  → Sets detachedAt = now on the chat_files row
  → Does NOT delete project_files record (file stays cached for project)

GET /api/projects/:id/files/cached
  → Returns project_files list with stale detection (isStale boolean per file)
  → Used by upgraded FileBrowser to show cached vs fresh files
```

**Acceptance criteria:**
- [ ] Attach endpoint returns cached content without re-extraction if already stored
- [ ] Detach from chat removes `chat_files` row but preserves `project_files`
- [ ] Cached endpoint correctly flags stale files (mtime changed since extraction)
- [ ] All endpoints enforce userId ownership check

---

### FI-T1.4 — Structured `<file>` Prompt Assembly

**Priority:** High | **Effort:** S (1–2 days) | **Due:** 2026-04-09

**What to build** in `server/services/promptService.ts` and message pipeline:

Replace the current `{inputData}` raw text dump with structured file context assembled from `chat_files`:

```
<files>
  <file name="regulatory-framework.pdf" type="pdf" size="1.2MB" extracted="2026-04-03">
    [extracted text content]
  </file>
  <file name="data-model-v2.md" type="md" size="24KB" extracted="2026-04-03">
    [extracted text content]
  </file>
</files>
```

Implementation:
- Before building the system prompt, query `chat_files` for the current chat (where `detachedAt IS NULL`)
- Join to `project_files` to get `extractedText` + metadata
- Assemble `<files>` block and inject into system prompt in place of (or in addition to) `{inputData}`
- If `chat_files` is empty, fall back to `{inputData}` (backward-compatible for standalone chats)
- Token budget: if total file content > 30K tokens, truncate each file proportionally with a `[TRUNCATED — X chars omitted]` marker

**Acceptance criteria:**
- [ ] System prompt shows `<file name="...">` format for attached files
- [ ] File metadata (name, type, size, extraction date) in each `<file>` tag
- [ ] Truncation applied when total exceeds 30K tokens
- [ ] Backward-compatible: standalone chats with `inputData` still work
- [ ] AI responses can reference files by name

---

### FI-T1.5 — FileBrowser Upgrade (cached files + stale detection)

**Priority:** Medium | **Effort:** M (2–3 days) | **Due:** 2026-04-11

**What to build** in `client/src/components/FileBrowser.tsx`:

Upgrade the existing FileBrowser component to show two sections:

**Section 1: Cached files (previously extracted)**
- Show files from `GET /api/projects/:id/files/cached`
- Each row: filename, type icon, size, "Extracted [date ago]"
- If `isStale: true`: show orange "Updated — re-extract?" badge
- Attach action: instant (no extraction wait) — calls `POST /api/chats/:chatId/files/attach` with `projectFileId`

**Section 2: All project files (from folder)**
- Existing behavior: files from `GET /api/projects/:id/files`
- If a file is already cached (matched by `relativePath`): show "Cached ✓" badge
- Attach action: triggers extraction + caching, then attaches

**Footer:** "N files attached" pill bar (see FI-T1.6)

**Acceptance criteria:**
- [ ] Cached section shows only files with `project_files` records
- [ ] Stale files show orange badge with re-extract option
- [ ] Attaching a cached file is instant (spinner < 200ms)
- [ ] Attaching an uncached file shows extraction spinner, then confirms
- [ ] Both sections visible in the same FileBrowser modal

---

### FI-T1.6 — Chat Attached-Files Pill Bar

**Priority:** Medium | **Effort:** S (1 day) | **Due:** 2026-04-12

**What to build** in `client/src/components/ChatInterface.tsx`:

Below the chat title / above the message list, show attached files as removable pills:

```
📄 regulatory-framework.pdf  ×    📊 compliance-matrix.xlsx  ×    + Attach file
```

- Pills: `bg-blue-50 border border-blue-200 rounded-full px-3 py-1 text-xs flex items-center gap-1.5`
- `×` button: calls `DELETE /api/chats/:chatId/files/:chatFileId`, removes pill + shows toast
- `+ Attach file` opens FileBrowser modal
- Pills shown only when `chat_files` has active records (`detachedAt IS NULL`)
- On hover: show tooltip with file size + extraction date
- If no files: show nothing (don't show empty state here — clutter)

**Acceptance criteria:**
- [ ] Pills appear above message list when files are attached
- [ ] `×` removes the file from the chat (server call + UI update)
- [ ] `+ Attach file` opens FileBrowser
- [ ] Pill tooltip shows file size and when it was extracted
- [ ] No pills shown when no files attached (zero empty state clutter)

---

## Phase 2: Code Intelligence — C1 + C2 (Sprint 6)

**Goal:** When a chat involves a project with a local codebase, automatically assemble structured project context (stack, schema, patterns) and inject it into the system prompt. AI responses containing code blocks get diff preview + one-click apply-to-file.

**Source spec:** `InquiroAI_Code_Intelligence_Spec.md` — Capabilities C1 + C2

**Effort:** ~9 days | **Dates:** Apr 14–23

**Prerequisites:** Layer 0 (local folder), Layer 2 (evaluator classifies `code_generation`/`code_review`)

---

### CI-C1.1 — codeContextAssembler.ts (stack detection + schema reading)

**Priority:** High | **Effort:** M (3–4 days) | **Due:** 2026-04-17

**What to build** in `server/services/codeContextAssembler.ts`:

```typescript
export interface ProjectCodeContext {
  stack: {
    languages: string[];          // ['TypeScript', 'Python']
    frameworks: string[];         // ['React', 'Express', 'Drizzle ORM']
    packageManager: string;       // 'npm' | 'yarn' | 'pnpm' | 'pip'
    testFramework?: string;       // 'vitest' | 'jest' | 'pytest'
  };
  schema?: string;                // Drizzle/Prisma schema content (if found)
  entryPoints: string[];          // ['server/index.ts', 'client/src/main.tsx']
  recentFiles: FileSnippet[];     // Last-modified files (up to 10, first 100 lines each)
  conventions: string[];          // Inferred patterns: 'uses React Query', 'Drizzle ORM', etc.
  projectProfile: string;         // 1-paragraph description assembled from above
}

export async function assembleCodeContext(
  projectId: number,
  folderPath: string
): Promise<ProjectCodeContext>
```

Detection logic (scan project folder, read key files):
- `package.json` / `pyproject.toml` → stack, dependencies, scripts
- `shared/schema.ts` / `prisma/schema.prisma` / `*.sql` → DB schema
- `tsconfig.json`, `.eslintrc`, `vite.config.ts` → TypeScript config
- Top-level `*.ts`, `*.py` files → entry points
- Last-modified source files → recent work context

Cache assembled context in memory (per projectId) with 5-minute TTL — don't rescan on every message.

**Acceptance criteria:**
- [ ] `assembleCodeContext()` returns correct `stack` for TypeScript/React/Drizzle project
- [ ] Schema file content included when `shared/schema.ts` exists
- [ ] `recentFiles` contains the 10 most recently modified `.ts`/`.tsx`/`.py` files (first 100 lines each)
- [ ] In-memory cache prevents rescan within 5 minutes
- [ ] Runs in < 500ms on a 500-file project

---

### CI-C1.2 — Code Context Injection into System Prompt

**Priority:** High | **Effort:** S (1 day) | **Due:** 2026-04-18

**What to build** in the message pipeline (`server/routes.ts` or message handler):

After prompt evaluation, if `promptType` is `code_generation`, `code_review`, or `code_refactor` AND the chat belongs to a project with `localFolderPath`:

1. Call `assembleCodeContext(projectId, folderPath)`
2. Build a structured `<codebase_context>` block:

```xml
<codebase_context>
  <stack>TypeScript · React 18 · Node.js/Express · PostgreSQL/Drizzle ORM · Vite · shadcn/ui</stack>
  <schema_excerpt>[first 200 lines of shared/schema.ts]</schema_excerpt>
  <recent_files>
    <file path="server/routes.ts" modified="2026-04-03">[first 100 lines]</file>
    ...
  </recent_files>
  <conventions>Uses React Query for server state · Drizzle ORM (never raw SQL) · zod for validation · shadcn/ui components</conventions>
</codebase_context>
```

3. Inject this block into the system prompt before `{context}`
4. Token budget: cap at 8K tokens for code context block; truncate least-recently-modified files first

**Acceptance criteria:**
- [ ] Code context injected only for `code_*` prompt types with a project folder set
- [ ] Non-code prompts unaffected (zero overhead)
- [ ] Token cap enforced (8K max for code context block)
- [ ] `<codebase_context>` visible in system prompt when debugging

---

### CI-C1.3 — CodeContextIndicator UI Component

**Priority:** Medium | **Effort:** S (1 day) | **Due:** 2026-04-18

**What to build** in `client/src/components/CodeContextIndicator.tsx`:

A subtle indicator in the chat input area (visible only for project chats with a local folder) showing what codebase context was loaded:

```
🗂️ Codebase context loaded: TypeScript · React · Drizzle  [details →]
```

- Shown below the message input, above the context status bar
- Clicking "details →" expands a small popover listing:
  - Stack detected
  - Schema file found (yes/no)
  - Recent files loaded (file list with paths)
  - "Context refreshed N minutes ago"
- Only visible when last message had `code_*` prompt classification
- If no project folder: component renders null

**Acceptance criteria:**
- [ ] Indicator shows for code prompts in project chats with `localFolderPath`
- [ ] Hidden for non-code prompts and standalone chats
- [ ] Popover shows correct stack + files from last context assembly
- [ ] "Context refreshed X min ago" reflects cache age

---

### CI-C2.1 — codeResponseProcessor.ts (diff engine)

**Priority:** High | **Effort:** M (3–4 days) | **Due:** 2026-04-21

**What to build** in `server/services/codeResponseProcessor.ts`:

Post-process AI responses to detect code blocks that represent modifications to existing files, and generate unified diffs:

```typescript
export interface ProcessedCodeBlock {
  language: string;
  content: string;
  type: 'new_file' | 'modification' | 'snippet';
  targetFile?: string;          // Detected from comments: "// server/routes.ts" or path in context
  diff?: string;                // Unified diff if targetFile exists on disk
  lineRange?: [number, number]; // Which lines to replace (if partial modification)
}

export async function processCodeResponse(
  responseText: string,
  projectFolderPath: string | null
): Promise<ProcessedCodeBlock[]>
```

Detection logic:
- Extract all fenced code blocks from response
- Look for file path hints: `// path/to/file.ts`, `# file: path.py`, first-line comments, markdown headings before the block
- If target file exists in project folder: read it, generate unified diff between current content and the proposed code block
- Diff format: standard unified diff (compatible with `patch` command)
- `type: 'modification'` if target file found; `type: 'new_file'` if path hinted but file doesn't exist; `type: 'snippet'` if no file context

**Acceptance criteria:**
- [ ] Code blocks with path hints correctly identified as `modification` or `new_file`
- [ ] Unified diff generated correctly against current file content
- [ ] Snippets (no file context) identified as `type: 'snippet'`
- [ ] Does not crash if project folder null (standalone chats)
- [ ] Handles multi-block responses (multiple files modified in one response)

---

### CI-C2.2 — DiffViewer + CodeBlockActions + ApplyButton UI

**Priority:** High | **Effort:** M (3–4 days) | **Due:** 2026-04-22

**What to build** in `client/src/components/`:

**DiffViewer.tsx** — renders unified diffs inline in chat messages:
- Shows removed lines in red (`bg-red-50 text-red-800`), added lines in green (`bg-green-50 text-green-800`)
- Toggle between "Diff view" and "Full file view"
- Line numbers shown on left
- File path shown as header: `📄 server/routes.ts`

**CodeBlockActions.tsx** — action bar shown below each code block:
- For `modification`/`new_file` blocks: `[View Diff]` `[Apply to File]` `[Copy]`
- For `snippet` blocks: `[Copy]` only
- `[View Diff]` toggles DiffViewer inline
- `[Apply to File]` button — calls apply endpoint (CI-C2.3)
- Shows target file path as a small label: `→ server/routes.ts`

Integration in `ChatInterface.tsx`:
- After streaming completes, run processed code blocks through `processCodeResponse()`
- Attach `ProcessedCodeBlock` metadata to each rendered code block
- Render `CodeBlockActions` below each code block that has metadata

**Acceptance criteria:**
- [ ] DiffViewer shows red/green diff for modification blocks
- [ ] "Apply to File" button visible for modification/new_file blocks
- [ ] "Copy" button works for all code blocks
- [ ] Diff view togglable (collapsed by default, expanded on click)
- [ ] Target file path shown next to Apply button

---

### CI-C2.3 — Apply-to-File API Endpoint (with security)

**Priority:** High | **Effort:** S (1–2 days) | **Due:** 2026-04-23

**What to build** in `server/routes.ts`:

```
POST /api/projects/:projectId/apply-code
Body: {
  targetRelativePath: string,  // Relative to project localFolderPath
  content: string,             // Full new file content (not diff — apply full replacement)
  backupOriginal: boolean      // If true, write .bak file before overwriting
}
Response: { success: boolean, path: string, bytesWritten: number, backupPath?: string }
```

Security requirements (non-negotiable):
1. Path traversal prevention: `resolved = path.resolve(folderPath, targetRelativePath)` must start with `path.resolve(folderPath)`
2. Extension allowlist: only write `.ts`, `.tsx`, `.js`, `.jsx`, `.py`, `.md`, `.json`, `.yaml`, `.yml`, `.css`, `.html`, `.sql`
3. Size limit: reject files > 2MB
4. User ownership: validate `projectId` belongs to authenticated user
5. No write outside project folder — ever

Backup logic: if `backupOriginal: true`, copy existing file to `{filename}.bak` before overwriting.

**Acceptance criteria:**
- [ ] File written correctly to target path
- [ ] Path traversal attack (`../../etc/passwd`) returns 403
- [ ] Disallowed extension (`.env`, `.sh`, `.exe`) returns 400
- [ ] File > 2MB returns 413
- [ ] Backup created when `backupOriginal: true` and file exists
- [ ] Non-existent target path (new file) created successfully

---

## Carryover: B12 — Dark Mode

**Priority:** Low | **Effort:** M | **Due:** 2026-04-23

Implement dark mode using Tailwind's `dark:` variant + `class` strategy:
- Toggle in Settings page + keyboard shortcut
- Persist to `localStorage`
- Apply `dark` class to `<html>` element
- Update all hardcoded `bg-white`, `text-gray-900`, `border-gray-200` to use dark variants
- Core components to update: Sidebar, ChatInterface, Dashboard, all form Cards, all modals

---

## Carryover: SEC-1 — Remove Hardcoded OpenRouter Key

**Priority:** High | **Effort:** S | **Due:** 2026-04-04

Search codebase for any hardcoded API keys, particularly the OpenRouter key. Replace with proper `process.env.OPENROUTER_API_KEY` usage. Verify `.env` is in `.gitignore`. Rotate the key if it was ever committed to git history.

---

## Summary Table

| Ticket | Title | Phase | Priority | Effort | Due |
|---|---|---|---|---|---|
| SEC-1 | Remove hardcoded OpenRouter key | Carryover | 🔴 High | S | Apr 4 |
| FI-T1.1 | Schema: project_files + chat_files | Phase 1 | 🔴 High | S | Apr 4 |
| FI-T1.2 | File cache service (extract + hash + dedup) | Phase 1 | 🔴 High | M | Apr 8 |
| FI-T1.3 | File API endpoints (attach/detach/cached) | Phase 1 | 🔴 High | S | Apr 9 |
| FI-T1.4 | Structured `<file>` prompt assembly | Phase 1 | 🔴 High | S | Apr 9 |
| FI-T1.5 | FileBrowser upgrade (cached + stale detection) | Phase 1 | 🟡 Medium | M | Apr 11 |
| FI-T1.6 | Chat attached-files pill bar | Phase 1 | 🟡 Medium | S | Apr 12 |
| CI-C1.1 | codeContextAssembler.ts | Phase 2 | 🔴 High | M | Apr 17 |
| CI-C1.2 | Code context injection into system prompt | Phase 2 | 🔴 High | S | Apr 18 |
| CI-C1.3 | CodeContextIndicator UI | Phase 2 | 🟡 Medium | S | Apr 18 |
| CI-C2.1 | codeResponseProcessor.ts (diff engine) | Phase 2 | 🔴 High | M | Apr 21 |
| CI-C2.2 | DiffViewer + CodeBlockActions + ApplyButton | Phase 2 | 🔴 High | M | Apr 22 |
| CI-C2.3 | Apply-to-file API endpoint (security) | Phase 2 | 🔴 High | S | Apr 23 |
| B12 | Dark Mode | Carryover | 🟢 Low | M | Apr 23 |

---

## Dependency Order

```
SEC-1 (do first — security)

FI-T1.1 (schema migrations — must be first)
  └── FI-T1.2 (file cache service — needs tables)
        ├── FI-T1.3 (API endpoints — needs cache service)
        │     ├── FI-T1.4 (prompt assembly — needs endpoints)
        │     └── FI-T1.5 (FileBrowser upgrade — needs cached endpoint)
        │           └── FI-T1.6 (pill bar — needs attach endpoint)

CI-C1.1 (code context assembler — standalone)
  ├── CI-C1.2 (injection — needs assembler)
  │     └── CI-C1.3 (UI indicator — needs injection)
  └── CI-C2.1 (diff engine — needs folder context)
        ├── CI-C2.2 (diff UI — needs processed blocks)
        │     └── (wait for streaming complete)
        └── CI-C2.3 (apply endpoint — independent of UI, do in parallel)

B12 (parallel — no dependencies on Phase 1 or 2)
```

---

## Asana Project Setup

**Recommendation: Create new project** "InquiroAI — Sprint 2 Build"

Rationale:
- Sprint 1 Build has 55 tasks (51 complete) — cluttered
- Clean separation keeps velocity metrics meaningful
- Carryovers (B12, SEC-1) move from Sprint 1 → Sprint 2

**Sections in new project:**
1. `Carryovers` — SEC-1, B12
2. `Phase 1: File Intelligence — Tier 1` — FI-T1.1 through FI-T1.6
3. `Phase 2: Code Intelligence — C1 + C2` — CI-C1.1 through CI-C2.3

---

## CLAUDE.md Split Recommendation

The current `CLAUDE.md` is **1,743 lines / 71KB** — too large to load as context on every conversation.

**What to keep in CLAUDE.md** (~200 lines):
- Project overview + Golden Rules (unchanged)
- Stack (unchanged)
- What's Already Built: status table only (2 lines per feature, not full specs)
- Current sprint pointer: "Sprint 2 Build — see `docs/SPRINT2_PLAN.md`"
- Environment variables list

**What to split out:**
- `docs/spec/layers.md` — Layer 0–5 detailed implementation specs (currently in CLAUDE.md lines 40–900)
- `docs/spec/file-intelligence.md` — Link/embed from `InquiroAI_File_Intelligence_Spec.md`
- `docs/spec/code-intelligence.md` — Link/embed from `InquiroAI_Code_Intelligence_Spec.md`
- `docs/spec/design-decisions.md` — Sprint 3 design decisions (D1–D9, A1–A9)

Benefit: CLAUDE.md loads in < 5s; spec files read on demand when working on specific features.

---

*Generated: 2026-03-25 | Source: InquiroAI_Unified_Roadmap.xlsx (Sprints 5+6)*
