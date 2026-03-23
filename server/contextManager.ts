import { callAI } from './openrouter';
import type { ChatMessage } from './openrouter';

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function estimateMessagesTokens(messages: ChatMessage[]): number {
  return messages.reduce((sum, m) => sum + estimateTokens(m.content) + 10, 0);
}

export const MODEL_CONTEXT_LIMITS: Record<string, number> = {
  'anthropic/claude-haiku-4-5':  200000,
  'anthropic/claude-sonnet-4-5': 200000,
  'anthropic/claude-opus-4':     200000,
  'openai/gpt-4o':               128000,
  'openai/gpt-4o-mini':          128000,
  'google/gemini-1.5-pro':       1000000,
  'google/gemini-1.5-flash':     1000000,
  default:                        128000,
};

export const COMPRESSION_THRESHOLD = 0.70;

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
  const limit = MODEL_CONTEXT_LIMITS[model] ?? MODEL_CONTEXT_LIMITS['default'];
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

  if (olderMessages.length === 0) {
    return {
      messages,
      was_compressed: false,
      compression_count: existingCompressionCount,
      current_tokens: currentTokens,
      limit_tokens: limit,
    };
  }

  const conversationText = olderMessages
    .map(m => `${m.role.toUpperCase()}: ${m.content}`)
    .join('\n\n');

  try {
    const summaryResult = await callAI(
      [{
        role: 'user',
        content: `Summarize this conversation concisely, preserving all key decisions, facts, and context:\n\n${conversationText}`,
      }],
      'anthropic/claude-haiku-4-5',
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
  } catch {
    // Silent fallthrough — return original messages if compression fails
    return {
      messages,
      was_compressed: false,
      compression_count: existingCompressionCount,
      current_tokens: currentTokens,
      limit_tokens: limit,
    };
  }
}
