#!/usr/bin/env tsx
// Runs all API tests against a live server and prints a structured report
import { testHappyPath } from './api/endpointTester.js';
import { testEdgeCases } from './api/edgeCaseTester.js';
import { testAuthBoundaries } from './api/authBoundaryTester.js';
import { testFileUpload } from './api/fileUploadTester.js';
import { formatIssue } from './reporter.js';
import { QA_CONFIG } from './config.js';
import type { StaticAuditReport, Severity, TestResult } from './types.js';

const SEV_ORDER: Severity[] = ['P0', 'P1', 'P2', 'P3'];

async function checkServerReachable(): Promise<boolean> {
  try {
    const res = await fetch(`${QA_CONFIG.baseUrl}/api/ai-providers`, {
      signal: AbortSignal.timeout(5000),
    });
    return res.status < 500;
  } catch {
    return false;
  }
}

async function main() {
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  InquiroAI — API QA Tests');
  console.log('  Target: ' + QA_CONFIG.baseUrl);
  console.log('  ' + new Date().toISOString());
  console.log('═══════════════════════════════════════════════════════\n');

  // Check server is up
  const reachable = await checkServerReachable();
  if (!reachable) {
    console.error(`\n  ✗ Server unreachable at ${QA_CONFIG.baseUrl}`);
    console.error('  Start the server first: npm run dev');
    console.error('  Or set QA_BASE_URL=https://your-replit-app.replit.app\n');
    process.exit(1);
  }
  console.log(`  ✓ Server reachable at ${QA_CONFIG.baseUrl}\n`);

  const results: TestResult[] = [];

  // Run all testers, catching individual failures so one crash doesn't abort all
  const runners: Array<{ name: string; fn: () => Promise<TestResult> }> = [
    { name: 'Happy Path', fn: testHappyPath },
    { name: 'Edge Cases', fn: testEdgeCases },
    { name: 'Auth Boundaries', fn: testAuthBoundaries },
    { name: 'File Upload', fn: testFileUpload },
  ];

  for (const { name, fn } of runners) {
    try {
      const result = await fn();
      results.push(result);
    } catch (err) {
      console.error(`  ✗ ${name} tester threw an exception:`, (err as Error).message);
      results.push({
        auditor: name,
        phase: 'api',
        issues: [{
          title: `${name} tester crashed`,
          severity: 'P1',
          phase: 'api',
          category: 'test-infrastructure',
          reproSteps: [`Run qa/run-api.ts and observe crash in ${name} tester`],
          expected: 'Test completes without throwing',
          actual: (err as Error).message,
          timestamp: new Date().toISOString(),
        }],
        passCount: 0,
        failCount: 1,
        durationMs: 0,
      });
    }
  }

  const allIssues = results.flatMap(r => r.issues);
  const bySeverity = Object.fromEntries(
    SEV_ORDER.map(s => [s, allIssues.filter(i => i.severity === s).length])
  ) as Record<Severity, number>;

  // ── Print per-tester results ──────────────────────────────────────────────
  for (const result of results) {
    console.log(`\n── ${result.auditor} (${result.durationMs}ms) — ${result.passCount} passed, ${result.failCount} failed ──`);
    if (result.issues.length === 0) {
      console.log('  ✓ All checks passed');
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
  console.log('  API TEST SUMMARY');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`  Total issues : ${allIssues.length}`);
  for (const sev of SEV_ORDER) {
    const count = bySeverity[sev];
    const icon = sev === 'P0' ? '🔴' : sev === 'P1' ? '🟠' : sev === 'P2' ? '🟡' : '⚪';
    if (count > 0) console.log(`  ${icon} ${sev}          : ${count}`);
  }
  console.log('');

  // ── JSON report ───────────────────────────────────────────────────────────
  const { writeFileSync } = await import('fs');
  const { join, dirname } = await import('path');
  const { fileURLToPath } = await import('url');
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const outPath = join(__dirname, 'last-api-report.json');

  const report: StaticAuditReport = {
    runAt: new Date().toISOString(),
    results,
    totalIssues: allIssues.length,
    bySeverity,
  };

  writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`  Report saved: qa/last-api-report.json\n`);
}

main().catch(err => {
  console.error('API test run failed:', err);
  process.exit(1);
});
