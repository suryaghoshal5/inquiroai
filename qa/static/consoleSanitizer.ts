// Console sanitizer: flags sensitive console.log output and TODO/FIXME comments
import { readFileSync, readdirSync, statSync } from 'fs';
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

// Keywords that suggest a console.log near sensitive data
const SENSITIVE_KEYWORDS = [
  'apiKey', 'api_key', 'encryptedKey', 'password', 'secret', 'token',
  'content', 'message', 'userId', 'session', 'DATABASE_URL', 'ENCRYPTION_KEY',
];

export function auditConsoleLogs(): TestResult {
  const start = Date.now();
  const issues: QAIssue[] = [];
  let passCount = 0;

  const serverFiles = walkDir(QA_CONFIG.serverDir, ['.ts', '.js']);
  const repoRoot = QA_CONFIG.repoRoot;

  for (const file of serverFiles) {
    const src = readFileSync(file, 'utf-8');
    const lines = src.split('\n');
    const relFile = relative(repoRoot, file);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;

      // Skip comment lines
      if (/^\s*\/\//.test(line) || /^\s*\*/.test(line)) continue;

      // ── 1. console.log with potentially sensitive data ────────────────────
      if (/console\.(log|warn|error|debug|info)\s*\(/.test(line)) {
        const isSensitive = SENSITIVE_KEYWORDS.some(kw =>
          line.toLowerCase().includes(kw.toLowerCase())
        );

        if (isSensitive) {
          // Determine severity: console.log is P2, console.error with stack is P2
          const severity = line.includes('content') || line.includes('message')
            ? 'P2'
            : 'P3';

          issues.push({
            title: `console.log may output sensitive data`,
            severity,
            phase: 'static',
            category: 'privacy',
            file: relFile,
            line: lineNum,
            reproSteps: [
              `Inspect ${relFile}:${lineNum}`,
              'Trigger the code path that executes this log',
              'Check server stdout for sensitive output',
            ],
            expected: 'Sensitive fields omitted or redacted from log output',
            actual: `console statement on line ${lineNum} references sensitive keyword(s): ${
              SENSITIVE_KEYWORDS.filter(kw => line.toLowerCase().includes(kw.toLowerCase())).join(', ')
            }`,
            timestamp: now(),
          });
        } else {
          passCount++;
        }
      }

      // ── 2. TODO / FIXME / HACK comments ──────────────────────────────────
      if (/\b(TODO|FIXME|HACK|XXX)\b/.test(line)) {
        issues.push({
          title: `Code marker found: ${line.match(/\b(TODO|FIXME|HACK|XXX)\b/)?.[0]}`,
          severity: 'P3',
          phase: 'static',
          category: 'code-quality',
          file: relFile,
          line: lineNum,
          reproSteps: [`Review ${relFile}:${lineNum}`],
          expected: 'No unresolved TODO/FIXME markers in production code',
          actual: line.trim(),
          timestamp: now(),
        });
      }
    }
  }

  return {
    auditor: 'consoleSanitizer',
    phase: 'static',
    issues,
    passCount,
    failCount: issues.length,
    durationMs: Date.now() - start,
  };
}
