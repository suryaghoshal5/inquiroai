import OpenAI from 'openai';
import {
  OPENROUTER_BASE_URL,
  APP_TITLE,
  FALLBACK_PROMPT_COST_PER_TOKEN,
  FALLBACK_COMPLETION_COST_PER_TOKEN,
} from './config';

export const openrouter = new OpenAI({
  baseURL: OPENROUTER_BASE_URL,
  apiKey: process.env.OPENROUTER_API_KEY,
  defaultHeaders: {
    'HTTP-Referer': process.env.APP_URL ?? 'http://localhost:5000',
    'X-Title': APP_TITLE,
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
    stream: false as const,
  });

  const usage = response.usage ?? {
    prompt_tokens: 0,
    completion_tokens: 0,
    total_tokens: 0,
  };

  const cost_usd =
    (usage.prompt_tokens * FALLBACK_PROMPT_COST_PER_TOKEN) +
    (usage.completion_tokens * FALLBACK_COMPLETION_COST_PER_TOKEN);

  return {
    content: response.choices[0]?.message?.content || '',
    model: response.model,
    usage: {
      prompt_tokens: usage.prompt_tokens,
      completion_tokens: usage.completion_tokens,
      total_tokens: usage.total_tokens,
    },
    cost_usd,
  };
}

/**
 * Stream an AI completion, calling onToken for each content delta.
 * Returns the full accumulated content + usage once the stream closes.
 */
export async function streamAI(
  messages: ChatMessage[],
  model: string,
  systemPrompt: string | undefined,
  onToken: (token: string) => void
): Promise<AICallResult> {
  const fullMessages: ChatMessage[] = systemPrompt
    ? [{ role: 'system', content: systemPrompt }, ...messages]
    : messages;

  const stream = await openrouter.chat.completions.create({
    model,
    messages: fullMessages,
    stream: true as const,
  });

  let content = '';
  let promptTokens = 0;
  let completionTokens = 0;
  let finalModel = model;

  for await (const chunk of stream) {
    const token = chunk.choices[0]?.delta?.content ?? '';
    if (token) {
      content += token;
      onToken(token);
    }
    // OpenRouter may include usage in the last chunk
    if (chunk.usage) {
      promptTokens = chunk.usage.prompt_tokens ?? 0;
      completionTokens = chunk.usage.completion_tokens ?? 0;
    }
    if (chunk.model) finalModel = chunk.model;
  }

  // Estimate tokens from content length if provider didn't return usage
  if (promptTokens === 0 && completionTokens === 0) {
    promptTokens = Math.ceil(
      fullMessages.reduce((s, m) => s + m.content.length, 0) / 4
    );
    completionTokens = Math.ceil(content.length / 4);
  }

  const usage = {
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    total_tokens: promptTokens + completionTokens,
  };

  return {
    content,
    model: finalModel,
    usage,
    cost_usd:
      (promptTokens * FALLBACK_PROMPT_COST_PER_TOKEN) +
      (completionTokens * FALLBACK_COMPLETION_COST_PER_TOKEN),
  };
}
