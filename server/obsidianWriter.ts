import fs from 'fs/promises';
import path from 'path';
import type { GraphEntity } from './obsidianGraph';

const ENTITY_FOLDERS: Record<string, string> = {
  project:       'projects',
  decision:      'decisions',
  concept:       'concepts',
  person:        'people',
  open_question: 'open-questions',
  session:       'sessions',
};

export interface WriteResult {
  created: number;
  updated: number;
}

/** Bootstrap the vault folder structure if it doesn't exist */
export async function bootstrapVault(vaultPath: string): Promise<void> {
  const folders = [
    'projects', 'decisions', 'concepts', 'people',
    'open-questions', 'sessions', 'templates',
  ];
  await Promise.all(
    folders.map(f => fs.mkdir(path.join(vaultPath, f), { recursive: true }))
  );
}

/** Strip characters that are invalid in filenames */
function sanitizeFilename(title: string): string {
  return title
    .replace(/[/\\:*?"<>|#%{}^[\]`]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);
}

/** Check whether a file exists */
async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function buildNoteContent(
  entity: GraphEntity,
  chatId: number,
  date: string
): string {
  const tagsStr = (entity.tags ?? []).join(', ');
  const relationshipLines = (entity.relationships ?? [])
    .map(r => `- [[${r.target}]] — ${r.type}`)
    .join('\n');

  return `---
type: ${entity.type}
created: ${date}
updated: ${date}
source_chat_ids: [${chatId}]
tags: [${tagsStr}]
---

# ${entity.title}

${entity.content}

## Related
${relationshipLines || '_No relationships yet_'}

## Source Sessions
- Chat #${chatId} (${date})
`;
}

async function appendToExistingNote(
  filePath: string,
  entity: GraphEntity,
  chatId: number,
  date: string
): Promise<void> {
  let existing = await fs.readFile(filePath, 'utf-8');

  // Update the `updated` date in frontmatter
  existing = existing.replace(/^updated: .+$/m, `updated: ${date}`);

  // Add chatId to source_chat_ids array if not already present
  existing = existing.replace(
    /^source_chat_ids: \[(.*)]/m,
    (_, ids) => {
      const idList = ids.split(',').map((s: string) => s.trim()).filter(Boolean);
      if (!idList.includes(String(chatId))) {
        idList.push(String(chatId));
      }
      return `source_chat_ids: [${idList.join(', ')}]`;
    }
  );

  // Append new source session line at end of ## Source Sessions section (or end of file)
  const sessionLine = `- Chat #${chatId} (${date})`;
  if (!existing.includes(sessionLine)) {
    existing = existing.trimEnd() + `\n${sessionLine}\n`;
  }

  // Merge new relationships (add any that don't already appear as wikilinks)
  for (const rel of entity.relationships ?? []) {
    const wikilink = `[[${rel.target}]]`;
    if (!existing.includes(wikilink)) {
      const relLine = `- ${wikilink} — ${rel.type}`;
      // Insert before the ## Source Sessions heading, or at end of ## Related block
      if (existing.includes('## Related')) {
        existing = existing.replace(
          /(## Related[\s\S]*?)(## Source Sessions)/,
          (_, relSection, nextSection) => `${relSection.trimEnd()}\n${relLine}\n\n${nextSection}`
        );
      }
    }
  }

  await fs.writeFile(filePath, existing, 'utf-8');
}

export async function writeEntityToVault(
  vaultPath: string,
  entity: GraphEntity,
  sourceChatId: number,
  sourceDate: string
): Promise<'created' | 'updated'> {
  const folder = ENTITY_FOLDERS[entity.type] ?? 'concepts';
  const folderPath = path.join(vaultPath, folder);
  await fs.mkdir(folderPath, { recursive: true });

  const filename = sanitizeFilename(entity.title) + '.md';
  const filePath = path.join(folderPath, filename);

  if (await fileExists(filePath)) {
    await appendToExistingNote(filePath, entity, sourceChatId, sourceDate);
    return 'updated';
  } else {
    const content = buildNoteContent(entity, sourceChatId, sourceDate);
    await fs.writeFile(filePath, content, 'utf-8');
    return 'created';
  }
}

export async function writeEntitiesToVault(
  vaultPath: string,
  entities: GraphEntity[],
  sourceChatId: number
): Promise<WriteResult> {
  await bootstrapVault(vaultPath);
  const date = new Date().toISOString().split('T')[0];

  let created = 0;
  let updated = 0;

  for (const entity of entities) {
    try {
      const result = await writeEntityToVault(vaultPath, entity, sourceChatId, date);
      if (result === 'created') created++;
      else updated++;
    } catch {
      // Silent per-entity failure — continue with remaining entities
    }
  }

  return { created, updated };
}
