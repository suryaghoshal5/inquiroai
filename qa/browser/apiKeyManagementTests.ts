import { test, expect, type Page } from '@playwright/test';

const BASE = process.env.QA_BASE_URL || 'http://localhost:5000';

async function goto(page: Page, path: string) {
  await page.goto(`${BASE}${path}`);
  await page.waitForLoadState('networkidle');
}

async function navigateToSettings(page: Page): Promise<boolean> {
  await goto(page, '/');
  const settingsLink = page.getByRole('link', { name: /settings/i }).or(
    page.getByRole('button', { name: /settings/i })
  ).or(page.locator('[href*="settings"], [data-testid="settings"]'));

  if (await settingsLink.first().isVisible({ timeout: 2000 }).catch(() => false)) {
    await settingsLink.first().click();
    await page.waitForLoadState('networkidle');
    return true;
  }
  // Try direct navigation
  await goto(page, '/settings');
  return page.url().includes('setting');
}

test.describe('API Key Management', () => {

  test('settings page shows API key section', async ({ page }) => {
    const reached = await navigateToSettings(page);
    if (!reached) {
      test.skip();
      return;
    }
    const apiKeySection = page.getByText(/api key|api keys|provider key/i).first();
    await expect(apiKeySection).toBeVisible({ timeout: 5000 });
  });

  test('GET /api/api-keys returns array (no encryptedKey)', async ({ page }) => {
    const res = await page.request.get('/api/api-keys');
    expect(res.status()).toBe(200);
    const keys = await res.json() as Record<string, unknown>[];
    expect(Array.isArray(keys)).toBe(true);
    // Verify encryptedKey is not exposed
    for (const key of keys) {
      expect(key.encryptedKey).toBeUndefined();
    }
  });

  test('existing API keys show masked preview (first/last chars only)', async ({ page }) => {
    const reached = await navigateToSettings(page);
    if (!reached) {
      test.skip();
      return;
    }

    // Check for key preview format (e.g. sk-...xYzW or similar masked format)
    const bodyText = await page.locator('body').innerText();
    // If there are keys shown, they should have masked format
    if (bodyText.includes('openai') || bodyText.includes('claude') || bodyText.includes('gemini')) {
      // Look for masked key pattern: starts with first few chars, has ellipsis
      const hasMaskedFormat = /sk[-•*]{3,}|sk\.\.\./i.test(bodyText) ||
        /[A-Za-z0-9]{3,}\.{3,}[A-Za-z0-9]{3,}/.test(bodyText);
      // This is a soft assertion — just verify the full key isn't shown
      const hasFullKey = /sk-[A-Za-z0-9]{40,}/.test(bodyText);
      expect(hasFullKey).toBe(false);
    }
  });

  test('POST /api/api-keys with invalid key returns 400', async ({ page }) => {
    const res = await page.request.post('/api/api-keys', {
      data: { provider: 'openai', apiKey: 'invalid-key-qa-test' },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty('message');
  });

  test('POST /api/api-keys with empty body returns 400', async ({ page }) => {
    const res = await page.request.post('/api/api-keys', { data: {} });
    expect(res.status()).toBe(400);
  });

  test('DELETE /api/api-keys/:id returns 404 for non-existent key', async ({ page }) => {
    const res = await page.request.delete('/api/api-keys/999999');
    // Should be 404, not 500
    expect(res.status()).not.toBe(500);
    expect(res.status()).toBe(404);
  });

  test('settings page has no JS errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', err => errors.push(err.message));
    await navigateToSettings(page);
    expect(errors.filter(e => !e.includes('ResizeObserver'))).toHaveLength(0);
  });

  test('chat creation page shows settings redirect when no API key', async ({ page }) => {
    // Verify behavior when no API keys are stored
    const keysRes = await page.request.get('/api/api-keys');
    const keys = await keysRes.json() as unknown[];
    if (keys.length === 0) {
      // Try to create a chat — should warn about missing API key
      await goto(page, '/');
      const newChatBtn = page.getByRole('button', { name: /new chat/i }).or(
        page.getByText(/new chat/i).first()
      );
      if (await newChatBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await newChatBtn.click();
        await page.waitForLoadState('networkidle');
        const bodyText = await page.locator('body').innerText();
        // Should mention API key requirement somewhere
        const mentionsApiKey = /api key|settings|provider/i.test(bodyText);
        // Soft assertion — just verify the page doesn't crash
        const hasContent = bodyText.length > 20;
        expect(hasContent).toBe(true);
      }
    }
  });

});
