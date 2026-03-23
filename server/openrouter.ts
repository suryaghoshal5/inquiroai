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

  const usage = response.usage ?? {
    prompt_tokens: 0,
    completion_tokens: 0,
    total_tokens: 0,
  };

  const cost_usd =
    (usage.prompt_tokens * 0.000003) + (usage.completion_tokens * 0.000015);

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
