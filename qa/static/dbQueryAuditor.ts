// DB query auditor: checks Drizzle ORM usage in server code
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

export function auditDbQueries(): TestResult {
  const start = Date.now();
  const issues: QAIssue[] = [];
  let passCount = 0;

  const allServerFiles = walkDir(QA_CONFIG.serverDir, ['.ts']);
  const repoRoot = QA_CONFIG.repoRoot;

  for (const file of allServerFiles) {
    const src = readFileSync(file, 'utf-8');
    const lines = src.split('\n');
    const relFile = relative(repoRoot, file);

    // ── 1. .select() without .limit() on list queries ─────────────────────
    // Find db.select() chains that lack .limit()
    const selectPattern = /db\.select\([^)]*\)\s*\.from\([^)]+\)/g;
    let match: RegExpExecArray | null;
    while ((match = selectPattern.exec(src)) !== null) {
      // Check whether .limit( appears in the next 300 chars of the same chain
      const chain = src.slice(match.index, match.index + 400);
      const hasLimit = /\.limit\s*\(/.test(chain);
      const hasWhere = /\.where\s*\(/.test(chain);
      const lineNum = src.slice(0, match.index).split('\n').length;

      if (!hasLimit && !hasWhere) {
        // Only flag unbounded selects with no WHERE clause
        issues.push({
          title: `Unbounded DB select() with no .limit() or .where()`,
          severity: 'P2',
          phase: 'static',
          category: 'database',
          file: relFile,
          line: lineNum,
          reproSteps: [
            `Inspect ${relFile}:${lineNum}`,
            'Query fetches all rows with no limit — could be a full table scan',
          ],
          expected: '.limit(N) or .where() clause present on select queries',
          actual: 'Unbounded select — may return all rows, causing performance issues at scale',
          timestamp: now(),
        });
      } else {
        passCount++;
      }
    }

    // ── 2. Raw SQL strings ────────────────────────────────────────────────
    const rawSqlPattern = /sql`[^`]+`|db\.execute\s*\(/g;
    while ((match = rawSqlPattern.exec(src)) !== null) {
      const lineNum = src.slice(0, match.index).split('\n').length;
      const lineContent = lines[lineNum - 1] || '';
      // Skip comments
      if (/^\s*\/\//.test(lineContent)) continue;

      issues.push({
        title: `Raw SQL detected — potential injection risk`,
        severity: 'P1',
        phase: 'static',
        category: 'database',
        file: relFile,
        line: lineNum,
        reproSteps: [
          `Review ${relFile}:${lineNum}`,
          'Verify all interpolated values are parameterized, not concatenated',
        ],
        expected: 'Drizzle ORM typed query builder used for all queries',
        actual: 'Raw sql`` template or db.execute() found — verify parameterization',
        timestamp: now(),
      });
    }

    // ── 3. Multi-step writes without transactions ─────────────────────────
    // Look for functions that call db.insert/update/delete multiple times without db.transaction
    const funcPattern = /async function\s+\w+[^{]*\{|async \w+\s*\([^)]*\)\s*\{/g;
    while ((match = funcPattern.exec(src)) !== null) {
      const funcStart = match.index;
      // Find end of function (rough heuristic: next blank line after closing brace at same indent)
      const funcEnd = Math.min(funcStart + 2000, src.length);
      const funcBody = src.slice(funcStart, funcEnd);

      const writeCount = (funcBody.match(/db\.(insert|update|delete)\s*\(/g) || []).length;
      const hasTransaction = /db\.transaction|\.transaction\(/.test(funcBody);

      if (writeCount >= 2 && !hasTransaction) {
        const lineNum = src.slice(0, funcStart).split('\n').length;
        issues.push({
          title: `Multi-step DB write without transaction wrapper`,
          severity: 'P2',
          phase: 'static',
          category: 'database',
          file: relFile,
          line: lineNum,
          reproSteps: [
            `Inspect ${relFile}:${lineNum}`,
            'Function performs multiple DB writes — if one fails, data may be partially written',
          ],
          expected: 'Multiple DB writes wrapped in db.transaction() for atomicity',
          actual: `${writeCount} DB writes found without transaction — partial write risk`,
          timestamp: now(),
        });
      } else if (writeCount > 0) {
        passCount++;
      }
    }

    // ── 4. Missing null check after .get() / findFirst() ─────────────────
    const getPattern = /await\s+\w+\.(?:get|findFirst)\s*\([^)]*\)/g;
    while ((match = getPattern.exec(src)) !== null) {
      const lineNum = src.slice(0, match.index).split('\n').length;
      // Check the next ~5 lines for a null check
      const nextLines = lines.slice(lineNum, lineNum + 6).join('\n');
      const hasNullCheck = /if\s*\(!|=== undefined|=== null|\?\?|!result|!chat|!user|!key/.test(nextLines);
      if (!hasNullCheck) {
        // Only flag storage.ts and routes.ts (not test fixtures)
        if (relFile.includes('storage') || relFile.includes('routes')) {
          issues.push({
            title: `Result of .get()/.findFirst() used without null check`,
            severity: 'P2',
            phase: 'static',
            category: 'database',
            file: relFile,
            line: lineNum,
            reproSteps: [
              `Look at ${relFile}:${lineNum}`,
              'Call the route/function with a non-existent ID',
            ],
            expected: 'Null/undefined check before accessing result properties',
            actual: 'Query result used directly — may throw if record not found',
            timestamp: now(),
          });
        }
      } else {
        passCount++;
      }
    }
  }

  return {
    auditor: 'dbQueryAuditor',
    phase: 'static',
    issues,
    passCount,
    failCount: issues.length,
    durationMs: Date.now() - start,
  };
}
