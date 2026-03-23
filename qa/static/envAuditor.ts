// Env auditor: finds undocumented env vars and hardcoded secrets in server code
import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join, relative } from 'path';
import type { QAIssue, TestResult } from '../types.js';
import { QA_CONFIG } from '../config.js';

function now() { return new Date().toISOString(); }

function walkDir(dir: string, exts: string[]): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory() && !['node_modules', '.git', 'dist'].includes(entry)) {
      results.push(...walkDir(full, exts));
    } else if (exts.some(e => entry.endsWith(e))) {
      results.push(full);
    }
  }
  return results;
}

export function auditEnv(): TestResult {
  const start = Date.now();
  const issues: QAIssue[] = [];
  let passCount = 0;

  const serverFiles = walkDir(QA_CONFIG.serverDir, ['.ts', '.js']);
  const repoRoot = QA_CONFIG.repoRoot;

  // ── 1. Collect all process.env.X references ───────────────────────────────
  const envVarPattern = /process\.env\.([A-Z_][A-Z0-9_]*)/g;
  const usedVars = new Map<string, { file: string; line: number }[]>();

  for (const file of serverFiles) {
    const src = readFileSync(file, 'utf-8');
    const lines = src.split('\n');
    let match: RegExpExecArray | null;
    while ((match = envVarPattern.exec(src)) !== null) {
      const varName = match[1];
      const lineNum = src.slice(0, match.index).split('\n').length;
      if (!usedVars.has(varName)) usedVars.set(varName, []);
      usedVars.get(varName)!.push({ file: relative(repoRoot, file), line: lineNum });
    }
    envVarPattern.lastIndex = 0;
  }

  // ── 2. Compare against documented vars ────────────────────────────────────
  // Vars that are documented/expected per CLAUDE.md
  const documentedVars = new Set([
    'DATABASE_URL',
    'SESSION_SECRET',
    'ENCRYPTION_KEY',
    'NODE_ENV',
    'OPENAI_API_KEY',
    'ANTHROPIC_API_KEY',
    'GOOGLE_API_KEY',
    'GROK_API_KEY',
    'REPLIT_DOMAINS',
    'ISSUER_URL',
    'REPL_ID',
    'PORT',
    // New vars from Layer 1+
    'OPENROUTER_API_KEY',
    'APP_URL',
    'NOTION_API_KEY',
    'NOTION_MEMORY_DATABASE_ID',
  ]);

  for (const [varName, occurrences] of usedVars.entries()) {
    if (!documentedVars.has(varName)) {
      const first = occurrences[0];
      issues.push({
        title: `Undocumented env var: process.env.${varName}`,
        severity: 'P3',
        phase: 'static',
        category: 'config',
        file: first.file,
        line: first.line,
        reproSteps: [
          `Search server code for process.env.${varName}`,
          'Check .env.example — var is not documented',
        ],
        expected: `${varName} documented in .env.example`,
        actual: `${varName} used in code but not in documented env var list`,
        timestamp: now(),
      });
    } else {
      passCount++;
    }
  }

  // ── 3. Check .env.example exists ──────────────────────────────────────────
  const envExamplePath = join(repoRoot, '.env.example');
  if (!existsSync(envExamplePath)) {
    issues.push({
      title: '.env.example file missing from repo root',
      severity: 'P2',
      phase: 'static',
      category: 'config',
      file: '.env.example',
      reproSteps: [
        'Look for .env.example in repo root',
        'File does not exist',
      ],
      expected: '.env.example documenting all required environment variables',
      actual: 'No .env.example — new contributors have no reference for required env vars',
      timestamp: now(),
    });
  } else {
    passCount++;
  }

  // ── 4. Scan for hardcoded secret patterns ────────────────────────────────
  const secretPatterns: Array<{ name: string; regex: RegExp }> = [
    { name: 'OpenAI API key', regex: /sk-[A-Za-z0-9]{20,}/ },
    { name: 'Anthropic API key', regex: /sk-ant-[A-Za-z0-9\-]{20,}/ },
    { name: 'OpenRouter API key', regex: /sk-or-[A-Za-z0-9\-]{20,}/ },
    { name: 'Postgres connection string', regex: /postgresql:\/\/[^'"]+:[^'"]+@/ },
    { name: 'Generic high-entropy string', regex: /['"][A-Za-z0-9+/]{40,}['"]/ },
  ];

  for (const file of serverFiles) {
    const src = readFileSync(file, 'utf-8');
    const lines = src.split('\n');
    for (const { name, regex } of secretPatterns) {
      let match: RegExpExecArray | null;
      const g = new RegExp(regex.source, 'g');
      while ((match = g.exec(src)) !== null) {
        // Skip if it's inside a comment or looks like a test value
        const lineNum = src.slice(0, match.index).split('\n').length;
        const lineContent = lines[lineNum - 1] || '';
        if (/^\s*\/\//.test(lineContent) || /^\s*\*/.test(lineContent)) continue;
        if (/test|example|placeholder|your[_-]?key/i.test(lineContent)) continue;

        issues.push({
          title: `Potential hardcoded ${name} found`,
          severity: 'P1',
          phase: 'static',
          category: 'security',
          file: relative(repoRoot, file),
          line: lineNum,
          reproSteps: [
            `Open ${relative(repoRoot, file)} at line ${lineNum}`,
            'Inspect the literal string value',
          ],
          expected: 'Secrets loaded from process.env, not hardcoded',
          actual: `Pattern matching ${name} found as literal string`,
          timestamp: now(),
        });
      }
    }
    passCount++;
  }

  return {
    auditor: 'envAuditor',
    phase: 'static',
    issues,
    passCount,
    failCount: issues.length,
    durationMs: Date.now() - start,
  };
}
