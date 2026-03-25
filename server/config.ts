// Centralized configuration constants for InquiroAI server
// All magic numbers and hardcoded strings should live here

// ─── OpenRouter ───────────────────────────────────────────────────────────────
export const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
export const APP_TITLE = 'InquiroAI';

// ─── Model IDs ────────────────────────────────────────────────────────────────
// Internal / pipeline models — override via env var if needed
export const EVALUATOR_MODEL =
  process.env.EVALUATOR_MODEL_ID ?? 'meta-llama/llama-3.1-8b-instruct';

export const COMPRESSION_MODEL =
  process.env.COMPRESSION_MODEL_ID ?? 'anthropic/claude-haiku-4-5';

export const NOTION_CLASSIFIER_MODEL =
  process.env.NOTION_CLASSIFIER_MODEL_ID ?? 'anthropic/claude-haiku-4-5';

// ─── Cost estimation fallback ─────────────────────────────────────────────────
// Used when OpenRouter doesn't return pricing in the response.
// These are approximate blended rates (USD per token).
// Override via env vars for more accurate tracking.
export const FALLBACK_PROMPT_COST_PER_TOKEN =
  parseFloat(process.env.FALLBACK_PROMPT_COST_PER_TOKEN ?? '') || 0.000003;

export const FALLBACK_COMPLETION_COST_PER_TOKEN =
  parseFloat(process.env.FALLBACK_COMPLETION_COST_PER_TOKEN ?? '') || 0.000015;

// ─── File handling ────────────────────────────────────────────────────────────
export const MAX_FILE_SIZE_BYTES =
  parseInt(process.env.MAX_FILE_SIZE_BYTES ?? '') || 10 * 1024 * 1024; // 10 MB

export const MAX_FILES_RETURNED =
  parseInt(process.env.MAX_FILES_RETURNED ?? '') || 500;

export const MAX_FOLDER_DEPTH =
  parseInt(process.env.MAX_FOLDER_DEPTH ?? '') || 3;

export const ALLOWED_EXTENSIONS = new Set([
  '.pdf', '.md', '.txt', '.docx', '.doc', '.xlsx', '.xls', '.csv',
  '.json', '.yaml', '.yml',
  '.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs', '.java', '.html', '.css',
]);

// ─── Context manager ──────────────────────────────────────────────────────────
export const COMPRESSION_THRESHOLD = 0.70;        // Compress at 70% of model limit
export const MESSAGES_KEPT_VERBATIM = 4;           // Keep last N messages uncompressed

// ─── Notion archiving ─────────────────────────────────────────────────────────
export const NOTION_TRANSCRIPT_PREVIEW_CHARS = 500; // chars per message in classification
export const NOTION_TRANSCRIPT_MAX_CHARS = 8000;    // total transcript chars sent to LLM
export const NOTION_AUTO_ARCHIVE_MIN_MESSAGES = 5;  // auto-archive threshold

// ─── Model catalog cache ──────────────────────────────────────────────────────
export const MODEL_CACHE_TTL_MS =
  parseInt(process.env.MODEL_CACHE_TTL_MS ?? '') || 24 * 60 * 60 * 1000; // 24 h

// ─── Default fallback context limit ──────────────────────────────────────────
export const DEFAULT_CONTEXT_LIMIT = 128000;

// ─── Server ───────────────────────────────────────────────────────────────────
export const DEFAULT_PORT = parseInt(process.env.PORT ?? '') || 5000;
