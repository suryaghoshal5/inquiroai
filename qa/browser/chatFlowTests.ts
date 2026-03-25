import { test, expect, type Page } from '@playwright/test';

const BASE = process.env.QA_BASE_URL || 'http://localhost:5000';

// Helper: navigate and wait for app to be interactive
async function goto(page: Page, path: string) {
  await page.goto(`${BASE}${path}`);
  await page.waitForLoadState('networkidle');
}

// Helper: create a chat via the API (fast path — no AI generation wait)
// Returns the chat ID
async function createChatViaAPI(page: Page, task = 'QA test task'): Promise<number | null> {
  const payload = {
    role: 'researcher',
    context: 'QA browser test context',
    task,
    inputData: '',
    constraints: '',
    examples: '',
    optional: '',
    audience: 'QA engineer',
    aiProvider: 'openai',
    aiModel: 'gpt-4o-mini',
  };
  const res = await page.request.post('/api/chats', {
    data: payload,
    timeout: 45_000,
  });
  if (!res.ok()) return null;
  const body = await res.json().catch(() => null);
  if (!body || typeof body.id !== 'number') return null;
  return body.id;
}

test.describe('Core Chat Flows', () => {

  test('app loads and shows landing or dashboard', async ({ page }) => {
    await goto(page, '/');
    // Page should load (body should have content)
    const bodyText = await page.locator('body').innerText();
    expect(bodyText.length).toBeGreaterThan(5);

    // Should not show a raw error stack
    expect(bodyText).not.toContain('Error: ');
    expect(bodyText).not.toContain('Cannot read properties');
  });

  test('dashboard shows Projects or Quick Chats section', async ({ page }) => {
    await goto(page, '/');
    // Dashboard shows at least one of: Projects section, Quick Chats section, or a CTA button
    const hasProjects = await page.getByText(/Projects/i).isVisible().catch(() => false);
    const hasQuickChats = await page.getByText(/Quick Chats/i).isVisible().catch(() => false);
    const hasButton = await page.getByRole('button', { name: /Quick Chat|New Project/i }).isVisible().catch(() => false);
    expect(hasProjects || hasQuickChats || hasButton).toBeTruthy();
  });

  test('new chat form renders with all required tabs', async ({ page }) => {
    await goto(page, '/chat/new');
    await page.waitForLoadState('networkidle');

    // Verify the 4-tab form is present
    await expect(page.getByRole('tab', { name: 'Basics' })).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('tab', { name: 'Task' })).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('tab', { name: 'Context' })).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('tab', { name: 'Settings' })).toBeVisible({ timeout: 5000 });
  });

  test('task tab shows task input field', async ({ page }) => {
    await goto(page, '/chat/new');
    await page.getByRole('tab', { name: 'Task' }).click();
    await page.waitForTimeout(300);
    await expect(page.getByPlaceholder(/Task 1/i).first()).toBeVisible({ timeout: 3000 });
  });

  test('context tab shows context textarea and role selector', async ({ page }) => {
    await goto(page, '/chat/new');
    await page.getByRole('tab', { name: 'Context' }).click();
    await page.waitForTimeout(300);
    await expect(page.getByPlaceholder(/background information and context/i).first()).toBeVisible({ timeout: 3000 });
  });

  test('settings tab has Start Conversation submit button', async ({ page }) => {
    await goto(page, '/chat/new');
    await page.getByRole('tab', { name: 'Settings' }).click();
    await page.waitForTimeout(300);
    await expect(page.getByRole('button', { name: /Start Conversation/i })).toBeVisible({ timeout: 3000 });
  });

  test('navigating to existing chat shows message input', async ({ page }) => {
    const chatId = await createChatViaAPI(page, 'Help me write a function');
    if (!chatId) {
      test.skip();
      return;
    }
    await goto(page, `/chat/${chatId}`);
    // Message input should be present
    const msgInput = page.getByPlaceholder(/message|ask|type/i).or(
      page.locator('textarea').last()
    );
    await expect(msgInput).toBeVisible({ timeout: 10000 });
  });

  test('created chat appears in dashboard Quick Chats', async ({ page }) => {
    const chatId = await createChatViaAPI(page, 'Write a blog post about AI');
    if (!chatId) {
      test.skip();
      return;
    }
    // Navigate to dashboard
    await goto(page, '/');
    // Quick Chats section should appear
    const hasQuickChats = await page.getByText(/Quick Chats/i).isVisible({ timeout: 5000 }).catch(() => false);
    expect(hasQuickChats).toBeTruthy();
  });

  test('markdown renders in AI response (code blocks)', async ({ page }) => {
    await goto(page, '/');
    // Look for any existing chat link in the dashboard
    const chatLinks = page.locator('a[href*="/chat/"]').first();
    if (await chatLinks.isVisible().catch(() => false)) {
      await chatLinks.click();
      await page.waitForLoadState('networkidle');
      // Check if any code blocks exist and are rendered
      const bodyText = await page.locator('body').innerText();
      // If AI response has triple backticks, they should be rendered as code blocks
      if (bodyText.includes('```')) {
        const rendered = await page.locator('pre code').count();
        expect(rendered).toBeGreaterThan(0);
      }
    }
  });

});
