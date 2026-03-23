// Asana bug filing reporter for QA agent
import type { QAIssue, Severity } from './types.js';
import { QA_CONFIG } from './config.js';

const PRIORITY_MAP: Record<Severity, string> = {
  P0: '🔴 P0 [CRITICAL]',
  P1: '🟠 P1 [HIGH]',
  P2: '🟡 P2 [MEDIUM]',
  P3: '⚪ P3 [LOW]',
};

function buildTaskName(issue: QAIssue): string {
  return `${PRIORITY_MAP[issue.severity]} ${issue.title} | Phase: ${issue.phase}`;
}

function buildTaskNotes(issue: QAIssue): string {
  const lines: string[] = [];
  lines.push(`Category: ${issue.category}`);
  if (issue.file) lines.push(`File: ${issue.file}${issue.line ? `:${issue.line}` : ''}`);
  lines.push('');
  lines.push('Steps to reproduce:');
  issue.reproSteps.forEach((s, i) => lines.push(`  ${i + 1}. ${s}`));
  lines.push('');
  lines.push(`Expected: ${issue.expected}`);
  lines.push(`Actual:   ${issue.actual}`);
  lines.push('');
  lines.push(`Timestamp: ${issue.timestamp}`);
  return lines.join('\n');
}

export async function fileIssueToAsana(issue: QAIssue): Promise<string | null> {
  if (!QA_CONFIG.asanaApiKey) {
    // No API key — caller should use MCP tool instead
    return null;
  }

  const body = {
    data: {
      name: buildTaskName(issue),
      notes: buildTaskNotes(issue),
      projects: [QA_CONFIG.asanaProjectId],
    },
  };

  const res = await fetch('https://app.asana.com/api/1.0/tasks', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${QA_CONFIG.asanaApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    console.error('Asana filing failed:', await res.text());
    return null;
  }

  const data = (await res.json()) as { data: { gid: string } };
  return data.data.gid;
}

// Format issue as a human-readable string for console output
export function formatIssue(issue: QAIssue): string {
  return [
    `[${issue.severity}] ${issue.title}`,
    `  Phase: ${issue.phase} | Category: ${issue.category}`,
    issue.file ? `  File: ${issue.file}${issue.line ? `:${issue.line}` : ''}` : null,
    `  Expected: ${issue.expected}`,
    `  Actual:   ${issue.actual}`,
  ]
    .filter(Boolean)
    .join('\n');
}

// Build task name + notes for filing via MCP (no API key needed)
export function buildAsanaTask(issue: QAIssue): { name: string; notes: string } {
  return {
    name: buildTaskName(issue),
    notes: buildTaskNotes(issue),
  };
}
