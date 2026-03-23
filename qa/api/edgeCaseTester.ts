// Edge-case tester — invalid inputs, oversized payloads, injection strings
import type { QAIssue, TestResult } from '../types.js';
import { QA_CONFIG } from '../config.js';

function now() { return new Date().toISOString(); }

async function post(path: string, data: unknown, extraHeaders?: Record<string,string>): Promise<{ status: number; body: unknown }> {
  const res = await fetch(`${QA_CONFIG.baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
    body: JSON.stringify(data),
    signal: AbortSignal.timeout(QA_CONFIG.timeout),
  });
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

async function get(path: string): Promise<{ status: number; body: unknown }> {
  const res = await fetch(`${QA_CONFIG.baseUrl}${path}`, {
    signal: AbortSignal.timeout(QA_CONFIG.timeout),
  });
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

function assert400(
  label: string,
  status: number,
  body: unknown,
  issues: QAIssue[],
  counter: { pass: number },
) {
  if (status === 500) {
    issues.push({
      title: `${label} — returns 500 on invalid input (should be 4xx)`,
      severity: 'P1', phase: 'api', category: 'error-handling',
      reproSteps: [label],
      expected: '400 or 422 with descriptive error message',
      actual: `500 Internal Server Error — invalid input causes server crash`,
      timestamp: now(),
    });
  } else if (status < 400 || status >= 500) {
    issues.push({
      title: `${label} — unexpected status for invalid input`,
      severity: 'P2', phase: 'api', category: 'validation',
      reproSteps: [label],
      expected: '400 or 422',
      actual: `${status}: ${JSON.stringify(body)}`,
      timestamp: now(),
    });
  } else {
    counter.pass++;
  }
}

export async function testEdgeCases(): Promise<TestResult> {
  const start = Date.now();
  const issues: QAIssue[] = [];
  const c = { pass: 0 };

  // ── POST /api/chats — empty body ─────────────────────────────────────────
  {
    const { status, body } = await post('/api/chats', {});
    assert400('POST /api/chats with empty body', status, body, issues, c);
  }

  // ── POST /api/chats — missing required fields ────────────────────────────
  {
    const { status, body } = await post('/api/chats', { role: 'researcher' });
    assert400('POST /api/chats missing task/context', status, body, issues, c);
  }

  // ── POST /api/chats — invalid role ──────────────────────────────────────
  {
    const { status, body } = await post('/api/chats', {
      role: 'hacker',
      context: 'x', task: 'x',
      inputData: '', constraints: '', examples: '', optional: '', audience: 'x',
      aiProvider: 'openai', aiModel: 'gpt-4o',
    });
    assert400('POST /api/chats with invalid role', status, body, issues, c);
  }

  // ── POST /api/chats/:id/messages — empty content ────────────────────────
  {
    const { status, body } = await post('/api/chats/99999/messages', { content: '' });
    assert400('POST /api/chats/99999/messages with empty content', status, body, issues, c);
  }

  // ── POST /api/chats/:id/messages — missing content ──────────────────────
  {
    const { status, body } = await post('/api/chats/99999/messages', {});
    assert400('POST /api/chats/99999/messages with no content field', status, body, issues, c);
  }

  // ── POST /api/chats/:id/messages — SQL injection ─────────────────────────
  {
    const sqlPayload = "'; DROP TABLE messages; --";
    const { status } = await post('/api/chats/1/messages', { content: sqlPayload });
    // Expect 400 (chat not found or no api key), NOT 500
    if (status === 500) {
      issues.push({
        title: 'POST /api/chats/:id/messages — SQL injection string causes 500',
        severity: 'P0', phase: 'api', category: 'security',
        reproSteps: [`POST /api/chats/1/messages with content: "${sqlPayload}"`],
        expected: '400 or 404 — SQL is parameterized, no error',
        actual: '500 — server crashed on injection string',
        timestamp: now(),
      });
    } else {
      c.pass++;
    }
  }

  // ── POST /api/chats/:id/messages — XSS payload ───────────────────────────
  {
    const xssPayload = '<script>alert(document.cookie)</script>';
    const { status } = await post('/api/chats/1/messages', { content: xssPayload });
    if (status === 500) {
      issues.push({
        title: 'POST /api/chats/:id/messages — XSS string causes 500',
        severity: 'P1', phase: 'api', category: 'security',
        reproSteps: [`POST /api/chats/1/messages with XSS content`],
        expected: '400 or 404',
        actual: '500',
        timestamp: now(),
      });
    } else {
      c.pass++;
    }
  }

  // ── POST /api/api-keys — empty body ─────────────────────────────────────
  {
    const { status, body } = await post('/api/api-keys', {});
    assert400('POST /api/api-keys with empty body', status, body, issues, c);
  }

  // ── POST /api/api-keys — missing apiKey ─────────────────────────────────
  {
    const { status, body } = await post('/api/api-keys', { provider: 'openai' });
    assert400('POST /api/api-keys missing apiKey', status, body, issues, c);
  }

  // ── POST /api/api-keys — invalid provider ────────────────────────────────
  {
    const { status, body } = await post('/api/api-keys', { provider: 'fakeprovider', apiKey: 'sk-test' });
    if (status === 200 || status === 201) {
      issues.push({
        title: 'POST /api/api-keys — invalid provider accepted (200)',
        severity: 'P2', phase: 'api', category: 'validation',
        reproSteps: ['POST /api/api-keys with { provider: "fakeprovider", apiKey: "sk-test" }'],
        expected: '400 — provider not in allowed list',
        actual: '200/201 — fake provider accepted',
        timestamp: now(),
      });
    } else if (status === 500) {
      issues.push({
        title: 'POST /api/api-keys — invalid provider causes 500 instead of 400',
        severity: 'P1', phase: 'api', category: 'error-handling',
        reproSteps: ['POST /api/api-keys with { provider: "fakeprovider", apiKey: "sk-test" }'],
        expected: '400 Bad Request',
        actual: `500 Internal Server Error: ${JSON.stringify(body)}`,
        timestamp: now(),
      });
    } else {
      c.pass++;
    }
  }

  // ── GET /api/chats/:id — non-numeric ID ─────────────────────────────────
  {
    const { status } = await get('/api/chats/notanumber');
    if (status === 500) {
      issues.push({
        title: 'GET /api/chats/notanumber — returns 500 (NaN passed to DB)',
        severity: 'P1', phase: 'api', category: 'validation',
        reproSteps: ['GET /api/chats/notanumber'],
        expected: '400 Bad Request — invalid ID format',
        actual: '500 Internal Server Error — NaN passed to Drizzle query',
        timestamp: now(),
      });
    } else if (status === 400 || status === 404) {
      c.pass++;
    } else {
      issues.push({
        title: 'GET /api/chats/notanumber — unexpected status',
        severity: 'P2', phase: 'api', category: 'validation',
        reproSteps: ['GET /api/chats/notanumber'],
        expected: '400 or 404',
        actual: `${status}`,
        timestamp: now(),
      });
    }
  }

  // ── GET /api/chats/:id — non-existent chat ───────────────────────────────
  {
    const { status } = await get('/api/chats/999999999');
    if (status !== 404) {
      issues.push({
        title: 'GET /api/chats/999999999 — non-existent chat not returning 404',
        severity: 'P2', phase: 'api', category: 'endpoint',
        reproSteps: ['GET /api/chats/999999999 (chat that does not exist)'],
        expected: '404 Not Found',
        actual: `${status}`,
        timestamp: now(),
      });
    } else {
      c.pass++;
    }
  }

  // ── POST /api/chats — wrong Content-Type ────────────────────────────────
  {
    const res = await fetch(`${QA_CONFIG.baseUrl}/api/chats`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: 'not json',
      signal: AbortSignal.timeout(QA_CONFIG.timeout),
    });
    const status = res.status;
    if (status === 500) {
      issues.push({
        title: 'POST /api/chats with text/plain content-type causes 500',
        severity: 'P1', phase: 'api', category: 'error-handling',
        reproSteps: ['POST /api/chats with Content-Type: text/plain, body: "not json"'],
        expected: '400 Bad Request',
        actual: '500 — server crashed on unexpected content type',
        timestamp: now(),
      });
    } else {
      c.pass++;
    }
  }

  return {
    auditor: 'edgeCaseTester',
    phase: 'api',
    issues,
    passCount: c.pass,
    failCount: issues.length,
    durationMs: Date.now() - start,
  };
}
