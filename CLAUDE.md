# CLAUDE.md — InquiroAI Development Spec

## Project Overview

InquiroAI is a domain expert's AI operating system — a multi-model chat platform with persistent memory,
prompt intelligence, and structured output generation. It is NOT a generic AI chat wrapper.

**Repo:** https://github.com/suryaghoshal5/inquiroai  
**Stack:** React 18 + TypeScript + Vite + Tailwind + shadcn/ui (frontend) | Node.js + Express + PostgreSQL/Neon + Drizzle ORM (backend)  
**Current State:** Base application is FUNCTIONAL. Do NOT rebuild from scratch.  
**Your job:** Add 4 new capability layers on top of the existing codebase.

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

#### 4.6 New environment variables required
```
NOTION_API_KEY=secret_...
NOTION_MEMORY_DATABASE_ID=...
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
1. `prompt_intelligence` table (Layer 2)
2. `chats.compression_count` column (Layer 3)
3. `chats.total_tokens_used` column (Layer 3)
4. `chats.total_cost_usd` column (Layer 3)
5. `chats.notion_page_id` column (Layer 4)
6. `chats.archived_at` column (Layer 4)

---

## Environment Variables — Complete List

```bash
# Existing (keep)
DATABASE_URL=postgresql://...
SESSION_SECRET=...
ENCRYPTION_KEY=...  # Must be exactly 32 bytes

# New — Layer 1
OPENROUTER_API_KEY=sk-or-...
APP_URL=http://localhost:5000

# New — Layer 4
NOTION_API_KEY=secret_...
NOTION_MEMORY_DATABASE_ID=...

# Remove from server usage (users' BYOK keys deprecated)
# OPENAI_API_KEY, ANTHROPIC_API_KEY, GOOGLE_API_KEY, GROK_API_KEY
```

---

## Build Sequence — Day by Day

### Day 1 — OpenRouter Migration
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

---

## Testing Checklist

After completing all layers, verify:

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

---

## Out of Scope for This Sprint

The following are planned for future sprints — do NOT build these now:

- Local file watcher + RAG retrieval
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
