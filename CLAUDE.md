# CLAUDE.md — InquiroAI Development Spec

## Project Overview

InquiroAI is a domain expert's AI operating system — a multi-model chat platform with persistent memory,
prompt intelligence, and structured output generation. It is NOT a generic AI chat wrapper.

**Repo:** https://github.com/suryaghoshal5/inquiroai  
**Stack:** React 18 + TypeScript + Vite + Tailwind + shadcn/ui (frontend) | Node.js + Express + PostgreSQL/Neon + Drizzle ORM (backend)  
**Current State:** Base application is FUNCTIONAL. Do NOT rebuild from scratch.  
**Your job:** Add 6 capability layers on top of the existing codebase (Layer 0 is the new project-centric architecture).

---

## Golden Rules

1. **Never rewrite working code.** Extend, don't replace.
2. **Every AI call goes through the new pipeline** — Evaluator → Router → Context Manager → OpenRouter → Response.
3. **Fail gracefully.** If any layer (evaluator, router, summarizer) fails, fall through silently to the base AI call.
4. **OpenRouter is the only AI backend.** Remove all direct provider API calls.
5. **TypeScript strict mode everywhere.** No `any` types.
6. **Environment variables** for all secrets — never hardcoded.

---

## What Is Already Built (Do Not Touch Unless Instructed)

> **Note:** Layer 1 (OpenRouter) and Layer 2 backend (Evaluator + Router) are already implemented.
> The `prompt_intelligence` table exists in schema. Layer 2 frontend + wiring, Layers 3-4 are NOT yet built.

| Module | Location | Status |
|--------|----------|--------|
| Multi-chat management | `client/src/pages/` | ✅ Working |
| Role-based prompting (6 roles) | `server/roles/` | ✅ Working |
| Structured 9-field chat form | `client/src/components/` | ✅ Working |
| BYOK API key management (AES-256-GCM) | `server/crypto.ts` | ✅ Working |
| File upload + extraction (PDF/XLSX/DOCX/MD) | `server/fileProcessor.ts` | ✅ Working |
| HTTP POST chat messaging | `server/routes/` | ✅ Working |
| Markdown rendering | `client/src/components/` | ✅ Working |
| Chat export (PDF/MD/DOCX) | `server/export.ts` | ✅ Working |
| Dynamic model list + refresh | `server/modelUpdater.ts` | ✅ Working |
| Auth (mock user in dev, Replit Auth in prod) | `server/auth.ts` | ✅ Working |
| PostgreSQL schema (Drizzle) | `shared/schema.ts` | ✅ Working |

---

## Layer 0 — Project Entity & Local Folder Access

**Goal:** Introduce a `projects` table as the parent container for chats. A project holds the reusable brief (Context, Role, Constraints, Audience, Examples, Optional) and a reference to a local folder. Chats inherit project defaults but can override any field. Task and Input Data are always chat-specific.

### Why
- The current "Create New Chat" form is really a project brief — users shouldn't re-enter Context, Audience, Constraints for every chat within the same initiative.
- Local folder access gives the AI grounding in real project files (code, docs, data) without full RAG complexity.
- This aligns InquiroAI with how domain experts actually work: one initiative → many conversations.

### Data Model

```
┌──────────────────────────────────────────────────────┐
│ PROJECT                                              │
│ name, description, role, context, constraints,       │
│ audience, examples, optional, default_model,         │
│ local_folder_path                                    │
│                                                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────┐   │
│  │ Chat A       │  │ Chat B       │  │ Chat C   │   │
│  │ task, input  │  │ task, input  │  │ task     │   │
│  │ (inherits)   │  │ (overrides   │  │ (inherits│   │
│  │              │  │  model)      │  │  all)    │   │
│  └──────────────┘  └──────────────┘  └──────────┘   │
└──────────────────────────────────────────────────────┘
```

### Field Ownership Matrix

| Field | Project-level | Chat-level | Behavior |
|-------|:---:|:---:|------|
| name / title | ✅ project name | ✅ chat title | Independent |
| description | ✅ | — | Project overview for sidebar |
| role + customRole | ✅ default | ✅ override | Chat inherits; user can change per-chat |
| context | ✅ default | ✅ override | Chat inherits; user can append or replace |
| constraints | ✅ default | ✅ override | Chat inherits |
| audience | ✅ default | ✅ override | Chat inherits |
| examples | ✅ default | ✅ override | Chat inherits |
| optional | ✅ default | ✅ override | Chat inherits |
| aiProvider + aiModel | ✅ default | ✅ override | Chat inherits; router can also override |
| task | — | ✅ required | Always chat-specific |
| inputData | — | ✅ optional | Always chat-specific; can browse from project folder |
| local_folder_path | ✅ | — | Set once at project level |

### Tasks

#### 0.1 Create `projects` table in `shared/schema.ts`

```typescript
export const projects = pgTable("projects", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 200 }).notNull(),
  description: text("description"),
  role: varchar("role"),               // Default role for all chats
  customRole: text("custom_role"),
  context: text("context"),            // Reusable project context
  constraints: text("constraints"),
  audience: text("audience"),
  examples: text("examples"),
  optional: text("optional"),
  aiProvider: varchar("ai_provider"),  // Default provider
  aiModel: varchar("ai_model"),        // Default model
  localFolderPath: text("local_folder_path"),  // Absolute path to project folder
  configuration: jsonb("configuration"),        // Extensible metadata
  isArchived: boolean("is_archived").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});
```

#### 0.2 Add `projectId` foreign key to `chats` table

```typescript
// Add to existing chats table:
projectId: integer("project_id").references(() => projects.id, { onDelete: "set null" }),
```

**Migration strategy:** `projectId` is nullable. Existing chats (with no project) continue to work as standalone chats — no data migration required.

#### 0.3 Update relations in `shared/schema.ts`

```typescript
export const projectsRelations = relations(projects, ({ one, many }) => ({
  user: one(users, {
    fields: [projects.userId],
    references: [users.id],
  }),
  chats: many(chats),
}));

// Update existing chatsRelations to include project:
export const chatsRelations = relations(chats, ({ one, many }) => ({
  user: one(users, { fields: [chats.userId], references: [users.id] }),
  project: one(projects, { fields: [chats.projectId], references: [projects.id] }),
  messages: many(messages),
}));

// Update usersRelations to include projects:
export const usersRelations = relations(users, ({ many }) => ({
  chats: many(chats),
  apiKeys: many(apiKeys),
  projects: many(projects),
}));
```

#### 0.4 Add Zod schemas and types

```typescript
export const insertProjectSchema = createInsertSchema(projects);
export type InsertProject = z.infer<typeof insertProjectSchema>;
export type Project = typeof projects.$inferSelect;

export const projectConfigSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(5000).optional(),
  role: z.enum(["researcher", "product_manager", "developer", "content_writer", "designer", "presales_consultant", "custom"]).optional(),
  customRole: z.string().optional(),
  context: z.string().max(50000).optional(),
  constraints: z.string().max(50000).optional(),
  audience: z.string().max(50000).optional(),
  examples: z.string().max(50000).optional(),
  optional: z.string().max(50000).optional(),
  aiProvider: z.string().optional(),
  aiModel: z.string().optional(),
  localFolderPath: z.string().optional(),
});

export type ProjectConfig = z.infer<typeof projectConfigSchema>;
```

#### 0.5 Create project API routes in `server/routes/`

```
POST   /api/projects                    → Create project
GET    /api/projects                    → List user's projects
GET    /api/projects/:id                → Get project with chat list
PATCH  /api/projects/:id                → Update project fields
DELETE /api/projects/:id                → Soft-delete (set isArchived=true)
GET    /api/projects/:id/files          → List files in project's local folder
GET    /api/projects/:id/files/:path    → Read/extract a specific file for attachment
POST   /api/projects/:id/chats          → Create chat within project (inherits defaults)
```

**Chat creation within a project:**
When `POST /api/projects/:id/chats` is called, the server merges project defaults with chat-specific overrides:

```typescript
async function createProjectChat(projectId: number, chatOverrides: Partial<ChatConfig>) {
  const project = await db.query.projects.findFirst({ where: eq(projects.id, projectId) });
  if (!project) throw new Error('Project not found');

  // Merge: chat overrides take precedence over project defaults
  const mergedConfig = {
    role: chatOverrides.role || project.role || 'researcher',
    customRole: chatOverrides.customRole || project.customRole,
    context: chatOverrides.context || project.context || '',
    constraints: chatOverrides.constraints || project.constraints || '',
    audience: chatOverrides.audience || project.audience || '',
    examples: chatOverrides.examples || project.examples || '',
    optional: chatOverrides.optional || project.optional || '',
    aiProvider: chatOverrides.aiProvider || project.aiProvider || 'openai',
    aiModel: chatOverrides.aiModel || project.aiModel || 'gpt-4o',
    // Always chat-specific:
    title: chatOverrides.title || 'New Chat',
    task: chatOverrides.task || '',
    inputData: chatOverrides.inputData || '',
  };

  return db.insert(chats).values({
    ...mergedConfig,
    userId: project.userId,
    projectId: project.id,
  }).returning();
}
```

#### 0.6 Local folder file browsing endpoint

```typescript
// GET /api/projects/:id/files
// Returns a flat list of files in the project's local folder (non-recursive by default)
// Query params: ?recursive=true&extensions=pdf,md,txt,docx,xlsx

import fs from 'fs/promises';
import path from 'path';

const ALLOWED_EXTENSIONS = new Set([
  '.pdf', '.md', '.txt', '.docx', '.doc', '.xlsx', '.xls', '.csv', '.json', '.yaml', '.yml',
  '.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs', '.java', '.html', '.css',
]);

const MAX_FOLDER_DEPTH = 3;       // Safety limit
const MAX_FILES_RETURNED = 500;   // Pagination guard

async function listProjectFiles(
  folderPath: string,
  recursive: boolean = false,
  extensionFilter?: string[]
): Promise<ProjectFile[]> {
  // Validate folder exists and is readable
  await fs.access(folderPath, fs.constants.R_OK);

  const files = await walkDirectory(folderPath, recursive ? MAX_FOLDER_DEPTH : 1);

  return files
    .filter(f => {
      const ext = path.extname(f.name).toLowerCase();
      if (extensionFilter?.length) return extensionFilter.includes(ext);
      return ALLOWED_EXTENSIONS.has(ext);
    })
    .slice(0, MAX_FILES_RETURNED)
    .map(f => ({
      name: f.name,
      relativePath: path.relative(folderPath, f.path),
      size: f.size,
      extension: path.extname(f.name).toLowerCase(),
      modifiedAt: f.modifiedAt,
    }));
}
```

#### 0.7 File extraction for chat attachment

```typescript
// GET /api/projects/:id/files/:relativePath
// Reads and extracts content from a file in the project folder
// Uses existing fileProcessor.ts logic for PDF/DOCX/XLSX extraction
// Returns: { content: string, fileName: string, fileType: string, size: number }

// SECURITY: Validate that relativePath resolves within localFolderPath (prevent path traversal)
function validatePath(basePath: string, relativePath: string): string {
  const resolved = path.resolve(basePath, relativePath);
  if (!resolved.startsWith(path.resolve(basePath))) {
    throw new Error('Path traversal detected');
  }
  return resolved;
}
```

#### 0.8 Frontend — Two-tier navigation

**Refactor the sidebar from a flat chat list to a project-grouped structure:**

```
┌─────────────────────────────┐
│ 🔍 Search                   │
│                             │
│ + New Project               │
│                             │
│ ▼ SmartKYC Chain            │   ← Project (collapsible)
│    ├ Regulatory mapping     │   ← Chat within project
│    ├ Data model review      │
│    └ + New Chat             │   ← Quick-create within project
│                             │
│ ▼ InquiroAI Dev             │
│    ├ OpenRouter migration   │
│    ├ Prompt eval testing    │
│    └ + New Chat             │
│                             │
│ ─── Standalone Chats ───    │   ← Legacy / no-project chats
│    ├ Quick question          │
│    └ Random brainstorm       │
└─────────────────────────────┘
```

#### 0.9 Frontend — Project creation page

**Replace the current "Create New Chat" as the default landing with a two-step flow:**

**Step 1: Create/Select Project** (the current form fields minus Task and Input Data)
- Project name
- Description (new — short summary of the initiative)
- Role selection
- Context, Constraints, Audience, Examples, Optional
- Default AI Engine
- Local folder path (file picker or paste path)
- "Create Project" button → navigates to project dashboard

**Step 2: Start Chat within Project** (lightweight form)
- Chat title
- Task (required)
- Input Data (optional — textarea + "Browse project files" button)
- AI Engine override (pre-filled from project default, editable)
- "Start Conversation" button

**The existing "Create New Chat" form should still be accessible** for standalone chats (no project). Add a toggle or separate entry point: "Quick Chat (no project)".

#### 0.10 Frontend — Project dashboard page

When you click a project in the sidebar, show a dashboard:
- Project name + description (editable inline)
- Project settings summary (role, model, folder path — click to edit)
- List of chats with last message preview + timestamp
- "New Chat" button
- "Browse Files" panel (if local folder is set) — shows files with click-to-preview
- "Archive Project" option

#### 0.11 Frontend — File browser component

```
┌─────────────────────────────────────────┐
│ 📁 Project Files: ~/projects/smartkyc   │
│                                         │
│ 📄 regulatory-framework.pdf    1.2 MB   │  [Attach]
│ 📄 data-model-v2.md           24 KB     │  [Attach]
│ 📊 compliance-matrix.xlsx     156 KB    │  [Attach]
│ 📁 src/                                 │  [Browse →]
│ 📁 docs/                                │  [Browse →]
│                                         │
│ Selected: 2 files                       │  [Attach to Chat]
└─────────────────────────────────────────┘
```

- Appears as a modal/drawer when user clicks "Browse project files" from the chat creation form
- File selection extracts content via `GET /api/projects/:id/files/:path` and appends to Input Data
- Shows file size, type icon, modified date
- Multi-select with "Attach to Chat" bulk action

### Security Considerations

1. **Path traversal prevention:** All file access endpoints must validate that resolved paths stay within the project's `localFolderPath`. Use `path.resolve()` + `startsWith()` check.
2. **File size limits:** Cap individual file extraction at 10MB (matches existing upload limit).
3. **No write access:** The server ONLY reads from the local folder. Never write, delete, or modify project files.
4. **Folder validation:** When setting `localFolderPath`, verify the folder exists and is readable. Store as absolute path.
5. **User isolation:** Enforce `userId` check on all project/file endpoints.

---

## Layer 1 — OpenRouter Migration

**Goal:** Replace all direct provider API calls (OpenAI, Gemini, Claude, Grok) with a single OpenRouter client.

### Why
- Single API key manages all models
- New models become available automatically without code changes
- Unified cost tracking across all providers
- Built-in fallback routing if a provider is down

### Tasks

#### 1.1 Install OpenRouter client
```bash
npm install openai  # OpenRouter uses OpenAI-compatible SDK
```

#### 1.2 Create `server/openrouter.ts`
```typescript
import OpenAI from 'openai';

export const openrouter = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY,
  defaultHeaders: {
    'HTTP-Referer': process.env.APP_URL || 'http://localhost:5000',
    'X-Title': 'InquiroAI',
  },
});

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface AICallResult {
  content: string;
  model: string;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  cost_usd: number;
}

export async function callAI(
  messages: ChatMessage[],
  model: string,
  systemPrompt?: string
): Promise<AICallResult> {
  const fullMessages: ChatMessage[] = systemPrompt
    ? [{ role: 'system', content: systemPrompt }, ...messages]
    : messages;

  const response = await openrouter.chat.completions.create({
    model,
    messages: fullMessages,
    stream: false,
  });

  const usage = response.usage!;
  // OpenRouter returns cost in credits; convert to USD approximation
  const cost_usd = (usage.prompt_tokens * 0.000003) + (usage.completion_tokens * 0.000015);

  return {
    content: response.choices[0].message.content || '',
    model: response.model,
    usage: {
      prompt_tokens: usage.prompt_tokens,
      completion_tokens: usage.completion_tokens,
      total_tokens: usage.total_tokens,
    },
    cost_usd,
  };
}
```

#### 1.3 Create `server/openrouter-models.ts`
Fetch and cache the live model catalog from OpenRouter daily.

```typescript
export interface OpenRouterModel {
  id: string;           // e.g. "anthropic/claude-sonnet-4-5"
  name: string;         // Human readable
  context_length: number;
  pricing: {
    prompt: string;     // USD per token
    completion: string;
  };
}

export async function fetchOpenRouterModels(): Promise<OpenRouterModel[]> {
  const response = await fetch('https://openrouter.ai/api/v1/models', {
    headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}` },
  });
  const data = await response.json();
  return data.data;
}
```

#### 1.4 Update `server/modelUpdater.ts`
Replace the existing per-provider model lists with OpenRouter model catalog fetch.
Map OpenRouter model IDs to the existing UI model selector format.

#### 1.5 Remove direct provider clients
Delete or stub out the existing per-provider AI client files. All AI calls now go through `callAI()` from `openrouter.ts`.

#### 1.6 New environment variables required
```
OPENROUTER_API_KEY=sk-or-...
APP_URL=http://localhost:5000
```

Remove: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_API_KEY`, `GROK_API_KEY` from server usage.
Note: Users' BYOK keys stored in DB are now deprecated — OpenRouter handles all routing. Keep the BYOK UI but add a note that OpenRouter key is used by default.

---

## Layer 2 — Prompt Intelligence Pipeline

**Goal:** Every user prompt passes through Evaluator → Router before hitting the AI.

### Architecture
```
User message
    │
    ▼
[EVALUATOR]  ← Fast call using openrouter: meta-llama/llama-3.1-8b-instruct (cheap + fast)
    │  Returns: { score, improved_prompt, prompt_type, complexity }
    ▼
[MODEL ROUTER]
    │  Returns: { recommended_model, estimated_cost, reasoning }
    ▼
[User sees recommendation + can override]
    │
    ▼
[CONTEXT MANAGER]  ← See Layer 3
    │
    ▼
[OpenRouter AI Call]
```

### Tasks

#### 2.1 Create `server/promptEvaluator.ts`

```typescript
export interface EvaluationResult {
  score: number;           // 1-10
  issues: string[];        // e.g. ["Missing output format", "No context provided"]
  improved_prompt: string; // Rewritten version
  prompt_type: PromptType;
  complexity: 'low' | 'medium' | 'high';
  show_suggestion: boolean; // Only show if score < 7
}

export type PromptType =
  | 'factual_qa'
  | 'code_generation'
  | 'code_review'
  | 'long_document_analysis'
  | 'creative_writing'
  | 'data_analysis'
  | 'regulatory_legal'
  | 'strategic_planning'
  | 'general';

const EVALUATOR_SYSTEM_PROMPT = `You are a prompt quality evaluator. Analyze the user's prompt and respond ONLY with valid JSON matching this exact schema:
{
  "score": <1-10 integer>,
  "issues": ["issue1", "issue2"],
  "improved_prompt": "<rewritten prompt>",
  "prompt_type": "<one of: factual_qa|code_generation|code_review|long_document_analysis|creative_writing|data_analysis|regulatory_legal|strategic_planning|general>",
  "complexity": "<low|medium|high>"
}

Scoring criteria:
- 9-10: Clear goal, sufficient context, specified format, well-constrained
- 7-8: Good but missing one element
- 5-6: Unclear goal or missing significant context
- 1-4: Vague, ambiguous, or underspecified

For improved_prompt: rewrite to add clarity, context, and output specification. Keep the user's intent exactly.
Respond with JSON only. No markdown, no explanation.`;

export async function evaluatePrompt(prompt: string): Promise<EvaluationResult> {
  try {
    const result = await callAI(
      [{ role: 'user', content: `Evaluate this prompt:\n\n${prompt}` }],
      'meta-llama/llama-3.1-8b-instruct',  // Fast and cheap for evaluation
      EVALUATOR_SYSTEM_PROMPT
    );

    const parsed = JSON.parse(result.content);
    return {
      ...parsed,
      show_suggestion: parsed.score < 7,
    };
  } catch {
    // Silent fallthrough — never block the user
    return {
      score: 8,
      issues: [],
      improved_prompt: prompt,
      prompt_type: 'general',
      complexity: 'medium',
      show_suggestion: false,
    };
  }
}
```

#### 2.2 Create `server/modelRouter.ts`

```typescript
export interface ModelRecommendation {
  model: string;           // OpenRouter model ID
  display_name: string;
  reasoning: string;
  estimated_cost_per_1k_tokens: number;
  context_window: number;
}

// Routing matrix — update model IDs as OpenRouter catalog evolves
const ROUTING_MATRIX: Record<string, Record<string, ModelRecommendation>> = {
  factual_qa: {
    low:    { model: 'anthropic/claude-haiku-4-5', display_name: 'Claude Haiku', reasoning: 'Fast and accurate for simple Q&A', estimated_cost_per_1k_tokens: 0.001, context_window: 200000 },
    medium: { model: 'anthropic/claude-sonnet-4-5', display_name: 'Claude Sonnet', reasoning: 'Balanced for factual queries', estimated_cost_per_1k_tokens: 0.003, context_window: 200000 },
    high:   { model: 'anthropic/claude-sonnet-4-5', display_name: 'Claude Sonnet', reasoning: 'Complex factual reasoning', estimated_cost_per_1k_tokens: 0.003, context_window: 200000 },
  },
  code_generation: {
    low:    { model: 'anthropic/claude-haiku-4-5', display_name: 'Claude Haiku', reasoning: 'Simple code tasks', estimated_cost_per_1k_tokens: 0.001, context_window: 200000 },
    medium: { model: 'anthropic/claude-sonnet-4-5', display_name: 'Claude Sonnet', reasoning: 'Strong code generation', estimated_cost_per_1k_tokens: 0.003, context_window: 200000 },
    high:   { model: 'anthropic/claude-opus-4', display_name: 'Claude Opus', reasoning: 'Complex architecture and system design', estimated_cost_per_1k_tokens: 0.015, context_window: 200000 },
  },
  long_document_analysis: {
    low:    { model: 'google/gemini-1.5-flash', display_name: 'Gemini Flash', reasoning: 'Long context at low cost', estimated_cost_per_1k_tokens: 0.00035, context_window: 1000000 },
    medium: { model: 'google/gemini-1.5-pro', display_name: 'Gemini Pro', reasoning: 'Best-in-class long context', estimated_cost_per_1k_tokens: 0.00125, context_window: 1000000 },
    high:   { model: 'google/gemini-1.5-pro', display_name: 'Gemini Pro', reasoning: 'Million token context for large docs', estimated_cost_per_1k_tokens: 0.00125, context_window: 1000000 },
  },
  regulatory_legal: {
    low:    { model: 'anthropic/claude-sonnet-4-5', display_name: 'Claude Sonnet', reasoning: 'Precise regulatory interpretation', estimated_cost_per_1k_tokens: 0.003, context_window: 200000 },
    medium: { model: 'anthropic/claude-opus-4', display_name: 'Claude Opus', reasoning: 'High precision for legal/regulatory', estimated_cost_per_1k_tokens: 0.015, context_window: 200000 },
    high:   { model: 'anthropic/claude-opus-4', display_name: 'Claude Opus', reasoning: 'Maximum precision for compliance work', estimated_cost_per_1k_tokens: 0.015, context_window: 200000 },
  },
  strategic_planning: {
    low:    { model: 'anthropic/claude-sonnet-4-5', display_name: 'Claude Sonnet', reasoning: 'Strong strategic reasoning', estimated_cost_per_1k_tokens: 0.003, context_window: 200000 },
    medium: { model: 'anthropic/claude-opus-4', display_name: 'Claude Opus', reasoning: 'Deep strategic analysis', estimated_cost_per_1k_tokens: 0.015, context_window: 200000 },
    high:   { model: 'anthropic/claude-opus-4', display_name: 'Claude Opus', reasoning: 'Complex multi-dimensional strategy', estimated_cost_per_1k_tokens: 0.015, context_window: 200000 },
  },
  data_analysis: {
    low:    { model: 'openai/gpt-4o-mini', display_name: 'GPT-4o Mini', reasoning: 'Fast data interpretation', estimated_cost_per_1k_tokens: 0.00015, context_window: 128000 },
    medium: { model: 'openai/gpt-4o', display_name: 'GPT-4o', reasoning: 'Strong quantitative reasoning', estimated_cost_per_1k_tokens: 0.005, context_window: 128000 },
    high:   { model: 'openai/gpt-4o', display_name: 'GPT-4o', reasoning: 'Complex data analysis with code', estimated_cost_per_1k_tokens: 0.005, context_window: 128000 },
  },
  general: {
    low:    { model: 'anthropic/claude-haiku-4-5', display_name: 'Claude Haiku', reasoning: 'Fast general purpose', estimated_cost_per_1k_tokens: 0.001, context_window: 200000 },
    medium: { model: 'anthropic/claude-sonnet-4-5', display_name: 'Claude Sonnet', reasoning: 'Default workhorse', estimated_cost_per_1k_tokens: 0.003, context_window: 200000 },
    high:   { model: 'anthropic/claude-opus-4', display_name: 'Claude Opus', reasoning: 'Maximum capability', estimated_cost_per_1k_tokens: 0.015, context_window: 200000 },
  },
};

export function recommendModel(
  promptType: string,
  complexity: string
): ModelRecommendation {
  const typeMatrix = ROUTING_MATRIX[promptType] || ROUTING_MATRIX['general'];
  return typeMatrix[complexity] || typeMatrix['medium'];
}
```

#### 2.3 Update API route for chat messages

In `server/routes/messages.ts`, wrap every incoming message:

```typescript
// Before calling AI:
const evaluation = await evaluatePrompt(userMessage);
const recommendation = recommendModel(evaluation.prompt_type, evaluation.complexity);

// Return evaluation + recommendation to frontend BEFORE calling AI
// Frontend shows suggestion UI, user confirms or overrides model
// Then proceed with confirmed model
```

#### 2.4 Frontend — Prompt Suggestion UI

Add to `client/src/components/ChatInput.tsx`:

- After user submits message, show a non-blocking toast/banner:
  - "Prompt score: 6/10 — Suggestion available" with expand button
  - Expanded view shows improved prompt with "Use this" / "Keep mine" buttons
  - Model recommendation chip: "Recommended: Claude Opus (Complex regulatory query) · ~$0.02" with change button
  - Auto-dismiss after 8 seconds if user ignores
- **Never block the user.** If they ignore the suggestion, proceed with their original prompt and the recommended model.

#### 2.5 Database — Add `prompt_intelligence` table

```typescript
// In shared/schema.ts, add:
export const promptIntelligence = pgTable('prompt_intelligence', {
  id: serial('id').primaryKey(),
  messageId: integer('message_id').references(() => messages.id),
  chatId: integer('chat_id').references(() => chats.id),
  userId: text('user_id').references(() => users.id),
  originalPrompt: text('original_prompt').notNull(),
  improvedPrompt: text('improved_prompt'),
  promptType: text('prompt_type'),
  complexity: text('complexity'),
  score: integer('score'),
  modelRecommended: text('model_recommended'),
  modelUsed: text('model_used'),
  userAcceptedSuggestion: boolean('user_accepted_suggestion'),
  promptTokens: integer('prompt_tokens'),
  completionTokens: integer('completion_tokens'),
  costUsd: real('cost_usd'),
  createdAt: timestamp('created_at').defaultNow(),
});
```

---

## Layer 3 — Context Manager

**Goal:** Track token usage per conversation. Auto-summarize oldest messages at 70% of model context limit.

### Tasks

#### 3.1 Create `server/contextManager.ts`

```typescript
// Approximate token count (4 chars ≈ 1 token)
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function estimateMessagesTokens(messages: ChatMessage[]): number {
  return messages.reduce((sum, m) => sum + estimateTokens(m.content) + 10, 0);
}

// Context limits per model (tokens)
export const MODEL_CONTEXT_LIMITS: Record<string, number> = {
  'anthropic/claude-haiku-4-5':   200000,
  'anthropic/claude-sonnet-4-5':  200000,
  'anthropic/claude-opus-4':      200000,
  'openai/gpt-4o':                128000,
  'openai/gpt-4o-mini':           128000,
  'google/gemini-1.5-pro':        1000000,
  'google/gemini-1.5-flash':      1000000,
  default:                         128000,
};

export const COMPRESSION_THRESHOLD = 0.70; // Compress at 70% of limit

export interface ContextResult {
  messages: ChatMessage[];
  was_compressed: boolean;
  compression_count: number;
  current_tokens: number;
  limit_tokens: number;
}

export async function manageContext(
  messages: ChatMessage[],
  model: string,
  systemPrompt: string,
  existingCompressionCount: number
): Promise<ContextResult> {
  const limit = MODEL_CONTEXT_LIMITS[model] || MODEL_CONTEXT_LIMITS['default'];
  const threshold = Math.floor(limit * COMPRESSION_THRESHOLD);
  const systemTokens = estimateTokens(systemPrompt);
  const currentTokens = estimateMessagesTokens(messages) + systemTokens;

  if (currentTokens < threshold) {
    return {
      messages,
      was_compressed: false,
      compression_count: existingCompressionCount,
      current_tokens: currentTokens,
      limit_tokens: limit,
    };
  }

  // Keep last 4 messages verbatim — highest signal
  const recentMessages = messages.slice(-4);
  const olderMessages = messages.slice(0, -4);

  // Summarize older messages
  const conversationText = olderMessages
    .map(m => `${m.role.toUpperCase()}: ${m.content}`)
    .join('\n\n');

  const summaryResult = await callAI(
    [{
      role: 'user',
      content: `Summarize this conversation concisely, preserving all key decisions, facts, and context:\n\n${conversationText}`,
    }],
    'anthropic/claude-haiku-4-5',  // Always use cheapest model for compression
    'You are a conversation summarizer. Create dense, factual summaries. Preserve decisions, numbers, names, and action items.'
  );

  const compressionMarker = `[CONTEXT COMPRESSED ${new Date().toISOString()} — Compression #${existingCompressionCount + 1}]\n\n${summaryResult.content}`;

  const compressedMessages: ChatMessage[] = [
    { role: 'assistant', content: compressionMarker },
    ...recentMessages,
  ];

  return {
    messages: compressedMessages,
    was_compressed: true,
    compression_count: existingCompressionCount + 1,
    current_tokens: estimateMessagesTokens(compressedMessages) + systemTokens,
    limit_tokens: limit,
  };
}
```

#### 3.2 Update `shared/schema.ts`

Add to `chats` table:
```typescript
compressionCount: integer('compression_count').default(0),
totalTokensUsed: integer('total_tokens_used').default(0),
totalCostUsd: real('total_cost_usd').default(0),
```

#### 3.3 Frontend — Compression Indicator

Add a subtle status bar above the chat input showing:
- Token usage: `████████░░ 68% of context used`
- Compression count: `Compressed 2×` (shown only if > 0)
- Color: green < 50%, yellow 50–70%, orange 70–85%, red > 85%

---

## Layer 4 — Notion Memory Backend

**Goal:** At end of each session (or on demand), classify the chat and write a structured memory entry to Notion.

### Tasks

#### 4.1 Install Notion SDK
```bash
npm install @notionhq/client
```

#### 4.2 Create `server/notionMemory.ts`

```typescript
import { Client } from '@notionhq/client';

const notion = new Client({ auth: process.env.NOTION_API_KEY });
const DATABASE_ID = process.env.NOTION_MEMORY_DATABASE_ID!;

export interface ChatMemoryEntry {
  title: string;
  date: string;                  // ISO date
  platform: 'inquiroai';
  project: string;               // Classified project name
  tags: string[];                // e.g. ['legal', 'M&A', 'valuation']
  type: 'ANALYSIS' | 'RESEARCH' | 'BUILD' | 'BD' | 'OPS' | 'STRATEGY' | 'GEN';
  summary: string;               // 3 sentences max
  decisions: string[];           // Key decisions made
  open_questions: string[];      // Unresolved items
  full_transcript_url?: string;  // Link back to InquiroAI chat
  model_used: string;
  total_tokens: number;
  cost_usd: number;
}

export async function classifyAndArchiveChat(
  chatId: number,
  messages: ChatMessage[],
  metadata: { model: string; total_tokens: number; cost_usd: number; chat_url: string }
): Promise<ChatMemoryEntry> {
  // Step 1: Classify the chat using Claude
  const transcript = messages
    .map(m => `${m.role.toUpperCase()}: ${m.content.slice(0, 500)}`)
    .join('\n\n')
    .slice(0, 8000); // Limit for classification call

  const classificationResult = await callAI(
    [{
      role: 'user',
      content: `Analyze this conversation and respond ONLY with valid JSON:\n\n${transcript}`,
    }],
    'anthropic/claude-haiku-4-5',
    `You are a conversation classifier for a professional AI workspace. Respond ONLY with JSON matching exactly:
{
  "title": "<concise descriptive title under 60 chars>",
  "project": "<infer project name from context>",
  "tags": ["tag1", "tag2", "tag3"],
  "type": "<one of: ANALYSIS|RESEARCH|BUILD|BD|OPS|STRATEGY|GEN>",
  "summary": "<3 sentence summary>",
  "decisions": ["decision1", "decision2"],
  "open_questions": ["question1", "question2"]
}
No markdown, no explanation, JSON only.`
  );

  const classification = JSON.parse(classificationResult.content);

  const entry: ChatMemoryEntry = {
    ...classification,
    date: new Date().toISOString().split('T')[0],
    platform: 'inquiroai',
    full_transcript_url: metadata.chat_url,
    model_used: metadata.model,
    total_tokens: metadata.total_tokens,
    cost_usd: metadata.cost_usd,
  };

  // Step 2: Write to Notion
  await writeToNotion(entry);

  return entry;
}

async function writeToNotion(entry: ChatMemoryEntry): Promise<void> {
  await notion.pages.create({
    parent: { database_id: DATABASE_ID },
    properties: {
      Title: { title: [{ text: { content: entry.title } }] },
      Date: { date: { start: entry.date } },
      Project: { select: { name: entry.project } },
      Type: { select: { name: entry.type } },
      Tags: { multi_select: entry.tags.map(t => ({ name: t })) },
      Platform: { select: { name: entry.platform } },
      'Model Used': { rich_text: [{ text: { content: entry.model_used } }] },
      'Total Tokens': { number: entry.total_tokens },
      'Cost USD': { number: Math.round(entry.cost_usd * 10000) / 10000 },
    },
    children: [
      {
        object: 'block',
        type: 'heading_2',
        heading_2: { rich_text: [{ text: { content: 'Summary' } }] },
      },
      {
        object: 'block',
        type: 'paragraph',
        paragraph: { rich_text: [{ text: { content: entry.summary } }] },
      },
      {
        object: 'block',
        type: 'heading_2',
        heading_2: { rich_text: [{ text: { content: 'Key Decisions' } }] },
      },
      ...entry.decisions.map(d => ({
        object: 'block' as const,
        type: 'bulleted_list_item' as const,
        bulleted_list_item: { rich_text: [{ text: { content: d } }] },
      })),
      {
        object: 'block',
        type: 'heading_2',
        heading_2: { rich_text: [{ text: { content: 'Open Questions' } }] },
      },
      ...entry.open_questions.map(q => ({
        object: 'block' as const,
        type: 'bulleted_list_item' as const,
        bulleted_list_item: { rich_text: [{ text: { content: q } }] },
      })),
      ...(entry.full_transcript_url ? [{
        object: 'block' as const,
        type: 'bookmark' as const,
        bookmark: { url: entry.full_transcript_url },
      }] : []),
    ],
  });
}
```

#### 4.3 Notion Database Setup

Create a Notion database named **"InquiroAI Memory"** with these properties:

| Property | Type |
|----------|------|
| Title | Title |
| Date | Date |
| Project | Select |
| Type | Select (ANALYSIS, RESEARCH, BUILD, BD, OPS, STRATEGY, GEN) |
| Tags | Multi-select |
| Platform | Select |
| Model Used | Text |
| Total Tokens | Number |
| Cost USD | Number |

#### 4.4 Archive API endpoint

Add to `server/routes/`:
```
POST /api/chats/:chatId/archive
  → Triggers classifyAndArchiveChat()
  → Returns the ChatMemoryEntry
  → Updates chat record with notion_page_id
```

#### 4.5 Frontend — Archive Button

Add to chat interface header:
- "Archive to Memory" button (bookmark icon)
- On click: calls archive endpoint, shows success toast with Notion link
- Auto-archive trigger: when user closes/leaves a chat that has > 5 messages and hasn't been archived
- **Project-aware:** If chat belongs to a project, include `project.name` as the Notion `Project` property instead of inferring it from the transcript

#### 4.6 New environment variables required
```
NOTION_API_KEY=secret_...
NOTION_MEMORY_DATABASE_ID=...
```

---

## Layer 5 — Obsidian Knowledge Graph

**Goal:** Extract entities, concepts, decisions, and relationships from conversations and write them as interconnected markdown notes with bidirectional wikilinks into a local Obsidian vault. Complements Layer 4 (Notion) which serves as the structured session archive.

### Why
- Layer 4 (Notion) is a **session ledger** — one page per chat, good for searching "what did I discuss last Tuesday."
- Layer 5 (Obsidian) is a **knowledge graph** — entities and concepts accumulate across sessions, forming a web of interconnected knowledge that grows smarter over time.
- Domain experts (regulatory analysts, product strategists, researchers) need to see how concepts relate across projects, not just within a single chat.
- Obsidian's local-first markdown vault means the knowledge graph is yours forever — no vendor lock-in, no API dependency.

### Architecture

```
Chat ends (or user triggers "Extract to Graph")
    │
    ▼
[ENTITY EXTRACTOR]  ← Cheap model (Haiku) classifies entities from transcript
    │  Returns: { entities[], decisions[], concepts[], relationships[] }
    ▼
[GRAPH WRITER]
    │  For each entity: create or update a .md file in the vault
    │  Add wikilinks [[Entity B]] to establish relationships
    │  Add YAML frontmatter for metadata
    ▼
[OBSIDIAN VAULT]  ← Local folder, configurable path
    ├── projects/
    │   ├── SmartKYC Chain.md
    │   └── InquiroAI.md
    ├── decisions/
    │   ├── Use OpenRouter as sole backend.md
    │   └── Project entity inherits to chats.md
    ├── concepts/
    │   ├── Prompt Intelligence Pipeline.md
    │   └── Context Compression.md
    ├── people/
    │   └── (extracted from conversations)
    └── sessions/
        └── (lightweight session backlinks)
```

### Entity Types

| Type | Vault Folder | What Gets Extracted |
|------|-------------|---------------------|
| Project | `projects/` | Project name, description, status, linked decisions |
| Decision | `decisions/` | Key decision + rationale + date + which project/chat |
| Concept | `concepts/` | Technical concepts, frameworks, methodologies discussed |
| Person | `people/` | People mentioned with context (role, organization) |
| Open Question | `open-questions/` | Unresolved questions that span multiple sessions |
| Session | `sessions/` | Lightweight note linking back to Notion archive + related entities |

### Note Format

Each note follows this structure:

```markdown
---
type: decision
created: 2026-03-24
updated: 2026-03-24
source_chat_ids: [42, 67]
project: "[[InquiroAI]]"
tags: [architecture, openrouter, migration]
---

# Use OpenRouter as Sole AI Backend

## Decision
Replace all direct provider API calls (OpenAI, Gemini, Claude, Grok) with a single OpenRouter client.

## Rationale
- Single API key manages all models
- New models available automatically without code changes
- Unified cost tracking across all providers

## Related
- [[Prompt Intelligence Pipeline]] — depends on OpenRouter for evaluator calls
- [[Context Compression]] — uses cheap Haiku model via OpenRouter
- [[InquiroAI]] — parent project

## Source Sessions
- [[Session 2026-03-20 — OpenRouter Migration Planning]]
- [[Session 2026-03-22 — Layer 1 Implementation]]
```

### Tasks

#### 5.1 Create `server/obsidianGraph.ts`

```typescript
export interface GraphEntity {
  type: 'project' | 'decision' | 'concept' | 'person' | 'open_question' | 'session';
  title: string;
  content: string;
  metadata: Record<string, unknown>;
  relationships: Array<{ target: string; type: string }>; // wikilink targets
}

export interface ExtractionResult {
  entities: GraphEntity[];
}

const EXTRACTOR_SYSTEM_PROMPT = `You are a knowledge graph entity extractor for a professional AI workspace.
Analyze the conversation and extract structured entities. Respond ONLY with valid JSON:
{
  "entities": [
    {
      "type": "<project|decision|concept|person|open_question>",
      "title": "<concise title for the note>",
      "content": "<2-5 sentence description>",
      "tags": ["tag1", "tag2"],
      "relationships": [
        { "target": "<title of related entity>", "type": "<relates_to|depends_on|decided_in|raised_by>" }
      ]
    }
  ]
}
Extract ONLY entities worth remembering across sessions. Skip trivial exchanges.
Prefer fewer, high-quality entities over many shallow ones.`;

export async function extractEntities(
  messages: ChatMessage[],
  projectName?: string
): Promise<ExtractionResult> {
  try {
    const transcript = messages
      .map(m => `${m.role.toUpperCase()}: ${m.content.slice(0, 500)}`)
      .join('\n\n')
      .slice(0, 8000);

    const result = await callAI(
      [{ role: 'user', content: `Extract knowledge entities from this conversation:\n\n${transcript}` }],
      'anthropic/claude-haiku-4-5',
      EXTRACTOR_SYSTEM_PROMPT
    );

    return JSON.parse(result.content);
  } catch {
    return { entities: [] }; // Silent fallthrough
  }
}
```

#### 5.2 Create `server/obsidianWriter.ts`

```typescript
import fs from 'fs/promises';
import path from 'path';

export async function writeEntityToVault(
  vaultPath: string,
  entity: GraphEntity,
  sourceChatId: number,
  sourceDate: string
): Promise<void> {
  const folder = path.join(vaultPath, pluralize(entity.type)); // e.g., "decisions/"
  await fs.mkdir(folder, { recursive: true });

  const filePath = path.join(folder, sanitizeFilename(entity.title) + '.md');
  const exists = await fileExists(filePath);

  if (exists) {
    // Append new source session and update metadata
    await appendToExistingNote(filePath, entity, sourceChatId, sourceDate);
  } else {
    // Create new note with frontmatter + content + wikilinks
    const content = buildNoteContent(entity, sourceChatId, sourceDate);
    await fs.writeFile(filePath, content, 'utf-8');
  }
}

function buildNoteContent(entity: GraphEntity, chatId: number, date: string): string {
  const frontmatter = [
    '---',
    `type: ${entity.type}`,
    `created: ${date}`,
    `updated: ${date}`,
    `source_chat_ids: [${chatId}]`,
    `tags: [${entity.metadata.tags?.join(', ') || ''}]`,
    '---',
  ].join('\n');

  const relationships = entity.relationships
    .map(r => `- [[${r.target}]] — ${r.type}`)
    .join('\n');

  return `${frontmatter}\n\n# ${entity.title}\n\n${entity.content}\n\n## Related\n${relationships}\n`;
}
```

#### 5.3 Add vault path configuration

Two options for vault path:
1. **Per-user setting:** Add `obsidianVaultPath` to the `users` table (or a new `user_settings` table).
2. **Per-project setting:** Add `obsidianVaultPath` to the `projects` table (each project writes to a subfolder).

Recommended: **Per-user setting** with project subfolder auto-creation. One vault, many projects.

```typescript
// In shared/schema.ts, add to users or create user_settings:
obsidianVaultPath: text("obsidian_vault_path"),  // e.g. "/Users/surya/ObsidianVault/InquiroAI"
```

#### 5.4 Graph extraction API endpoint

```
POST /api/chats/:chatId/extract-graph
  → Triggers extractEntities() + writeEntityToVault()
  → Returns { entities_created: number, entities_updated: number }
```

Can be triggered:
- Manually via "Extract to Graph" button in chat header
- Automatically after Layer 4 archive (chain: archive → extract)
- On chat close if > 5 messages

#### 5.5 Frontend — Graph Extraction UI

- "Extract to Graph" button (network icon) next to the "Archive to Memory" button in chat header
- After extraction: toast showing "Extracted 3 entities: 1 decision, 1 concept, 1 open question"
- Link to open vault folder in Obsidian (via `obsidian://` URI scheme)
- Settings page: configure Obsidian vault path

#### 5.6 Obsidian Vault Bootstrap

On first use, create the vault folder structure:

```
<vault_path>/
├── projects/
├── decisions/
├── concepts/
├── people/
├── open-questions/
├── sessions/
└── templates/
    ├── decision.md
    ├── concept.md
    └── session.md
```

#### 5.7 New environment variables

```
# Optional — can also be set per-user in settings
OBSIDIAN_VAULT_PATH=/path/to/vault
```

---

## Database Migration Plan

Run migrations in this order:

```bash
# After updating shared/schema.ts with new tables and columns:
npx drizzle-kit generate
npx drizzle-kit migrate
```

New additions to schema:
1. `projects` table (Layer 0)
2. `chats.project_id` nullable FK column (Layer 0)
3. `prompt_intelligence` table (Layer 2) — already in schema
4. `chats.compression_count` column (Layer 3)
5. `chats.total_tokens_used` column (Layer 3)
6. `chats.total_cost_usd` column (Layer 3)
7. `chats.notion_page_id` column (Layer 4)
8. `chats.archived_at` column (Layer 4)
9. `users.obsidian_vault_path` column (Layer 5)

**Layer 0 migration is safe and non-breaking:** `projects` is a new table, `chats.project_id` is nullable. Existing chats remain valid as standalone (no-project) chats.

---

## Environment Variables — Complete List

```bash
# Existing (keep)
DATABASE_URL=postgresql://...
SESSION_SECRET=...
ENCRYPTION_KEY=...  # Must be exactly 32 bytes

# Layer 0 — no new env vars required (local folder path is per-project in DB)

# Layer 1 (already configured)
OPENROUTER_API_KEY=sk-or-...
APP_URL=http://localhost:5000

# New — Layer 4
NOTION_API_KEY=secret_...
NOTION_MEMORY_DATABASE_ID=...

# New — Layer 5 (optional — can be set per-user in settings)
OBSIDIAN_VAULT_PATH=/path/to/vault

# Remove from server usage (users' BYOK keys deprecated)
# OPENAI_API_KEY, ANTHROPIC_API_KEY, GOOGLE_API_KEY, GROK_API_KEY
```

---

## Build Sequence — Day by Day

### Day 0 — Project Entity & Local Folder Access
1. Add `projects` table and `chats.projectId` FK to `shared/schema.ts`
2. Add relations, Zod schemas, and types
3. Run migration: `npx drizzle-kit generate && npx drizzle-kit migrate`
4. Create project CRUD API routes (`POST/GET/PATCH/DELETE /api/projects`)
5. Create `POST /api/projects/:id/chats` route with field inheritance/merge logic
6. Create `GET /api/projects/:id/files` local folder browsing endpoint
7. Create `GET /api/projects/:id/files/:path` file extraction endpoint (reuse `fileProcessor.ts`)
8. Build `ProjectCreationPage` component (current form fields minus Task/InputData + folder picker)
9. Build `ProjectDashboard` component (project settings, chat list, file browser)
10. Build lightweight `NewChatInProject` form (Task + InputData + model override)
11. Refactor sidebar from flat chat list to project-grouped tree
12. Keep "Quick Chat (no project)" entry point for standalone chats
13. Build `FileBrowser` modal component for browsing + attaching project files
14. Test: create project → create chat within it → verify field inheritance
15. Test: set local folder → browse files → attach to chat → verify content extraction
16. Test: existing standalone chats still work unchanged

### Day 1 — OpenRouter Migration (✅ COMPLETE)
1. Install openai SDK, configure OpenRouter client
2. Create `server/openrouter.ts` with `callAI()` function
3. Create `server/openrouter-models.ts` with live model catalog fetch
4. Replace all direct provider calls with `callAI()`
5. Update `modelUpdater.ts` to use OpenRouter catalog
6. Test: send a message, verify it routes through OpenRouter
7. Verify: model selector UI still works with OpenRouter model IDs

### Day 2 — Prompt Evaluator
1. Create `server/promptEvaluator.ts`
2. Create `server/modelRouter.ts` with full routing matrix
3. Wire evaluator into message route (pre-AI call)
4. Add `prompt_intelligence` table to schema, run migration
5. Test: submit a vague prompt, verify evaluation JSON returned
6. Test: submit a well-formed prompt, verify score > 7, no suggestion shown

### Day 3 — Prompt Intelligence UI
1. Add evaluation result to message API response
2. Build `PromptSuggestionBanner` component (non-blocking toast)
3. Build `ModelRecommendationChip` component with override dropdown
4. Wire "Use this prompt" button to replace input field content
5. Wire model override to chat session state
6. Test: full end-to-end UX flow

### Day 4 — Context Manager
1. Create `server/contextManager.ts`
2. Add compression columns to `chats` schema, run migration
3. Wire context manager into message route (pre-AI call, post-router)
4. Build `ContextStatusBar` component (token usage + compression count)
5. Test: create a very long conversation, verify compression triggers at 70%
6. Test: verify compressed conversation still has coherent context

### Day 5 — Notion Memory Backend
1. Install `@notionhq/client`
2. Create Notion database with required schema
3. Create `server/notionMemory.ts`
4. Add archive API endpoint
5. Build "Archive to Memory" button in chat header
6. Add auto-archive trigger on chat close (> 5 messages)
7. Test: archive a chat, verify Notion page created with correct properties
8. Test: open Notion, verify page structure (summary, decisions, questions)

### Day 6 — Obsidian Knowledge Graph
1. Create `server/obsidianGraph.ts` with entity extraction via Haiku
2. Create `server/obsidianWriter.ts` with vault file management
3. Add `obsidianVaultPath` to user settings, run migration
4. Create vault bootstrap script (folder structure + templates)
5. Add `POST /api/chats/:chatId/extract-graph` endpoint
6. Build "Extract to Graph" button in chat header (next to Archive)
7. Wire auto-extraction after Layer 4 archive (chain: archive → extract)
8. Add vault path configuration to Settings page
9. Test: extract entities from a multi-topic chat, verify notes created with correct wikilinks
10. Test: run extraction twice on same chat, verify notes are updated (not duplicated)
11. Test: open vault in Obsidian, verify graph view shows entity connections

---

## Testing Checklist

After completing all layers, verify:

**Layer 0 — Project Entity**
- [ ] Create project with all fields populated
- [ ] Create chat within project — verify inherited fields match project defaults
- [ ] Override a field (e.g., model) in chat — verify override takes effect
- [ ] Set local folder path — browse files returns correct listing
- [ ] Attach file from project folder — content extracted into Input Data
- [ ] Sidebar shows project → chat tree hierarchy
- [ ] Standalone "Quick Chat" (no project) still works
- [ ] Existing chats without project remain accessible and functional
- [ ] Path traversal attack on file endpoint returns 403

**Layers 1–4**
- [ ] Message sends successfully via OpenRouter
- [ ] All models in selector work (test one from each provider)
- [ ] Vague prompt shows suggestion banner
- [ ] Good prompt shows no banner
- [ ] "Use this prompt" replaces input correctly
- [ ] Model recommendation shows correct model for prompt type
- [ ] User can override recommended model
- [ ] Token counter updates in real time as messages are added
- [ ] Context compression triggers at 70% (test with very long messages)
- [ ] Compressed conversation maintains context in subsequent replies
- [ ] Archive button creates Notion page
- [ ] Notion page has title, tags, type, summary, decisions, open questions
- [ ] Cost tracking visible in prompt_intelligence table
- [ ] All existing features (file upload, export, roles) still work

**Layer 5 — Obsidian Knowledge Graph**
- [ ] Extract entities from a multi-topic chat — verify notes created in vault
- [ ] Wikilinks between entities resolve correctly in Obsidian
- [ ] Run extraction twice — notes updated, not duplicated
- [ ] Obsidian graph view shows entity connections
- [ ] Vault path configurable in user settings
- [ ] Auto-extraction chains after Layer 4 archive

---

## Out of Scope for This Sprint

The following are planned for future sprints — do NOT build these now:

- Auto-indexing file watcher + RAG retrieval (Layer 0 provides manual browse+attach only)
- PPT/XLSX/DOCX output renderer
- Google OAuth (keep mock auth for now)
- Semantic search across archived chats
- Prompt pattern library
- Cost dashboard UI
- Daily cron job (manual archive only for now)

---

## Notes for Claude Code

- This is a TypeScript monorepo. Frontend in `client/`, backend in `server/`, shared types in `shared/`.
- Drizzle ORM is the database layer — use it for all DB operations, never raw SQL.
- The existing shadcn/ui component library is available — use existing components where possible.
- All new server modules should export named functions, not default exports.
- Error handling: wrap all AI calls in try/catch, always fall through to base behavior on failure.
- Never console.log sensitive data (API keys, user messages in production).
- Run `npm run dev` to start both frontend and backend concurrently.

---

## Additional Features Built (Beyond Original Spec)

The following features were designed and implemented during the Layer 0 sprint in response to UX feedback and real usage issues discovered during development. They are fully integrated and should be treated as permanent, spec-level features going forward.

---

### A1 — Home Dashboard Redesign (`/chat`)

**File:** `client/src/pages/Dashboard.tsx`

The original `/chat` route showed a flat list of chats. This was replaced with a two-section home dashboard:

**Projects section:**
- Each project shown as a collapsible card with its description and chat count
- Nested chats listed within each project card (title + last message preview + timestamp)
- "New Chat in [Project]" quick-action row at the bottom of each project card
- Hover on any chat row reveals action icons (navigate, link-to-project)

**Quick Chats section:**
- Standalone chats (no `projectId`) shown in a separate section below
- Same hover action pattern as project chats
- Each row has a `Link2` icon that opens `LinkToProjectModal`

**Header:**
- Sticky navigation bar with "New Project" gradient button and "Quick Chat" outline button
- Search bar filters both projects and chats by name in real time

---

### A2 — LinkToProjectModal Component

**File:** `client/src/components/LinkToProjectModal.tsx`

New Dialog component that allows users to move any standalone chat to a project (or remove it from a project):

- Lists all user projects as selectable cards; current project shown with checkmark
- "No project (Quick Chat)" option at the top — allows unlinking
- "Create new project" dashed card — navigates to `/projects/new` and closes dialog
- On save: calls `PATCH /api/chats/:id` with `{ projectId }`, invalidates `/api/chats` and `/api/projects` query cache
- Accessible from: Dashboard quick-chat hover button AND from the chat header inside `ChatInterface.tsx`

---

### A3 — PATCH /api/chats/:id Endpoint

**Location:** `server/routes.ts`

New REST endpoint to update chat metadata after creation:

```typescript
PATCH /api/chats/:id
Body: { projectId?: number | null, title?: string }
```

- Validates `projectId` belongs to the same authenticated user (prevents cross-user assignment)
- Accepts `null` for `projectId` to unlink a chat from any project
- Only allows updating `projectId` and `title` (allowlist of fields)
- Returns the updated chat row
- Used by `LinkToProjectModal` and future chat-rename features

---

### A4 — ModelPicker Component

**File:** `client/src/components/ModelPicker.tsx`

Reusable two-dropdown (Provider → Model) AI engine selector, used in `NewProject`, `EditProject`, and `NewProjectChat`:

**Features:**
- Fetches full OpenRouter catalog via `GET /api/ai-providers` with `staleTime: 0, refetchOnMount: true` (bypasses global `staleTime: Infinity`)
- Provider dropdown: sorted alphabetically, shows count ("55 providers available via OpenRouter")
- Model dropdown: includes inline search box (`onKeyDown={e => e.stopPropagation()}` to prevent shadcn Select intercepting keystrokes)
- **X clear buttons:** Provider X clears both provider + model; Model X clears model only — both positioned absolute inside the Select trigger at `right-8`
- Refresh button calls `POST /api/ai-providers/refresh`, updates cache via `queryClient.setQueryData`
- `modelLabel()` helper strips the `provider/` prefix for display (shows only the model slug)
- Accepts `providerPlaceholder` and `modelPlaceholder` props for context-specific hints

**Props interface:**
```typescript
interface ModelPickerProps {
  provider: string;
  model: string;
  onProviderChange: (provider: string) => void;
  onModelChange: (model: string) => void;
  providerPlaceholder?: string;
  modelPlaceholder?: string;
}
```

---

### A5 — Full OpenRouter Catalog in getAllProviders()

**File:** `server/openrouter-models.ts` (rewritten)

The original `getModelsByProvider()` only surfaced 4 hardcoded providers (openai, anthropic, google, meta-llama). This was replaced with a dynamic grouping approach:

```typescript
export async function getAllProviders(): Promise<Record<string, AIProvider>>
```

- Fetches all models from `GET https://openrouter.ai/api/v1/models`
- Groups by provider prefix (everything before the first `/` in model ID)
- Builds a `ProviderEntry` per prefix: `{ name, models[], defaultModel }`
- `PROVIDER_DISPLAY_NAMES` lookup table maps machine prefixes to human-readable names (e.g. `"x-ai"` → `"xAI (Grok)"`, `"mistralai"` → `"Mistral AI"`, `"cohere"` → `"Cohere"` — 30+ entries)
- `PROVIDER_DEFAULTS` maps each provider to its preferred default model
- Result: 50+ providers available in the UI instead of 4
- `getModelsByProvider()` kept as a backward-compatible wrapper for existing code

**Server-side change in `aiOrchestrator.ts`:** `ModelUpdater.fetchAndCache()` now calls `getAllProviders()`. In-memory cache with 24-hour TTL. Forces refresh on first call after server restart.

---

### A6 — EditProject Page

**File:** `client/src/pages/EditProject.tsx`
**Route:** `/projects/:id/edit`

Full project editing form pre-populated from the existing project record:

- Fetches `GET /api/projects/:id` on mount
- Pre-fills all 12 fields via `useEffect` + `form.reset()` once data arrives
- Submits `PATCH /api/projects/:id` with changed values
- **Cache invalidation fix:** uses `queryClient.invalidateQueries` (not `setQueryData`) so the cached `GET /api/projects/:id` response (which includes the `chats` join) is refetched after save — prevents chats from disappearing from the dashboard
- Save button in sticky header AND at bottom of long form
- Cancel button navigates back to `/projects/:id`
- Includes `ModelPicker` for editing the default AI engine

**Wired in `App.tsx`:** Route `/projects/:id/edit` added **before** `/projects/:id` to prevent wildcard match shadowing.
**Wired in `ProjectDashboard.tsx`:** Settings/edit button navigates to `/projects/${id}/edit`.

---

### A7 — RoleSelector Equal-Height Cards

**File:** `client/src/components/RoleSelector.tsx`

All 7 role cards (Researcher, Product Manager, Developer, Content Writer, Designer, Presales Consultant, Custom) now render at a uniform fixed height:

- Changed from horizontal `flex items-center` layout to vertical `flex flex-col items-center justify-center`
- Fixed `h-32` height on every card — ensures "Presales Consultant" (longest label) doesn't push the card taller than others
- Icon centered above label, `text-center` alignment, `text-sm`/`text-xs` sizing
- Active state: `border-blue-500 bg-blue-50`; hover: `hover:border-blue-300`

---

### A8 — Shell-Quoted Folder Path Stripping

**Location:** `client/src/pages/NewProject.tsx`, `client/src/pages/EditProject.tsx`, `server/routes.ts`

When users paste a folder path copied from terminal (e.g. `'/Users/you/project'` or `"/Users/you/project"`), surrounding shell quotes caused `fs.access()` to fail with "path is not accessible".

**Fix applied in two places:**

1. **Frontend `onBlur` handler** on the Local Folder Path input:
```typescript
const cleaned = e.target.value.trim().replace(/^(['"])(.*)\1$/, "$2").trim();
field.onChange(cleaned);
```

2. **Server-side sanitization** before `fs.access()` check in both `POST /api/projects` and `PATCH /api/projects/:id`:
```typescript
const rawPath = body.localFolderPath?.trim().replace(/^(['"])(.*)\1$/, "$2").trim();
```

Also improved the error message to include the actual resolved path for easier debugging.

---

### A9 — Model Selection Clear / Unselect

**File:** `client/src/components/ModelPicker.tsx`

Two X buttons overlaid on the provider and model Select triggers:

- **Provider X** (shown when `provider` is set): clears both `provider` and `model`, resets `modelSearch` to `""`
- **Model X** (shown when `model` is set): clears `model` only, resets `modelSearch`
- Both positioned `absolute right-8 top-1/2 -translate-y-1/2` inside the relative wrapper so they sit left of the Select's built-in chevron
- `z-10` to render above the trigger, `stopPropagation` not needed (buttons intercept clicks before the Select trigger fires)

---

---

## Sprint 3 Design Decisions (2026-03-25)

### D1 — Role Does Not Belong to Projects

**Decision:** Remove the role selector from `NewProject` and `EditProject` forms. Role is a chat-level concern only.

**Rationale:** A project spans multiple work streams with different roles:
- Chat 1: Market research → Researcher
- Chat 2: Feature specification → Product Manager
- Chat 3: API implementation → Developer
- Chat 4: Release notes → Content Writer

Forcing a project-level role creates a false constraint. The `role`/`customRole` columns remain in the `projects` DB table (no migration needed) but are no longer surfaced in the UI or used in field inheritance.

**Impact on field inheritance:** `POST /api/projects/:id/chats` merge logic must NOT inherit `role` from the project. The `role` field must always be explicitly provided at chat creation time.

**Files to update:** `NewProject.tsx`, `EditProject.tsx`, field-merge logic in `server/routes.ts`.

---

### D2 — Model Selection is Algorithm Output, Not User Input

**Decision:** The routing algorithm selects the model. Users interact with the AI to get work done — they should not need to know or care which model runs their prompt.

**New mental model:**
- **Default state:** "Auto" — the evaluator + router pick the best model per message
- **Override state:** User explicitly selects a model; persists for the chat session
- **Reset:** User can revert to Auto at any time

**Implementation across two surfaces:**

#### D2a — Chat Creation Forms (NewChatForm, NewProjectChat)
- Hide the `ModelPicker` component by default
- Show a subtle "AI Engine: Auto · Override →" text link below the form
- Clicking "Override →" expands the `ModelPicker` inline
- When override is active: "AI Engine: GPT-4o · ✕ Reset to auto"
- `aiProvider`/`aiModel` become optional in `chatConfigSchema` — server defaults to `'auto'` sentinel
- First message send triggers the evaluator/router to assign the actual model

#### D2b — Active Chat Interface (ChatInterface)
- Replace the `ModelRecommendationChip` prominent banner with a subtle pill below the input:
  `⚡ Auto: Claude Sonnet 4.5  ·  Change model`
- Clicking "Change model" slides in a compact inline model picker (not a modal)
- Manual override state: `⚡ GPT-4o  ·  Manual override  ·  ✕ Reset`
- `✕ Reset` clears `modelOverride` state → reverts to algorithm selection on next message
- `PromptSuggestionBanner` (low-score prompts) remains separate and unchanged

**Key principle: Auto is the default, override is the exception.**

---

### D3 — UI/UX Sprint (D-Series) — Sourced from InquiroAI-UIUX-Review.md

**Goal:** Elevate InquiroAI from "working prototype" to premium $20/month tool. Fix the three biggest friction points: cognitive overload in forms, flat interactions, and buried navigation.

**Priority order:** D2 (hover states) → D3 (chat header) → D1 (form tabs) → D4 (tooltips) → D5 (dashboard resume) → D6 (a11y) → D7 (scroll) → D8 (empty state) → D9 (mobile)

**Key decisions:**
- D1: Replace single-scroll forms with tabbed architecture (Basics → Role → Context & Defaults → Advanced). Tabs retain data; validation errors auto-switch to offending tab.
- D2: All buttons get `scale-[1.02] shadow-md` hover, 200ms transition. Project cards "lift" with `ring-1 ring-purple-200`. AI Engine pill becomes a real interactive element (bg-purple-50, border, hover state).
- D3: Role pill (blue-100) + model pill (purple-100) in chat header. Clicking role opens compact role-picker popover + calls PATCH /api/chats/:id. Project breadcrumb above title.
- D7: Floating "↓ New message" button when user is 200px+ above bottom. Respects manual scroll intent during streaming.
- D9: Mobile done last — requires D1 tabs to exist first. Sidebar as Sheet drawer on mobile.

---

### Build Status Update (as of 2026-03-25)

| Layer | Feature | Status |
|-------|---------|--------|
| Layer 0 | Projects table + relations + migration | ✅ Complete |
| Layer 0 | Project CRUD API routes | ✅ Complete |
| Layer 0 | POST /api/projects/:id/chats with field inheritance | ✅ Complete |
| Layer 0 | Local folder file browsing + extraction endpoints | ✅ Complete |
| Layer 0 | NewProject page | ✅ Complete |
| Layer 0 | EditProject page (A6) | ✅ Complete |
| Layer 0 | ProjectDashboard page | ✅ Complete |
| Layer 0 | NewProjectChat form | ✅ Complete |
| Layer 0 | FileBrowser component | ✅ Complete |
| Layer 0 | Sidebar Quick Chat entry point | ✅ Complete |
| Layer 0 | Home Dashboard redesign (A1) | ✅ Complete |
| Layer 0 | LinkToProjectModal (A2) | ✅ Complete |
| Layer 0 | PATCH /api/chats/:id (A3) | ✅ Complete |
| Layer 0 | ModelPicker component (A4) | ✅ Complete |
| Layer 0 | Full OpenRouter catalog — 50+ providers (A5) | ✅ Complete |
| Layer 0 | RoleSelector equal-height cards (A7) | ✅ Complete |
| Layer 0 | Shell-quoted folder path stripping (A8) | ✅ Complete |
| Layer 0 | Model selection clear buttons (A9) | ✅ Complete |
| Layer 1 | OpenRouter migration | ✅ Complete |
| Layer 2 | Prompt evaluator + model router (backend) | ✅ Complete |
| Layer 2 | PromptSuggestionBanner + ModelRecommendationChip (UI) | ✅ Complete |
| Layer 3 | server/contextManager.ts | ✅ Complete |
| Layer 3 | Context manager wired into message pipeline | ✅ Complete |
| Layer 3 | ContextStatusBar UI component | ✅ Complete |
| Layer 4 | @notionhq/client installed + Notion DB created | ✅ Complete |
| Layer 4 | server/notionMemory.ts — classify + archive | ✅ Complete |
| Layer 4 | POST /api/chats/:chatId/archive endpoint | ✅ Complete |
| Layer 4 | Archive to Memory UI + auto-archive trigger | ✅ Complete |
| UX | B8 — Streaming Responses (SSE) | ✅ Complete |
| UX | B9 — Chat Search (title + message content, highlighted results dropdown) | ✅ Complete |
| UX | B11 — Chat Rename (inline) + Drag-and-drop Reorder (framer-motion) | ✅ Complete |
| UX | Landing page → /chat direct (no API key gate) | ✅ Complete |
| UX | /chat/new project linking dropdown | ✅ Complete |
| UX | Timestamp display — local browser time | ✅ Complete |
| Sprint 3 | C1 — Remove role from Project forms | ✅ Complete |
| Sprint 3 | C2 — Auto model selection: chat creation forms | ✅ Complete |
| Sprint 3 | C3 — Auto model selection: active chat interface | ✅ Complete |
| Sprint 3 — UI/UX | D1 — Tab-based form architecture (progressive disclosure) | ✅ Complete |
| Sprint 3 — UI/UX | D2 — Micro-interactions & hover states | ✅ Complete |
| Sprint 3 — UI/UX | D3 — Chat header redesign: role + model pills | ✅ Complete |
| Sprint 3 — UI/UX | D4 — Form field tooltips & contextual help | 🔲 Pending |
| Sprint 3 — UI/UX | D5 — Dashboard: Resume Work + project sorting | 🔲 Pending |
| Sprint 3 — UI/UX | D6 — Accessibility fixes (contrast, focus rings, touch targets) | 🔲 Pending |
| Sprint 3 — UI/UX | D7 — "Scroll to latest" button in chat | 🔲 Pending |
| Sprint 3 — UI/UX | D8 — Empty state for new users | 🔲 Pending |
| Sprint 3 — UI/UX | D9 — Mobile responsiveness: sidebar + forms | 🔲 Pending |
