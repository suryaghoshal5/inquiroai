import { callAI } from './openrouter';
import { EVALUATOR_MODEL } from './config';

export interface EvaluationResult {
  score: number;
  issues: string[];
  improved_prompt: string;
  prompt_type: PromptType;
  complexity: 'low' | 'medium' | 'high';
  show_suggestion: boolean;
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
      EVALUATOR_MODEL,
      EVALUATOR_SYSTEM_PROMPT
    );

    const parsed = JSON.parse(result.content) as Omit<EvaluationResult, 'show_suggestion'>;
    return {
      ...parsed,
      show_suggestion: parsed.score < 7,
    };
  } catch {
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
