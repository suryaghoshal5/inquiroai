import { callAI, streamAI, type ChatMessage, type AICallResult } from '../openrouter';
import { getAllProviders, type ProviderEntry } from '../openrouter-models';

export type { ProviderEntry as AIProvider };

// In-memory provider cache — populated on first request / refresh
let cachedProviders: Record<string, ProviderEntry> | null = null;
let cacheTime = 0;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 h

/**
 * Ensure the model passed to OpenRouter is a fully qualified ID
 * (i.e. contains a slash).  If the caller stored a bare model like
 * "gpt-4o" with provider "openai", reconstruct the full ID.
 * Models that already contain "/" are passed through unchanged.
 */
function toOpenRouterModelId(provider: string, model: string): string {
  if (model.includes('/')) return model;

  // Legacy provider-key → OpenRouter prefix mapping
  const legacyPrefixMap: Record<string, string> = {
    openai:  'openai',
    gemini:  'google',
    claude:  'anthropic',
    grok:    'x-ai',
  };
  const prefix = legacyPrefixMap[provider] ?? provider;
  return `${prefix}/${model}`;
}

class ModelUpdater {
  static async fetchAndCache(): Promise<Record<string, ProviderEntry>> {
    try {
      const providers = await getAllProviders();
      cachedProviders = providers;
      cacheTime = Date.now();
      return providers;
    } catch (error) {
      console.error('Failed to update AI providers from OpenRouter:', error);
      return cachedProviders ?? {};
    }
  }

  static async getLatest(): Promise<Record<string, ProviderEntry>> {
    const hoursSince = cachedProviders
      ? (Date.now() - cacheTime) / (1000 * 60 * 60)
      : 25; // force refresh on first call

    if (hoursSince > 24) {
      return await this.fetchAndCache();
    }
    return cachedProviders!;
  }
}

export class AIOrchestrator {
  static async generateResponse(
    _userId: string,
    provider: string,
    model: string,
    systemPrompt: string,
    context: string[] = []
  ): Promise<string> {
    try {
      const openRouterId = toOpenRouterModelId(provider, model);

      const messages: ChatMessage[] = context.map((content, idx) => ({
        role: (idx % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
        content,
      }));

      console.log(`Calling OpenRouter — model: ${openRouterId}, context length: ${context.length}`);
      const result = await callAI(messages, openRouterId, systemPrompt);
      console.log(`OpenRouter response received, tokens: ${result.usage.total_tokens}`);

      return result.content || 'No response generated';
    } catch (error) {
      console.error(`OpenRouter generation error (${provider}/${model}):`, error);
      throw error;
    }
  }

  static async streamResponse(
    _userId: string,
    provider: string,
    model: string,
    systemPrompt: string,
    context: string[],
    onToken: (token: string) => void
  ): Promise<AICallResult> {
    const openRouterId = toOpenRouterModelId(provider, model);

    const messages: ChatMessage[] = context.map((content, idx) => ({
      role: (idx % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
      content,
    }));

    console.log(`Streaming OpenRouter — model: ${openRouterId}, context length: ${context.length}`);
    return streamAI(messages, openRouterId, systemPrompt, onToken);
  }

  static async getAvailableProviders(): Promise<Record<string, ProviderEntry>> {
    return await ModelUpdater.getLatest();
  }

  static async refreshProviders(): Promise<Record<string, ProviderEntry>> {
    return await ModelUpdater.fetchAndCache();
  }

  /**
   * Validate a BYOK API key.
   * BYOK keys are kept for future use; OpenRouter is the active AI backend.
   */
  static async validateApiKey(provider: string, apiKey: string): Promise<boolean> {
    try {
      console.log(`Validating BYOK key for provider: ${provider}`);

      switch (provider) {
        case 'openrouter': {
          const res = await fetch('https://openrouter.ai/api/v1/models', {
            headers: { Authorization: `Bearer ${apiKey}` },
          });
          return res.ok;
        }
        case 'openai': {
          const { default: OpenAI } = await import('openai');
          const client = new OpenAI({ apiKey });
          await client.models.list();
          return true;
        }
        case 'gemini': {
          const { GoogleGenAI } = await import('@google/genai');
          const client = new GoogleGenAI({ apiKey });
          await client.models.generateContent({
            model: 'gemini-1.5-flash',
            contents: 'test',
          });
          return true;
        }
        case 'claude': {
          const { default: Anthropic } = await import('@anthropic-ai/sdk');
          const client = new Anthropic({ apiKey });
          await client.messages.create({
            model: 'claude-3-haiku-20240307',
            max_tokens: 1,
            messages: [{ role: 'user', content: 'test' }],
          });
          return true;
        }
        case 'grok': {
          const { default: OpenAI } = await import('openai');
          const client = new OpenAI({ baseURL: 'https://api.x.ai/v1', apiKey });
          await client.chat.completions.create({
            model: 'grok-beta',
            messages: [{ role: 'user', content: 'test' }],
            max_tokens: 1,
          });
          return true;
        }
        default:
          return false;
      }
    } catch (error) {
      console.error(`BYOK key validation failed for ${provider}:`, error);
      return false;
    }
  }
}
