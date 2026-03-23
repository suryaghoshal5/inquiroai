// Route auditor: checks server/routes.ts for auth gaps, error handling, input validation
import { readFileSync } from 'fs';
import { join } from 'path';
import type { QAIssue, TestResult } from '../types.js';
import { QA_CONFIG } from '../config.js';

function now() { return new Date().toISOString(); }

export function auditRoutes(): TestResult {
  const start = Date.now();
  const issues: QAIssue[] = [];
  let passCount = 0;

  const routesPath = join(QA_CONFIG.serverDir, 'routes.ts');
  const src = readFileSync(routesPath, 'utf-8');
  const lines = src.split('\n');

  // ── Helper: find line number of a pattern ──────────────────────────────────
  function lineOf(pattern: RegExp, after = 0): number {
    for (let i = after; i < lines.length; i++) {
      if (pattern.test(lines[i])) return i + 1; // 1-indexed
    }
    return 0;
  }

  // ── 1. Routes with no auth middleware ──────────────────────────────────────
  // Find all app.get/post/delete/put/patch calls and check if mockAuth appears
  const routePattern = /app\.(get|post|delete|put|patch)\s*\(\s*['"`]([^'"`]+)['"`]/g;
  let match: RegExpExecArray | null;
  const unprotectedRoutesThatShouldBeProtected: string[] = [];

  while ((match = routePattern.exec(src)) !== null) {
    const method = match[1].toUpperCase();
    const path = match[2];

    // Extract the handler block for this route to check for mockAuth
    const routeStart = match.index;
    // Find the next route declaration after this one
    const nextRouteIdx = src.indexOf('\n  app.', routeStart + 10);
    const block = nextRouteIdx > -1
      ? src.slice(routeStart, nextRouteIdx)
      : src.slice(routeStart);

    const hasAuth = /mockAuth|isAuthenticated/.test(block);
    const lineNum = lineOf(new RegExp(`app\\.${match[1]}\\s*\\(\\s*['"\`]${path.replace(/\//g, '\\/')}['"\`]`));

    // Routes that definitely should require auth
    const shouldRequireAuth = [
      '/api/initialize-prompts',
      '/api/ai-providers/refresh',
    ];

    if (!hasAuth && shouldRequireAuth.includes(path)) {
      issues.push({
        title: `${method} ${path} — missing auth middleware`,
        severity: 'P1',
        phase: 'static',
        category: 'auth',
        file: 'server/routes.ts',
        line: lineNum,
        reproSteps: [
          `Send ${method} ${path} without a session cookie`,
          'Observe response',
        ],
        expected: '401 Unauthorized',
        actual: 'Route executes without authentication check',
        timestamp: now(),
      });
      unprotectedRoutesThatShouldBeProtected.push(path);
    } else if (hasAuth || !shouldRequireAuth.includes(path)) {
      passCount++;
    }
  }

  // ── 2. Error responses leaking internal details ────────────────────────────
  // Look for places that send error.message to the client
  const errorMsgLeakPattern = /res\.status\(500\)\.json\(\s*\{[^}]*error\.message/g;
  while ((match = errorMsgLeakPattern.exec(src)) !== null) {
    const lineNum = src.slice(0, match.index).split('\n').length;
    issues.push({
      title: 'Server error response leaks internal error.message to client',
      severity: 'P2',
      phase: 'static',
      category: 'security',
      file: 'server/routes.ts',
      line: lineNum,
      reproSteps: [
        'Trigger a server error on POST /api/chats/:id/messages (e.g. DB unavailable)',
        'Inspect response body',
      ],
      expected: 'Generic error message: { message: "Failed to send message" }',
      actual: 'Response includes raw error.message which may expose stack/internal detail',
      timestamp: now(),
    });
  }

  // ── 3. Provider field not validated against allowlist on POST /api/api-keys ──
  const apiKeyRoute = src.indexOf("app.post('/api/api-keys'");
  if (apiKeyRoute > -1) {
    const block = src.slice(apiKeyRoute, src.indexOf('\n  app.', apiKeyRoute + 10));
    const hasProviderValidation = /PROVIDERS|allowedProviders|providerList|z\.enum/.test(block);
    if (!hasProviderValidation) {
      issues.push({
        title: 'POST /api/api-keys — provider field not validated against allowlist',
        severity: 'P2',
        phase: 'static',
        category: 'validation',
        file: 'server/routes.ts',
        line: lineOf(/app\.post\('\/api\/api-keys'/),
        reproSteps: [
          "POST /api/api-keys with body { provider: 'malicious', apiKey: 'test' }",
          'Observe that no allowlist check rejects the provider value',
        ],
        expected: '400 — provider must be one of: openai, gemini, claude, grok',
        actual: 'Arbitrary provider string accepted (only validation is via AIOrchestrator.validateApiKey which may throw)',
        timestamp: now(),
      });
    } else {
      passCount++;
    }
  }

  // ── 4. No rate limiting ─────────────────────────────────────────────────────
  const hasRateLimit = /rateLimit|rate-limit|express-rate/.test(src);
  if (!hasRateLimit) {
    issues.push({
      title: 'No rate limiting on any API endpoints',
      severity: 'P2',
      phase: 'static',
      category: 'security',
      file: 'server/routes.ts',
      line: 1,
      reproSteps: [
        'Send 1000 POST /api/chats/:id/messages requests in rapid succession',
        'Observe API keys being consumed, no throttling applied',
      ],
      expected: 'Rate limiting middleware (e.g. express-rate-limit) present',
      actual: 'No rate limiting — unlimited requests accepted per user/IP',
      timestamp: now(),
    });
  } else {
    passCount++;
  }

  // ── 5. User message content logged at line 208 ─────────────────────────────
  const msgLogLine = lineOf(/Message request - User:.*Content:/);
  if (msgLogLine > 0) {
    issues.push({
      title: 'User message content logged to server console (potential PII leak)',
      severity: 'P2',
      phase: 'static',
      category: 'privacy',
      file: 'server/routes.ts',
      line: msgLogLine,
      reproSteps: [
        'Send a message containing sensitive information',
        'Inspect server console output',
      ],
      expected: 'Message content NOT logged; only chat/message IDs logged',
      actual: 'First 100 chars of user message content written to console.log',
      timestamp: now(),
    });
  }

  // ── 6. Chat context limited to last 10 messages (hardcoded magic number) ───
  const ctxLine = lineOf(/slice\(-10\)/);
  if (ctxLine > 0) {
    issues.push({
      title: 'Context window hardcoded to last 10 messages — no model-aware limit',
      severity: 'P3',
      phase: 'static',
      category: 'correctness',
      file: 'server/routes.ts',
      line: ctxLine,
      reproSteps: [
        'Create a chat and send 15+ messages',
        'Observe that only the last 10 are sent as context to the AI',
      ],
      expected: 'Context limit varies by model context window (or is configurable)',
      actual: 'Hardcoded slice(-10) ignores model-specific limits',
      timestamp: now(),
    });
  } else {
    passCount++;
  }

  // ── 7. GET /api/chats/:id returns 404 even for NaN chatId ─────────────────
  const chatGetBlock = src.indexOf("app.get('/api/chats/:id'");
  if (chatGetBlock > -1) {
    const block = src.slice(chatGetBlock, src.indexOf('\n  app.', chatGetBlock + 10));
    const hasNaNCheck = /isNaN|Number\.isNaN|isFinite/.test(block);
    if (!hasNaNCheck) {
      issues.push({
        title: 'GET /api/chats/:id — no NaN guard on parseInt(req.params.id)',
        severity: 'P2',
        phase: 'static',
        category: 'validation',
        file: 'server/routes.ts',
        line: lineOf(/app\.get\('\/api\/chats\/:id'/),
        reproSteps: [
          "GET /api/chats/notanumber",
          'Observe DB query with NaN id',
        ],
        expected: '400 Bad Request — invalid chat ID format',
        actual: 'parseInt returns NaN, which is passed to DB query; behaviour undefined',
        timestamp: now(),
      });
    } else {
      passCount++;
    }
  }

  return {
    auditor: 'routeAuditor',
    phase: 'static',
    issues,
    passCount,
    failCount: issues.length,
    durationMs: Date.now() - start,
  };
}
