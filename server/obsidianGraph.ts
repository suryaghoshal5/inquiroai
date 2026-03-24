import { callAI } from './openrouter';
import type { ChatMessage } from './openrouter';

export interface GraphEntity {
  type: 'project' | 'decision' | 'concept' | 'person' | 'open_question';
  title: string;
  content: string;
  tags: string[];
  relationships: Array<{ target: string; type: string }>;
}

export interface ExtractionResult {
  entities: GraphEntity[];
}

const EXTRACTOR_SYSTEM_PROMPT = `You are a knowledge graph entity extractor for a professional AI workspace.
Analyze the conversation and extract structured entities worth remembering across sessions.
Respond ONLY with valid JSON — no markdown, no explanation:
{
  "entities": [
    {
      "type": "<project|decision|concept|person|open_question>",
      "title": "<concise title for the note, max 60 chars>",
      "content": "<2-5 sentence description capturing the key insight>",
      "tags": ["tag1", "tag2"],
      "relationships": [
        { "target": "<title of related entity>", "type": "<relates_to|depends_on|decided_in|raised_by>" }
      ]
    }
  ]
}

Rules:
- Extract ONLY entities worth remembering long-term: decisions with rationale, key concepts, technical frameworks, open questions that recur
- Skip trivial exchanges, greetings, small clarifications
- Prefer fewer (2-6) high-quality entities over many shallow ones
- Each entity must have a non-empty title and content
- relationships array may be empty []`;

export async function extractEntities(
  messages: ChatMessage[],
  projectName?: string
): Promise<ExtractionResult> {
  try {
    const transcript = messages
      .map(m => `${m.role.toUpperCase()}: ${m.content.slice(0, 500)}`)
      .join('\n\n')
      .slice(0, 8000);

    const contextHint = projectName
      ? `This conversation is part of the "${projectName}" project.\n\n`
      : '';

    const result = await callAI(
      [{
        role: 'user',
        content: `${contextHint}Extract knowledge entities from this conversation:\n\n${transcript}`,
      }],
      'anthropic/claude-haiku-4-5',
      EXTRACTOR_SYSTEM_PROMPT
    );

    const parsed = JSON.parse(result.content) as ExtractionResult;

    // Validate shape
    if (!Array.isArray(parsed.entities)) {
      return { entities: [] };
    }

    const valid = parsed.entities.filter(
      e => e.type && e.title?.trim() && e.content?.trim()
    );

    return { entities: valid };
  } catch {
    return { entities: [] };
  }
}
