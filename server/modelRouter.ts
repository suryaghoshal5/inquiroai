import type { PromptType } from './promptEvaluator';

export interface ModelRecommendation {
  model: string;
  display_name: string;
  reasoning: string;
  estimated_cost_per_1k_tokens: number;
  context_window: number;
}

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
  code_review: {
    low:    { model: 'anthropic/claude-haiku-4-5', display_name: 'Claude Haiku', reasoning: 'Simple review tasks', estimated_cost_per_1k_tokens: 0.001, context_window: 200000 },
    medium: { model: 'anthropic/claude-sonnet-4-5', display_name: 'Claude Sonnet', reasoning: 'Thorough code review', estimated_cost_per_1k_tokens: 0.003, context_window: 200000 },
    high:   { model: 'anthropic/claude-opus-4', display_name: 'Claude Opus', reasoning: 'Deep architectural review', estimated_cost_per_1k_tokens: 0.015, context_window: 200000 },
  },
  long_document_analysis: {
    low:    { model: 'google/gemini-1.5-flash', display_name: 'Gemini Flash', reasoning: 'Long context at low cost', estimated_cost_per_1k_tokens: 0.00035, context_window: 1000000 },
    medium: { model: 'google/gemini-1.5-pro', display_name: 'Gemini Pro', reasoning: 'Best-in-class long context', estimated_cost_per_1k_tokens: 0.00125, context_window: 1000000 },
    high:   { model: 'google/gemini-1.5-pro', display_name: 'Gemini Pro', reasoning: 'Million token context for large docs', estimated_cost_per_1k_tokens: 0.00125, context_window: 1000000 },
  },
  creative_writing: {
    low:    { model: 'anthropic/claude-haiku-4-5', display_name: 'Claude Haiku', reasoning: 'Fast creative tasks', estimated_cost_per_1k_tokens: 0.001, context_window: 200000 },
    medium: { model: 'anthropic/claude-sonnet-4-5', display_name: 'Claude Sonnet', reasoning: 'Strong creative writing', estimated_cost_per_1k_tokens: 0.003, context_window: 200000 },
    high:   { model: 'anthropic/claude-opus-4', display_name: 'Claude Opus', reasoning: 'Maximum creativity and nuance', estimated_cost_per_1k_tokens: 0.015, context_window: 200000 },
  },
  data_analysis: {
    low:    { model: 'openai/gpt-4o-mini', display_name: 'GPT-4o Mini', reasoning: 'Fast data interpretation', estimated_cost_per_1k_tokens: 0.00015, context_window: 128000 },
    medium: { model: 'openai/gpt-4o', display_name: 'GPT-4o', reasoning: 'Strong quantitative reasoning', estimated_cost_per_1k_tokens: 0.005, context_window: 128000 },
    high:   { model: 'openai/gpt-4o', display_name: 'GPT-4o', reasoning: 'Complex data analysis with code', estimated_cost_per_1k_tokens: 0.005, context_window: 128000 },
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
  general: {
    low:    { model: 'anthropic/claude-haiku-4-5', display_name: 'Claude Haiku', reasoning: 'Fast general purpose', estimated_cost_per_1k_tokens: 0.001, context_window: 200000 },
    medium: { model: 'anthropic/claude-sonnet-4-5', display_name: 'Claude Sonnet', reasoning: 'Default workhorse', estimated_cost_per_1k_tokens: 0.003, context_window: 200000 },
    high:   { model: 'anthropic/claude-opus-4', display_name: 'Claude Opus', reasoning: 'Maximum capability', estimated_cost_per_1k_tokens: 0.015, context_window: 200000 },
  },
};

export function recommendModel(
  promptType: PromptType | string,
  complexity: string
): ModelRecommendation {
  const typeMatrix = ROUTING_MATRIX[promptType] ?? ROUTING_MATRIX['general'];
  return typeMatrix[complexity] ?? typeMatrix['medium'];
}
