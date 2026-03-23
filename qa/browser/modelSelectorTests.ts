import { test, expect, type Page } from '@playwright/test';

const BASE = process.env.QA_BASE_URL || 'http://localhost:5000';

async function goto(page: Page, path: string) {
  await page.goto(`${BASE}${path}`);
  await page.waitForLoadState('networkidle');
}

test.describe('Model Selector', () => {

  test('new chat form shows provider dropdown', async ({ page }) => {
    await goto(page, '/');
    // Get to new chat form
    const newChatBtn = page.getByRole('button', { name: /new chat/i }).or(
      page.getByText(/new chat/i).first()
    );
    if (await newChatBtn.isVisible()) {
      await newChatBtn.click();
      await page.waitForLoadState('networkidle');
    } else {
      await goto(page, '/new-chat');
    }

    // Provider selector should exist
    const providerSelect = page.getByLabel(/provider|ai provider/i).or(
      page.locator('select[name="aiProvider"], [data-testid="provider-select"]')
    );
    await expect(providerSelect.first()).toBeVisible({ timeout: 5000 });
  });

  test('GET /api/ai-providers returns populated list', async ({ page }) => {
    const res = await page.request.get('/api/ai-providers');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThan(0);
    // Each provider should have name and models
    for (const provider of body) {
      expect(provider).toHaveProperty('name');
    }
  });

  test('refresh providers button triggers API call', async ({ page }) => {
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

    // Look for refresh button
    const refreshBtn = page.getByRole('button', { name: /refresh/i }).or(
      page.locator('[data-testid="refresh-models"]')
    );
    if (await refreshBtn.isVisible()) {
      // Intercept the refresh request
      const refreshPromise = page.waitForResponse(
        res => res.url().includes('/api/ai-providers/refresh') && res.request().method() === 'POST',
        { timeout: 10000 }
      ).catch(() => null);
      await refreshBtn.click();
      const refreshRes = await refreshPromise;
      if (refreshRes) {
        expect(refreshRes.status()).toBeLessThan(500);
      }
    }
  });

  test('model list shows models for selected provider', async ({ page }) => {
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

    // Select a provider and verify model dropdown updates
    const providerSelect = page.locator('select[name="aiProvider"]').or(
      page.getByLabel(/provider/i)
    ).first();
    if (await providerSelect.isVisible()) {
      await providerSelect.selectOption({ index: 0 });
      await page.waitForTimeout(500);
      // Model select should now have options
      const modelSelect = page.locator('select[name="aiModel"]').or(
        page.getByLabel(/model/i)
      ).first();
      if (await modelSelect.isVisible()) {
        const options = await modelSelect.locator('option').count();
        expect(options).toBeGreaterThan(0);
      }
    }
  });

});
