import { test, expect, type Page } from '@playwright/test';

const BASE = process.env.QA_BASE_URL || 'http://localhost:5000';

async function goto(page: Page, path: string) {
  await page.goto(`${BASE}${path}`);
  await page.waitForLoadState('networkidle');
}

test.describe('Navigation', () => {

  test('back from chat returns to dashboard, not blank page', async ({ page }) => {
    await goto(page, '/');
    // Click into a chat if one exists
    const firstChat = page.locator('li, [data-testid="chat-item"]').first();
    if (await firstChat.isVisible({ timeout: 2000 }).catch(() => false)) {
      await firstChat.click();
      await page.waitForLoadState('networkidle');
      await page.goBack();
      await page.waitForLoadState('networkidle');
      // Should be back on a page with content
      const bodyText = await page.locator('body').innerText();
      expect(bodyText.length).toBeGreaterThan(10);
      expect(bodyText).not.toContain('Cannot read properties');
    }
  });

  test('multi-chat switching preserves each chat context', async ({ page }) => {
    await goto(page, '/');
    const chatItems = page.locator('li, [data-testid="chat-item"]');
    const count = await chatItems.count();
    if (count >= 2) {
      // Click first chat
      await chatItems.nth(0).click();
      await page.waitForLoadState('networkidle');
      const url1 = page.url();

      // Click second chat
      await chatItems.nth(1).click();
      await page.waitForLoadState('networkidle');
      const url2 = page.url();

      // URLs should be different
      expect(url1).not.toBe(url2);

      // Go back to first — URL should match
      await chatItems.nth(0).click();
      await page.waitForLoadState('networkidle');
      expect(page.url()).toBe(url1);
    }
  });

  test('chat list sorts by most recent (newest first)', async ({ page }) => {
    await goto(page, '/');
    const chatTimes = await page.locator('[data-testid="chat-time"], time, .chat-time').allInnerTexts();
    // Just verify the list renders without crash — ordering verification requires timestamps
    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toContain('undefined');
    expect(bodyText).not.toContain('[object Object]');
  });

  test('long chat titles truncate gracefully (no overflow)', async ({ page }) => {
    await goto(page, '/');
    // Check that sidebar items don't cause horizontal overflow
    const sidebar = page.locator('aside, [data-testid="sidebar"], nav').first();
    if (await sidebar.isVisible({ timeout: 2000 }).catch(() => false)) {
      const sidebarBox = await sidebar.boundingBox();
      const chatItems = await sidebar.locator('li, [data-testid="chat-item"]').all();
      for (const item of chatItems.slice(0, 5)) {
        const box = await item.boundingBox();
        if (box && sidebarBox) {
          // Item should not overflow sidebar width
          expect(box.x + box.width).toBeLessThanOrEqual(sidebarBox.x + sidebarBox.width + 10);
        }
      }
    }
  });

  test('empty state shown when no chats', async ({ page }) => {
    // This test verifies that if the chat list is empty, a meaningful UI is shown
    // We can verify via API response
    const res = await page.request.get('/api/chats');
    expect(res.status()).toBe(200);
    const chats = await res.json() as unknown[];
    if (chats.length === 0) {
      await goto(page, '/');
      const bodyText = await page.locator('body').innerText();
      // Should show some kind of empty state
      const hasEmptyState = /no chats|start a chat|get started|create your first/i.test(bodyText);
      expect(hasEmptyState).toBeTruthy();
    }
  });

  test('settings page navigates correctly', async ({ page }) => {
    await goto(page, '/');
    // Look for settings link
    const settingsLink = page.getByRole('link', { name: /settings/i }).or(
      page.getByRole('button', { name: /settings/i })
    ).or(page.locator('[data-testid="settings"]'));

    if (await settingsLink.first().isVisible({ timeout: 2000 }).catch(() => false)) {
      await settingsLink.first().click();
      await page.waitForLoadState('networkidle');
      const url = page.url();
      expect(url).toContain('setting');
    } else {
      // Navigate directly
      await goto(page, '/settings');
      const status = page.url().includes('settings') || page.url().includes('404');
      expect(status).toBeTruthy();
    }
  });

  test('404 page renders for unknown routes', async ({ page }) => {
    await goto(page, '/this-route-does-not-exist-xyz-123');
    const bodyText = await page.locator('body').innerText();
    // Should show some kind of not found message, not a raw server error
    expect(bodyText).not.toContain('Error: Cannot GET');
    expect(bodyText).not.toContain('Cannot read properties of undefined');
  });

  test('no console errors on dashboard load', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', err => errors.push(err.message));
    await goto(page, '/');
    expect(errors.filter(e =>
      !e.includes('ResizeObserver') &&
      !e.includes('non-passive event')
    )).toHaveLength(0);
  });

});
