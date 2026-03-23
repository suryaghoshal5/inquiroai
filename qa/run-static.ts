#!/usr/bin/env tsx
// Runs all static analyzers and prints a structured report + JSON output
import { auditRoutes } from './static/routeAuditor.js';
import { auditEnv } from './static/envAuditor.js';
import { auditDbQueries } from './static/dbQueryAuditor.js';
import { auditConsoleLogs } from './static/consoleSanitizer.js';
import { formatIssue } from './reporter.js';
import type { StaticAuditReport, Severity } from './types.js';

const SEV_ORDER: Severity[] = ['P0', 'P1', 'P2', 'P3'];

async function main() {
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  InquiroAI — Static QA Audit');
  console.log('  ' + new Date().toISOString());
  console.log('═══════════════════════════════════════════════════════\n');

  const results = [
    auditRoutes(),
    auditEnv(),
    auditDbQueries(),
    auditConsoleLogs(),
  ];

  const allIssues = results.flatMap(r => r.issues);
  const bySeverity = Object.fromEntries(
    SEV_ORDER.map(s => [s, allIssues.filter(i => i.severity === s).length])
  ) as Record<Severity, number>;

  // ── Print per-auditor results ─────────────────────────────────────────────
  for (const result of results) {
    console.log(`\n── ${result.auditor} (${result.durationMs}ms) ──`);
    if (result.issues.length === 0) {
      console.log('  ✓ No issues found');
    } else {
      for (const issue of result.issues.sort((a, b) =>
        SEV_ORDER.indexOf(a.severity) - SEV_ORDER.indexOf(b.severity)
      )) {
        console.log('\n' + formatIssue(issue).split('\n').map(l => '  ' + l).join('\n'));
      }
    }
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  SUMMARY');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`  Total issues : ${allIssues.length}`);
  for (const sev of SEV_ORDER) {
    const count = bySeverity[sev];
    const icon = sev === 'P0' ? '🔴' : sev === 'P1' ? '🟠' : sev === 'P2' ? '🟡' : '⚪';
    if (count > 0) console.log(`  ${icon} ${sev}          : ${count}`);
  }
  console.log('');

  // ── JSON output (for programmatic consumption) ────────────────────────────
  const report: StaticAuditReport = {
    runAt: new Date().toISOString(),
    results,
    totalIssues: allIssues.length,
    bySeverity,
  };

  // Write JSON report to qa/last-static-report.json
  const { writeFileSync } = await import('fs');
  const { join, dirname } = await import('path');
  const { fileURLToPath } = await import('url');
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const outPath = join(__dirname, 'last-static-report.json');
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`  Report saved: qa/last-static-report.json\n`);
}

main().catch(err => {
  console.error('Static audit failed:', err);
  process.exit(1);
});
