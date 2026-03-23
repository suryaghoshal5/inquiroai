// File upload tester — valid files, wrong types, oversized, corrupted, special chars
import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'fs';
import { join } from 'path';
import type { QAIssue, TestResult } from '../types.js';
import { QA_CONFIG } from '../config.js';

function now() { return new Date().toISOString(); }

async function uploadFile(
  filename: string,
  content: Buffer | string,
  mimeType: string,
): Promise<{ status: number; body: unknown }> {
  const formData = new FormData();
  const blob = new Blob([content], { type: mimeType });
  formData.append('file', blob, filename);

  const res = await fetch(`${QA_CONFIG.baseUrl}/api/upload`, {
    method: 'POST',
    body: formData,
    signal: AbortSignal.timeout(30_000),
  });

  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

export async function testFileUpload(): Promise<TestResult> {
  const start = Date.now();
  const issues: QAIssue[] = [];
  let passCount = 0;

  const testDataDir = join(QA_CONFIG.repoRoot, 'test', 'data');
  const tmpDir = join(QA_CONFIG.repoRoot, 'uploads');

  // ── 1. Valid PDF ───────────────────────────────────────────────────────────
  {
    const pdfPath = join(testDataDir, '05-versions-space.pdf');
    if (existsSync(pdfPath)) {
      const pdfContent = readFileSync(pdfPath);
      const { status, body } = await uploadFile('test.pdf', pdfContent, 'application/pdf');
      if (status !== 200) {
        issues.push({
          title: 'POST /api/upload — valid PDF returns non-200',
          severity: 'P1', phase: 'api', category: 'file-upload',
          reproSteps: ['POST /api/upload with valid PDF file'],
          expected: '200 { content: "<extracted text>", filename: "test.pdf" }',
          actual: `${status}: ${JSON.stringify(body)}`,
          timestamp: now(),
        });
      } else if (typeof (body as { content?: string })?.content !== 'string') {
        issues.push({
          title: 'POST /api/upload — PDF response missing content field',
          severity: 'P2', phase: 'api', category: 'response-shape',
          reproSteps: ['POST /api/upload with valid PDF'],
          expected: '{ content: string, filename: string }',
          actual: JSON.stringify(body),
          timestamp: now(),
        });
      } else {
        passCount++;
      }
    }
  }

  // ── 2. Valid Markdown ──────────────────────────────────────────────────────
  {
    const mdContent = '# Test Heading\n\nThis is a test markdown document for QA.';
    const { status, body } = await uploadFile('test.md', mdContent, 'text/markdown');
    if (status !== 200) {
      issues.push({
        title: 'POST /api/upload — valid .md file returns non-200',
        severity: 'P1', phase: 'api', category: 'file-upload',
        reproSteps: ['POST /api/upload with valid .md file'],
        expected: '200 with content field',
        actual: `${status}: ${JSON.stringify(body)}`,
        timestamp: now(),
      });
    } else {
      passCount++;
    }
  }

  // ── 3. Valid plain text ───────────────────────────────────────────────────
  {
    const txtContent = 'Hello world. This is a plain text test file.';
    const { status, body } = await uploadFile('test.txt', txtContent, 'text/plain');
    if (status !== 200) {
      issues.push({
        title: 'POST /api/upload — valid .txt file returns non-200',
        severity: 'P1', phase: 'api', category: 'file-upload',
        reproSteps: ['POST /api/upload with valid .txt file'],
        expected: '200 with content field',
        actual: `${status}: ${JSON.stringify(body)}`,
        timestamp: now(),
      });
    } else {
      passCount++;
    }
  }

  // ── 4. Wrong file type — executable ──────────────────────────────────────
  {
    const { status, body } = await uploadFile('malware.exe', 'MZ\x90\x00', 'application/octet-stream');
    if (status === 200) {
      issues.push({
        title: 'POST /api/upload — .exe file accepted (should be rejected)',
        severity: 'P1', phase: 'api', category: 'security',
        reproSteps: ['POST /api/upload with .exe file'],
        expected: '400 — unsupported file type',
        actual: `200 — executable file accepted and processed`,
        timestamp: now(),
      });
    } else if (status >= 400 && status < 500) {
      passCount++;
    } else if (status === 500) {
      issues.push({
        title: 'POST /api/upload — .exe file causes 500 instead of 400',
        severity: 'P2', phase: 'api', category: 'error-handling',
        reproSteps: ['POST /api/upload with .exe file'],
        expected: '400 Bad Request',
        actual: `500: ${JSON.stringify(body)}`,
        timestamp: now(),
      });
    }
  }

  // ── 5. Wrong file type — JavaScript ─────────────────────────────────────
  {
    const { status } = await uploadFile('attack.js', 'alert(1)', 'application/javascript');
    if (status === 200) {
      issues.push({
        title: 'POST /api/upload — .js file accepted (should be rejected)',
        severity: 'P1', phase: 'api', category: 'security',
        reproSteps: ['POST /api/upload with .js file'],
        expected: '400 — unsupported file type',
        actual: '200 — JavaScript file accepted',
        timestamp: now(),
      });
    } else {
      passCount++;
    }
  }

  // ── 6. Empty file ─────────────────────────────────────────────────────────
  {
    const { status, body } = await uploadFile('empty.txt', '', 'text/plain');
    if (status === 500) {
      issues.push({
        title: 'POST /api/upload — empty file causes 500',
        severity: 'P2', phase: 'api', category: 'error-handling',
        reproSteps: ['POST /api/upload with 0-byte file'],
        expected: '400 Bad Request — empty file rejected gracefully',
        actual: `500: ${JSON.stringify(body)}`,
        timestamp: now(),
      });
    } else {
      passCount++;
    }
  }

  // ── 7. Filename with special characters ──────────────────────────────────
  {
    const specialContent = 'Test content for special filename.';
    const { status, body } = await uploadFile('test file (2024) — résumé & notes.txt', specialContent, 'text/plain');
    if (status === 500) {
      issues.push({
        title: 'POST /api/upload — special chars in filename causes 500',
        severity: 'P2', phase: 'api', category: 'error-handling',
        reproSteps: ['POST /api/upload with filename containing spaces, accents, dashes, ampersands'],
        expected: '200 — filename sanitized, content extracted',
        actual: `500: ${JSON.stringify(body)}`,
        timestamp: now(),
      });
    } else {
      passCount++;
    }
  }

  // ── 8. No file in request ─────────────────────────────────────────────────
  {
    const formData = new FormData();
    const res = await fetch(`${QA_CONFIG.baseUrl}/api/upload`, {
      method: 'POST',
      body: formData,
      signal: AbortSignal.timeout(QA_CONFIG.timeout),
    });
    const status = res.status;
    const body = await res.json().catch(() => null);
    if (status !== 400) {
      issues.push({
        title: 'POST /api/upload — no file in request returns non-400',
        severity: 'P2', phase: 'api', category: 'validation',
        reproSteps: ['POST /api/upload with empty FormData (no file appended)'],
        expected: '400 { message: "No file uploaded" }',
        actual: `${status}: ${JSON.stringify(body)}`,
        timestamp: now(),
      });
    } else {
      passCount++;
    }
  }

  // ── 9. Oversized file (simulate > 10MB) ───────────────────────────────────
  {
    // Create a ~11MB string (expensive but necessary)
    const oversize = Buffer.alloc(11 * 1024 * 1024, 'A');
    const { status, body } = await uploadFile('oversize.txt', oversize, 'text/plain');
    if (status === 200) {
      issues.push({
        title: 'POST /api/upload — 11MB file accepted (exceeds 10MB limit)',
        severity: 'P2', phase: 'api', category: 'validation',
        reproSteps: ['POST /api/upload with 11MB text file'],
        expected: '400 — file exceeds 10MB size limit',
        actual: '200 — oversized file accepted',
        timestamp: now(),
      });
    } else if (status === 500) {
      issues.push({
        title: 'POST /api/upload — oversized file causes 500 instead of 400',
        severity: 'P2', phase: 'api', category: 'error-handling',
        reproSteps: ['POST /api/upload with 11MB file'],
        expected: '400 Bad Request',
        actual: `500: ${JSON.stringify(body)}`,
        timestamp: now(),
      });
    } else {
      passCount++;
    }
  }

  return {
    auditor: 'fileUploadTester',
    phase: 'api',
    issues,
    passCount,
    failCount: issues.length,
    durationMs: Date.now() - start,
  };
}
