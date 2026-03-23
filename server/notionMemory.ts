import { Client } from '@notionhq/client';
import { callAI } from './openrouter';
import type { ChatMessage } from './openrouter';

export interface ChatMemoryEntry {
  title: string;
  date: string;
  platform: 'inquiroai';
  project: string;
  tags: string[];
  type: 'ANALYSIS' | 'RESEARCH' | 'BUILD' | 'BD' | 'OPS' | 'STRATEGY' | 'GEN';
  summary: string;
  decisions: string[];
  open_questions: string[];
  full_transcript_url?: string;
  model_used: string;
  total_tokens: number;
  cost_usd: number;
}

function getNotionClient(): Client | null {
  if (!process.env.NOTION_API_KEY) return null;
  return new Client({ auth: process.env.NOTION_API_KEY });
}

export async function classifyAndArchiveChat(
  messages: ChatMessage[],
  metadata: {
    model: string;
    total_tokens: number;
    cost_usd: number;
    chat_url: string;
    project_name?: string;
  }
): Promise<ChatMemoryEntry> {
  const transcript = messages
    .map(m => `${m.role.toUpperCase()}: ${m.content.slice(0, 500)}`)
    .join('\n\n')
    .slice(0, 8000);

  const classificationResult = await callAI(
    [{
      role: 'user',
      content: `Analyze this conversation and respond ONLY with valid JSON:\n\n${transcript}`,
    }],
    'anthropic/claude-haiku-4-5',
    `You are a conversation classifier for a professional AI workspace. Respond ONLY with JSON matching exactly:
{
  "title": "<concise descriptive title under 60 chars>",
  "project": "<infer project name from context>",
  "tags": ["tag1", "tag2", "tag3"],
  "type": "<one of: ANALYSIS|RESEARCH|BUILD|BD|OPS|STRATEGY|GEN>",
  "summary": "<3 sentence summary>",
  "decisions": ["decision1", "decision2"],
  "open_questions": ["question1", "question2"]
}
No markdown, no explanation, JSON only.`
  );

  let classification: Partial<ChatMemoryEntry>;
  try {
    classification = JSON.parse(classificationResult.content);
  } catch {
    classification = {
      title: 'Chat Archive',
      project: metadata.project_name || 'Unknown',
      tags: [],
      type: 'GEN',
      summary: 'Chat archived.',
      decisions: [],
      open_questions: [],
    };
  }

  const entry: ChatMemoryEntry = {
    title: (classification.title as string) || 'Chat Archive',
    date: new Date().toISOString().split('T')[0],
    platform: 'inquiroai',
    project: metadata.project_name || (classification.project as string) || 'Unknown',
    tags: (classification.tags as string[]) || [],
    type: (classification.type as ChatMemoryEntry['type']) || 'GEN',
    summary: (classification.summary as string) || '',
    decisions: (classification.decisions as string[]) || [],
    open_questions: (classification.open_questions as string[]) || [],
    full_transcript_url: metadata.chat_url,
    model_used: metadata.model,
    total_tokens: metadata.total_tokens,
    cost_usd: metadata.cost_usd,
  };

  const notion = getNotionClient();
  const databaseId = process.env.NOTION_MEMORY_DATABASE_ID;

  if (notion && databaseId) {
    await writeToNotion(notion, databaseId, entry);
  }

  return entry;
}

async function writeToNotion(notion: Client, databaseId: string, entry: ChatMemoryEntry): Promise<void> {
  await notion.pages.create({
    parent: { database_id: databaseId },
    properties: {
      Title: { title: [{ text: { content: entry.title } }] },
      Date: { date: { start: entry.date } },
      Project: { select: { name: entry.project } },
      Type: { select: { name: entry.type } },
      Tags: { multi_select: entry.tags.map(t => ({ name: t })) },
      Platform: { select: { name: entry.platform } },
      'Model Used': { rich_text: [{ text: { content: entry.model_used } }] },
      'Total Tokens': { number: entry.total_tokens },
      'Cost USD': { number: Math.round(entry.cost_usd * 10000) / 10000 },
    },
    children: [
      {
        object: 'block',
        type: 'heading_2',
        heading_2: { rich_text: [{ text: { content: 'Summary' } }] },
      },
      {
        object: 'block',
        type: 'paragraph',
        paragraph: { rich_text: [{ text: { content: entry.summary } }] },
      },
      {
        object: 'block',
        type: 'heading_2',
        heading_2: { rich_text: [{ text: { content: 'Key Decisions' } }] },
      },
      ...entry.decisions.map(d => ({
        object: 'block' as const,
        type: 'bulleted_list_item' as const,
        bulleted_list_item: { rich_text: [{ text: { content: d } }] },
      })),
      {
        object: 'block',
        type: 'heading_2',
        heading_2: { rich_text: [{ text: { content: 'Open Questions' } }] },
      },
      ...entry.open_questions.map(q => ({
        object: 'block' as const,
        type: 'bulleted_list_item' as const,
        bulleted_list_item: { rich_text: [{ text: { content: q } }] },
      })),
      ...(entry.full_transcript_url ? [{
        object: 'block' as const,
        type: 'bookmark' as const,
        bookmark: { url: entry.full_transcript_url },
      }] : []),
    ],
  });
}
