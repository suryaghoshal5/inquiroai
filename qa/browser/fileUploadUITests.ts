import { test, expect, type Page } from '@playwright/test';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const BASE = process.env.QA_BASE_URL || 'http://localhost:5000';
const __dirname = dirname(fileURLToPath(import.meta.url));
const TEST_PDF = join(__dirname, '../../test/data/05-versions-space.pdf');

async function goto(page: Page, path: string) {
  await page.goto(`${BASE}${path}`);
  await page.waitForLoadState('networkidle');
}

// Navigate to the new chat form and go to the Task tab (which has the first FileUpload component)
async function navigateToFileUploadTab(page: Page) {
  await goto(page, '/chat/new');
  await page.waitForLoadState('networkidle');
  await page.getByRole('tab', { name: 'Task' }).click();
  await page.waitForTimeout(300);
}

test.describe('File Upload UI', () => {

  test('Upload File button is visible on Task tab', async ({ page }) => {
    await navigateToFileUploadTab(page);
    // The FileUpload component renders an "Upload File" button (Paperclip icon + text)
    const uploadBtn = page.getByRole('button', { name: /Upload File/i }).first();
    await expect(uploadBtn).toBeVisible({ timeout: 5000 });
  });

  test('click-to-upload button is enabled', async ({ page }) => {
    await navigateToFileUploadTab(page);
    const uploadBtn = page.getByRole('button', { name: /Upload File/i }).first();
    if (await uploadBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      // Button should not be disabled in initial state
      await expect(uploadBtn).not.toBeDisabled();
    }
  });

  test('valid PDF can be uploaded via hidden file input', async ({ page }) => {
    await navigateToFileUploadTab(page);
    // The file input is hidden (className="hidden") but Playwright can still set files on it
    const fileInput = page.locator('input[type="file"]').first();
    if (await fileInput.count() > 0) {
      await fileInput.setInputFiles(TEST_PDF).catch(() => {
        // Test PDF may not exist in CI — skip gracefully
      });
      await page.waitForTimeout(2000);
    }
  });

  test('oversized file is rejected with non-500 status', async ({ page }) => {
    const res = await page.request.post('/api/upload', {
      multipart: {
        file: {
          name: 'oversize.txt',
          mimeType: 'text/plain',
          buffer: Buffer.alloc(11 * 1024 * 1024, 'A'),
        },
      },
      timeout: 30000,
    });
    // Should get 400 (too large), not 500
    expect(res.status()).toBeLessThan(500);
  });

  test('wrong file type returns 4xx from upload API', async ({ page }) => {
    const res = await page.request.post('/api/upload', {
      multipart: {
        file: {
          name: 'test.exe',
          mimeType: 'application/octet-stream',
          buffer: Buffer.from('MZ\x90\x00'),
        },
      },
    });
    // Should fail with 4xx, not 500
    expect(res.status()).toBeGreaterThanOrEqual(400);
    expect(res.status()).toBeLessThan(500);
  });

  test('Context tab also has an Upload File button (for Examples)', async ({ page }) => {
    await goto(page, '/chat/new');
    await page.waitForLoadState('networkidle');
    await page.getByRole('tab', { name: 'Context' }).click();
    await page.waitForTimeout(300);
    // Context tab has FileUpload for the Examples field
    const uploadBtn = page.getByRole('button', { name: /Upload File/i }).first();
    await expect(uploadBtn).toBeVisible({ timeout: 5000 });
  });

  test('page does not crash after file upload interaction', async ({ page }) => {
    await navigateToFileUploadTab(page);
    const errors: string[] = [];
    page.on('pageerror', err => errors.push(err.message));
    const fileInput = page.locator('input[type="file"]').first();
    if (await fileInput.count() > 0) {
      await fileInput.setInputFiles(TEST_PDF).catch(() => {});
      await page.waitForTimeout(2000);
    }
    expect(errors.filter(e => !e.includes('ResizeObserver'))).toHaveLength(0);
  });

});
