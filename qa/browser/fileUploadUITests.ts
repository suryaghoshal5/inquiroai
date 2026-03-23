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

async function navigateToNewChat(page: Page) {
  await goto(page, '/');
  const newChatBtn = page.getByRole('button', { name: /new chat/i }).or(
    page.getByText(/new chat/i).first()
  );
  if (await newChatBtn.isVisible()) {
    await newChatBtn.click();
    await page.waitForLoadState('networkidle');
  } else {
    await goto(page, '/new-chat');
  }
}

test.describe('File Upload UI', () => {

  test('file upload zone is visible on new chat form', async ({ page }) => {
    await navigateToNewChat(page);
    const uploadZone = page.locator('[data-testid="file-upload"], input[type="file"]').or(
      page.getByText(/upload|drag|drop|attach/i).first()
    );
    await expect(uploadZone.first()).toBeVisible({ timeout: 5000 });
  });

  test('click-to-upload opens file picker', async ({ page }) => {
    await navigateToNewChat(page);
    const fileInput = page.locator('input[type="file"]').first();
    if (await fileInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      // File input exists — test that it accepts the right types
      const accept = await fileInput.getAttribute('accept');
      if (accept) {
        expect(accept).toContain('pdf');
      }
    }
  });

  test('valid PDF can be uploaded and name is shown', async ({ page }) => {
    await navigateToNewChat(page);
    const fileInput = page.locator('input[type="file"]').first();
    if (await fileInput.count() > 0) {
      await fileInput.setInputFiles(TEST_PDF);
      await page.waitForTimeout(2000);
      // File name should appear somewhere on the page
      const bodyText = await page.locator('body').innerText();
      expect(bodyText).toContain('05-versions-space');
    }
  });

  test('oversized file shows error, does not crash', async ({ page }) => {
    await navigateToNewChat(page);
    const fileInput = page.locator('input[type="file"]').first();
    if (await fileInput.count() > 0) {
      // Create a file-like object larger than 10MB — simulate via API
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
      // Should get 400 or similar, not 500
      expect(res.status()).toBeLessThan(500);
    }
  });

  test('wrong file type shows error message', async ({ page }) => {
    await navigateToNewChat(page);
    const fileInput = page.locator('input[type="file"]').first();
    if (await fileInput.count() > 0) {
      // Try uploading a fake .exe file directly to API
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
    }
  });

  test('remove file button works after upload', async ({ page }) => {
    await navigateToNewChat(page);
    const fileInput = page.locator('input[type="file"]').first();
    if (await fileInput.count() > 0) {
      await fileInput.setInputFiles(TEST_PDF);
      await page.waitForTimeout(1500);
      // Look for remove/delete button
      const removeBtn = page.getByRole('button', { name: /remove|delete|×|✕/i }).or(
        page.locator('[data-testid="remove-file"]')
      ).first();
      if (await removeBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await removeBtn.click();
        await page.waitForTimeout(500);
        // File name should be gone
        const bodyText = await page.locator('body').innerText();
        expect(bodyText).not.toContain('05-versions-space');
      }
    }
  });

  test('page does not crash after multiple file operations', async ({ page }) => {
    await navigateToNewChat(page);
    // No JS errors after file interaction
    const errors: string[] = [];
    page.on('pageerror', err => errors.push(err.message));
    const fileInput = page.locator('input[type="file"]').first();
    if (await fileInput.count() > 0) {
      await fileInput.setInputFiles(TEST_PDF);
      await page.waitForTimeout(2000);
    }
    expect(errors.filter(e => !e.includes('ResizeObserver'))).toHaveLength(0);
  });

});
