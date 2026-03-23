// Happy-path endpoint tester — verifies every API route returns expected shape
import type { QAIssue, TestResult } from '../types.js';
import { QA_CONFIG } from '../config.js';

function now() { return new Date().toISOString(); }

async function get(path: string): Promise<{ status: number; body: unknown }> {
  const res = await fetch(`${QA_CONFIG.baseUrl}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(QA_CONFIG.timeout),
  });
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

async function post(path: string, data: unknown): Promise<{ status: number; body: unknown }> {
  const res = await fetch(`${QA_CONFIG.baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
    signal: AbortSignal.timeout(QA_CONFIG.timeout),
  });
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

async function del(path: string): Promise<{ status: number; body: unknown }> {
  const res = await fetch(`${QA_CONFIG.baseUrl}${path}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(QA_CONFIG.timeout),
  });
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

// Shape checkers
function hasKeys(obj: unknown, keys: string[]): boolean {
  if (typeof obj !== 'object' || obj === null) return false;
  return keys.every(k => k in (obj as Record<string, unknown>));
}

function isArray(obj: unknown): boolean {
  return Array.isArray(obj);
}

export async function testHappyPath(): Promise<TestResult> {
  const start = Date.now();
  const issues: QAIssue[] = [];
  let passCount = 0;
  let createdChatId: number | null = null;

  // ── GET /api/auth/user ──────────────────────────────────────────────────────
  {
    const { status, body } = await get('/api/auth/user');
    if (status !== 200) {
      issues.push({
        title: 'GET /api/auth/user — unexpected status',
        severity: 'P1', phase: 'api', category: 'endpoint',
        reproSteps: ['GET /api/auth/user'],
        expected: '200 with user object',
        actual: `${status}: ${JSON.stringify(body)}`,
        timestamp: now(),
      });
    } else if (!hasKeys(body, ['id', 'email'])) {
      issues.push({
        title: 'GET /api/auth/user — response missing id or email',
        severity: 'P2', phase: 'api', category: 'response-shape',
        reproSteps: ['GET /api/auth/user', 'Inspect JSON body'],
        expected: '{ id, email, firstName, lastName, ... }',
        actual: JSON.stringify(body),
        timestamp: now(),
      });
    } else {
      passCount++;
    }
  }

  // ── GET /api/ai-providers ────────────────────────────────────────────────────
  {
    const { status, body } = await get('/api/ai-providers');
    if (status !== 200) {
      issues.push({
        title: 'GET /api/ai-providers — unexpected status',
        severity: 'P1', phase: 'api', category: 'endpoint',
        reproSteps: ['GET /api/ai-providers'],
        expected: '200 with array of providers',
        actual: `${status}: ${JSON.stringify(body)}`,
        timestamp: now(),
      });
    } else if (!isArray(body)) {
      issues.push({
        title: 'GET /api/ai-providers — response is not an array',
        severity: 'P2', phase: 'api', category: 'response-shape',
        reproSteps: ['GET /api/ai-providers', 'Inspect JSON body'],
        expected: 'Array of { name, models, defaultModel }',
        actual: JSON.stringify(body),
        timestamp: now(),
      });
    } else {
      passCount++;
      // Check at least one provider has expected shape
      const providers = body as unknown[];
      if (providers.length === 0) {
        issues.push({
          title: 'GET /api/ai-providers — returns empty array',
          severity: 'P2', phase: 'api', category: 'endpoint',
          reproSteps: ['GET /api/ai-providers'],
          expected: 'At least 1 provider (openai, gemini, claude, grok)',
          actual: '[]',
          timestamp: now(),
        });
      } else {
        passCount++;
      }
    }
  }

  // ── GET /api/role-prompts ────────────────────────────────────────────────────
  {
    const { status, body } = await get('/api/role-prompts');
    if (status !== 200) {
      issues.push({
        title: 'GET /api/role-prompts — unexpected status',
        severity: 'P1', phase: 'api', category: 'endpoint',
        reproSteps: ['GET /api/role-prompts'],
        expected: '200 with role prompts array',
        actual: `${status}: ${JSON.stringify(body)}`,
        timestamp: now(),
      });
    } else {
      passCount++;
    }
  }

  // ── GET /api/chats (empty) ────────────────────────────────────────────────────
  {
    const { status, body } = await get('/api/chats');
    if (status !== 200) {
      issues.push({
        title: 'GET /api/chats — unexpected status',
        severity: 'P1', phase: 'api', category: 'endpoint',
        reproSteps: ['GET /api/chats'],
        expected: '200 with array',
        actual: `${status}: ${JSON.stringify(body)}`,
        timestamp: now(),
      });
    } else if (!isArray(body)) {
      issues.push({
        title: 'GET /api/chats — response is not an array',
        severity: 'P2', phase: 'api', category: 'response-shape',
        reproSteps: ['GET /api/chats'],
        expected: 'Array of chat objects',
        actual: JSON.stringify(body),
        timestamp: now(),
      });
    } else {
      passCount++;
    }
  }

  // ── POST /api/chats (create) ────────────────────────────────────────────────
  {
    const chatPayload = {
      role: 'researcher',
      context: 'Testing the QA framework',
      task: 'Run a static analysis',
      inputData: '',
      constraints: '',
      examples: '',
      optional: '',
      audience: 'QA engineer',
      aiProvider: 'openai',
      aiModel: 'gpt-4o-mini',
    };
    const { status, body } = await post('/api/chats', chatPayload);
    if (status !== 200 && status !== 201) {
      issues.push({
        title: 'POST /api/chats — unexpected status',
        severity: 'P1', phase: 'api', category: 'endpoint',
        reproSteps: ['POST /api/chats with valid researcher config'],
        expected: '200/201 with created chat object containing id',
        actual: `${status}: ${JSON.stringify(body)}`,
        timestamp: now(),
      });
    } else if (!hasKeys(body, ['id', 'role', 'aiProvider'])) {
      issues.push({
        title: 'POST /api/chats — response missing required fields',
        severity: 'P2', phase: 'api', category: 'response-shape',
        reproSteps: ['POST /api/chats', 'Inspect response body'],
        expected: '{ id, userId, title, role, aiProvider, aiModel, ... }',
        actual: JSON.stringify(body),
        timestamp: now(),
      });
    } else {
      passCount++;
      createdChatId = (body as { id: number }).id;
    }
  }

  // ── GET /api/chats/:id (if created) ────────────────────────────────────────
  if (createdChatId !== null) {
    const { status, body } = await get(`/api/chats/${createdChatId}`);
    if (status !== 200) {
      issues.push({
        title: 'GET /api/chats/:id — unexpected status after creation',
        severity: 'P1', phase: 'api', category: 'endpoint',
        reproSteps: [`POST /api/chats to get chatId`, `GET /api/chats/${createdChatId}`],
        expected: '200 with { chat, messages }',
        actual: `${status}: ${JSON.stringify(body)}`,
        timestamp: now(),
      });
    } else if (!hasKeys(body, ['chat', 'messages'])) {
      issues.push({
        title: 'GET /api/chats/:id — missing chat or messages field',
        severity: 'P2', phase: 'api', category: 'response-shape',
        reproSteps: [`GET /api/chats/${createdChatId}`],
        expected: '{ chat: {...}, messages: [...] }',
        actual: JSON.stringify(body),
        timestamp: now(),
      });
    } else {
      passCount++;
    }
  }

  // ── GET /api/api-keys ────────────────────────────────────────────────────────
  {
    const { status, body } = await get('/api/api-keys');
    if (status !== 200) {
      issues.push({
        title: 'GET /api/api-keys — unexpected status',
        severity: 'P1', phase: 'api', category: 'endpoint',
        reproSteps: ['GET /api/api-keys'],
        expected: '200 with array of api keys (encryptedKey omitted)',
        actual: `${status}: ${JSON.stringify(body)}`,
        timestamp: now(),
      });
    } else {
      passCount++;
      // Verify encryptedKey is not sent to client
      const keys = body as unknown[];
      if (Array.isArray(keys) && keys.length > 0) {
        const hasEncryptedKey = keys.some(k =>
          typeof k === 'object' && k !== null && 'encryptedKey' in k &&
          (k as Record<string, unknown>).encryptedKey !== undefined
        );
        if (hasEncryptedKey) {
          issues.push({
            title: 'GET /api/api-keys — encryptedKey included in response',
            severity: 'P1', phase: 'api', category: 'security',
            reproSteps: ['Add an API key', 'GET /api/api-keys', 'Check encryptedKey field'],
            expected: 'encryptedKey field stripped before sending to client',
            actual: 'encryptedKey present in response — encrypted key material exposed',
            timestamp: now(),
          });
        } else {
          passCount++;
        }
      }
    }
  }

  // ── DELETE /api/chats/:id (cleanup) ────────────────────────────────────────
  if (createdChatId !== null) {
    const { status } = await del(`/api/chats/${createdChatId}`);
    if (status !== 200) {
      issues.push({
        title: 'DELETE /api/chats/:id — unexpected status',
        severity: 'P2', phase: 'api', category: 'endpoint',
        reproSteps: [`DELETE /api/chats/${createdChatId}`],
        expected: '200 { message: "Chat deleted successfully" }',
        actual: `status ${status}`,
        timestamp: now(),
      });
    } else {
      passCount++;
    }
  }

  return {
    auditor: 'endpointTester (happy path)',
    phase: 'api',
    issues,
    passCount,
    failCount: issues.length,
    durationMs: Date.now() - start,
  };
}
