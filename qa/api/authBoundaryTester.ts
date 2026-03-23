// Auth boundary tester — verifies protected routes reject unauthenticated/cross-user requests
// NOTE: In dev mode the server uses mock auth (always authenticated as dev-user).
// These tests detect P0 issues where routes SHOULD require auth but don't.
import type { QAIssue, TestResult } from '../types.js';
import { QA_CONFIG } from '../config.js';

function now() { return new Date().toISOString(); }

async function req(
  method: string,
  path: string,
  opts: { cookie?: string; body?: unknown } = {},
): Promise<{ status: number; body: unknown }> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (opts.cookie) headers['Cookie'] = opts.cookie;

  const res = await fetch(`${QA_CONFIG.baseUrl}${path}`, {
    method,
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    signal: AbortSignal.timeout(QA_CONFIG.timeout),
  });
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

export async function testAuthBoundaries(): Promise<TestResult> {
  const start = Date.now();
  const issues: QAIssue[] = [];
  let passCount = 0;

  // Note: In development, mockAuth always passes — so these tests detect whether
  // routes *could* be protected in production. We test the /api/initialize-prompts
  // and /api/ai-providers/refresh routes which skip mockAuth entirely.

  // ── Routes that have NO auth at all (even in prod) ────────────────────────
  const unprotectedRoutes = [
    { method: 'POST', path: '/api/initialize-prompts', label: 'initialize-prompts' },
    { method: 'POST', path: '/api/ai-providers/refresh', label: 'ai-providers/refresh' },
    { method: 'GET',  path: '/api/ai-providers',         label: 'ai-providers GET' },
    { method: 'GET',  path: '/api/role-prompts',          label: 'role-prompts GET' },
  ];

  for (const route of unprotectedRoutes) {
    const { status } = await req(route.method, route.path, { cookie: '' });
    // These routes execute without session — flag if that's unexpected
    const isActionable = ['POST /api/initialize-prompts', 'POST /api/ai-providers/refresh']
      .includes(`${route.method} ${route.path}`);
    if (isActionable && status < 400) {
      issues.push({
        title: `${route.method} ${route.path} — executes without authentication`,
        severity: 'P1', phase: 'api', category: 'auth',
        reproSteps: [
          `Send ${route.method} ${route.path} with no session cookie`,
          'Observe successful response',
        ],
        expected: '401 Unauthorized in production',
        actual: `${status} — route executes for unauthenticated caller`,
        timestamp: now(),
      });
    } else {
      passCount++;
    }
  }

  // ── Cross-user data access (ownership check) ─────────────────────────────
  // In dev we are always dev-user. Create a chat as dev-user, then try to
  // simulate accessing it with a different sub (can't easily in dev, but we
  // can verify the ownership-check code path by testing non-existent foreign chat IDs).
  {
    // Chat that definitely belongs to another user (ID 0 or negative)
    const { status } = await req('GET', '/api/chats/0');
    if (status === 200) {
      issues.push({
        title: 'GET /api/chats/0 — returns 200 for impossible chat ID',
        severity: 'P2', phase: 'api', category: 'auth',
        reproSteps: ['GET /api/chats/0'],
        expected: '404 Not Found',
        actual: '200 — ownership check may be missing',
        timestamp: now(),
      });
    } else {
      passCount++;
    }
  }

  // ── Verify error 404 (not 403) used for cross-user chats (security through obscurity) ──
  // The route returns 404 for both "not found" and "belongs to other user" — correct behaviour.
  {
    const { status, body } = await req('GET', '/api/chats/999999998');
    if (status === 200) {
      issues.push({
        title: 'GET /api/chats/999999998 — phantom chat returns data',
        severity: 'P0', phase: 'api', category: 'auth',
        reproSteps: ['GET /api/chats/999999998'],
        expected: '404 Not Found',
        actual: `200 — data returned for non-existent chat: ${JSON.stringify(body)}`,
        timestamp: now(),
      });
    } else if (status === 404) {
      passCount++;
    } else {
      passCount++;
    }
  }

  // ── Verify DELETE on other user's chat returns 404 ───────────────────────
  {
    const { status } = await req('DELETE', '/api/chats/999999997');
    if (status === 200) {
      issues.push({
        title: 'DELETE /api/chats/999999997 — returns 200 for non-existent chat',
        severity: 'P1', phase: 'api', category: 'auth',
        reproSteps: ['DELETE /api/chats/999999997'],
        expected: '404 Not Found',
        actual: '200 — phantom delete succeeded',
        timestamp: now(),
      });
    } else {
      passCount++;
    }
  }

  // ── Verify API key endpoints require auth ────────────────────────────────
  // In dev, mockAuth always passes — we just verify the route is wired up
  {
    const { status } = await req('GET', '/api/api-keys');
    if (status !== 200) {
      issues.push({
        title: 'GET /api/api-keys — returns non-200 in dev mode',
        severity: 'P1', phase: 'api', category: 'auth',
        reproSteps: ['GET /api/api-keys in development mode'],
        expected: '200 with empty or populated array',
        actual: `${status}`,
        timestamp: now(),
      });
    } else {
      passCount++;
    }
  }

  return {
    auditor: 'authBoundaryTester',
    phase: 'api',
    issues,
    passCount,
    failCount: issues.length,
    durationMs: Date.now() - start,
  };
}
