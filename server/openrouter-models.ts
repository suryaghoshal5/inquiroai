export interface OpenRouterModel {
  id: string;           // e.g. "anthropic/claude-sonnet-4-5"
  name: string;         // Human readable
  context_length: number;
  pricing: {
    prompt: string;     // USD per token
    completion: string;
  };
}

export interface ProviderEntry {
  name: string;         // Display name, e.g. "Anthropic"
  models: string[];     // Full OpenRouter model IDs, e.g. ["anthropic/claude-3-5-sonnet-20241022"]
  defaultModel: string;
  lastUpdated?: Date;
}

import { MODEL_CACHE_TTL_MS } from './config';

let cachedModels: OpenRouterModel[] | null = null;
let cacheTime = 0;

// Human-readable display names for known provider prefixes
const PROVIDER_DISPLAY_NAMES: Record<string, string> = {
  openai:           'OpenAI',
  anthropic:        'Anthropic',
  google:           'Google',
  'x-ai':           'xAI (Grok)',
  'meta-llama':     'Meta Llama',
  mistralai:        'Mistral AI',
  cohere:           'Cohere',
  databricks:       'Databricks',
  deepseek:         'DeepSeek',
  qwen:             'Qwen (Alibaba)',
  microsoft:        'Microsoft',
  nvidia:           'NVIDIA',
  amazon:           'Amazon',
  perplexity:       'Perplexity',
  '01-ai':          '01.AI',
  'nousresearch':   'Nous Research',
  'sao10k':         'Sao10k',
  neversleep:       'NeverSleep',
  aetherwiing:      'Aetherwiing',
  sophosympatheia:  'Sophosympatheia',
  pygmalionai:      'PygmalionAI',
  inflection:       'Inflection AI',
  ai21:             'AI21 Labs',
  zhipuai:          'Zhipu AI',
  moonshot:         'Moonshot AI',
  baichuan:         'Baichuan',
  minimax:          'MiniMax',
  stepfun:          'StepFun',
  internlm:         'InternLM',
  writer:           'Writer',
};

function toDisplayName(prefix: string): string {
  return PROVIDER_DISPLAY_NAMES[prefix]
    ?? prefix
        .split('-')
        .map(w => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
}

// Preferred default model per provider prefix
const PROVIDER_DEFAULTS: Record<string, string> = {
  openai:       'openai/gpt-4o',
  anthropic:    'anthropic/claude-3-5-sonnet-20241022',
  google:       'google/gemini-1.5-pro',
  'x-ai':       'x-ai/grok-beta',
  'meta-llama': 'meta-llama/llama-3.1-70b-instruct',
  mistralai:    'mistralai/mistral-large',
  deepseek:     'deepseek/deepseek-chat',
};

export async function fetchOpenRouterModels(): Promise<OpenRouterModel[]> {
  const now = Date.now();
  if (cachedModels && now - cacheTime < MODEL_CACHE_TTL_MS) {
    return cachedModels;
  }

  try {
    const response = await fetch('https://openrouter.ai/api/v1/models', {
      headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}` },
    });

    if (!response.ok) {
      throw new Error(`OpenRouter models API returned ${response.status}`);
    }

    const data = await response.json() as { data: OpenRouterModel[] };
    cachedModels = data.data;
    cacheTime = now;
    return cachedModels;
  } catch (error) {
    console.error('Failed to fetch OpenRouter models:', error);
    return cachedModels ?? [];
  }
}

/**
 * Returns ALL providers available through OpenRouter, each with their
 * full model ID list (e.g. "anthropic/claude-3-5-sonnet-20241022").
 * Replaces the old hardcoded 4-provider system.
 */
export async function getAllProviders(): Promise<Record<string, ProviderEntry>> {
  const models = await fetchOpenRouterModels();

  const groups: Record<string, string[]> = {};

  for (const model of models) {
    const slash = model.id.indexOf('/');
    if (slash === -1) continue;
    const prefix = model.id.slice(0, slash);
    if (!groups[prefix]) groups[prefix] = [];
    groups[prefix].push(model.id);
  }

  const providers: Record<string, ProviderEntry> = {};

  for (const [prefix, ids] of Object.entries(groups)) {
    // Sort alphabetically; deduplicate
    const sorted = Array.from(new Set(ids)).sort();

    const preferred = PROVIDER_DEFAULTS[prefix];
    const defaultModel = preferred && sorted.includes(preferred)
      ? preferred
      : sorted[0];

    providers[prefix] = {
      name: toDisplayName(prefix),
      models: sorted,
      defaultModel,
      lastUpdated: new Date(),
    };
  }

  return providers;
}

/** Legacy helper — kept for backward compat, only returns the 4 old groups */
export async function getModelsByProvider(): Promise<Record<string, string[]>> {
  const all = await getAllProviders();
  return {
    openai:   (all['openai']?.models ?? []).map(m => m.replace('openai/', '')),
    gemini:   (all['google']?.models ?? []).map(m => m.replace('google/', '')),
    claude:   (all['anthropic']?.models ?? []).map(m => m.replace('anthropic/', '')),
    grok:     (all['x-ai']?.models ?? []).map(m => m.replace('x-ai/', '')),
  };
}
