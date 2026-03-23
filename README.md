# InquiroAI

A domain expert's AI operating system — multi-model chat with persistent memory, prompt intelligence, and structured output generation.

**v0.2.0** — Prompt Intelligence + Memory Layer

---

## Architecture

```
User message
    │
    ▼
[EVALUATOR]          ← meta-llama/llama-3.1-8b-instruct (fast + cheap)
    │  score, improved_prompt, prompt_type, complexity
    ▼
[MODEL ROUTER]       ← routing matrix: prompt_type × complexity → model
    │  recommended_model, reasoning, estimated_cost
    ▼
[CONTEXT MANAGER]    ← token estimation, auto-compress at 70% of context limit
    │  managed message window
    ▼
[OpenRouter]         ← single API key, 55+ providers, 349+ models
    │
    ▼
[NOTION MEMORY]      ← classify + archive chat to structured Notion database
```

### Capability Layers

| Layer | Description | Status |
|-------|-------------|--------|
| Layer 0 | Project entity + local folder access | ✅ v0.2.0 |
| Layer 1 | OpenRouter migration (all AI via single endpoint) | ✅ v0.2.0 |
| Layer 2 | Prompt Intelligence (evaluator + model router + UI) | ✅ v0.2.0 |
| Layer 3 | Context Manager (token tracking + auto-compression) | ✅ v0.2.0 |
| Layer 4 | Notion Memory Backend (classify + archive) | ✅ v0.2.0 |

---

## Stack

- **Frontend:** React 18 + TypeScript + Vite + Tailwind + shadcn/ui
- **Backend:** Node.js + Express + PostgreSQL (Neon) + Drizzle ORM
- **AI:** OpenRouter (unified API for Claude, GPT-4o, Gemini, Llama, and 55+ providers)
- **Memory:** Notion API (`@notionhq/client`)

---

## Setup

### 1. Clone and install

```bash
git clone https://github.com/suryaghoshal5/inquiroai
cd inquiroai
npm install
```

### 2. Environment variables

Copy `.env.example` to `.env` and fill in:

```bash
# Database
DATABASE_URL=postgresql://...

# Session + encryption
SESSION_SECRET=<64-char hex>
ENCRYPTION_KEY=<exactly 32 bytes>

# OpenRouter — single key for all AI providers
# Get yours at https://openrouter.ai/keys
OPENROUTER_API_KEY=sk-or-...
APP_URL=http://localhost:3001

# Notion Memory (optional — archive feature disabled if unset)
# 1. Create an integration at https://notion.so/my-integrations
# 2. Create or use the "InquiroAI Memory" database (see Notion Setup below)
# 3. Share the database with your integration
NOTION_API_KEY=secret_...
NOTION_MEMORY_DATABASE_ID=<database-id-from-notion-url>
```

### 3. Database migration

```bash
npm run db:push
```

### 4. Run

```bash
npm run dev
```

Server starts on `http://localhost:3001`.

---

## Notion Database Setup

The archive feature writes structured memory entries to a Notion database. Schema required:

| Property | Type |
|----------|------|
| Title | Title |
| Date | Date |
| Project | Select |
| Type | Select (`ANALYSIS`, `RESEARCH`, `BUILD`, `BD`, `OPS`, `STRATEGY`, `GEN`) |
| Tags | Multi-select |
| Platform | Select |
| Model Used | Rich text |
| Total Tokens | Number |
| Cost USD | Number |

Create the database manually or duplicate the template, then:
1. Go to the database in Notion
2. Click **Share** → **Connections** → add your integration
3. Copy the database ID from the URL and set `NOTION_MEMORY_DATABASE_ID`

---

## Key Features

### Projects
- Create reusable project briefs (role, context, constraints, audience, model)
- Chats inherit project defaults — override per chat as needed
- Link a local folder to browse and attach files directly into chat input
- Project dashboard with chat history and file browser

### Prompt Intelligence (Layer 2)
- Every prompt is scored 1–10 by a fast LLM (Llama 3.1 8B)
- Low-scoring prompts show an improved suggestion + issues list (non-blocking)
- Model router recommends the optimal model for the prompt type and complexity
- User can accept the suggestion or keep their original prompt

### Context Manager (Layer 3)
- Tracks token usage per chat in real time
- Auto-compresses oldest messages at 70% of the model's context limit
- Keeps last 4 messages verbatim; summarises the rest via Claude Haiku
- Progress bar UI shows current usage with green → yellow → orange → red coloring

### Notion Memory (Layer 4)
- "Archive to Memory" bookmark button in every chat header
- Claude Haiku classifies the chat: title, project, tags, type, summary, key decisions, open questions
- Writes a structured page to the InquiroAI Memory Notion database
- Auto-archives on navigation away from chats with >5 messages

### AI Models
- 55+ providers, 349+ models via OpenRouter
- Two-dropdown model picker (Provider → Model) with inline search
- Per-chat model override
- Model refreshed from OpenRouter catalog with 24h cache

---

## BYOK (Bring Your Own Key)

Individual provider API keys (OpenAI, Anthropic, etc.) are stored AES-256-GCM encrypted in the database via the Settings → API Keys page. With v0.2.0, OpenRouter is the primary routing layer — BYOK keys are retained for display but all AI calls route through `OPENROUTER_API_KEY`.

---

## Scripts

```bash
npm run dev        # Start dev server (frontend + backend)
npm run build      # Production build
npm run db:push    # Push Drizzle schema to database
npm run db:studio  # Open Drizzle Studio
```
