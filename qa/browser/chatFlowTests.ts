import { test, expect, type Page } from '@playwright/test';

const BASE = process.env.QA_BASE_URL || 'http://localhost:5000';

// Helper: navigate and wait for app to be interactive
async function goto(page: Page, path: string) {
  await page.goto(`${BASE}${path}`);
  await page.waitForLoadState('networkidle');
}

// Helper: create a chat with a given role via the UI
async function createChat(page: Page, role: string, task: string) {
  await goto(page, '/');
  // Look for "New Chat" button or equivalent
  const newChatBtn = page.getByRole('button', { name: /new chat/i }).or(
    page.getByText(/new chat/i).first()
  );
  await newChatBtn.click();
  await page.waitForLoadState('networkidle');

  // Fill role
  const roleSelect = page.getByRole('combobox').first();
  if (await roleSelect.isVisible()) {
    await roleSelect.selectOption({ label: role });
  }

  // Fill task
  const taskField = page.getByPlaceholder(/task/i).or(page.locator('[name="task"]'));
  if (await taskField.isVisible()) {
    await taskField.fill(task);
  }

  // Fill context (required)
  const contextField = page.getByPlaceholder(/context/i).or(page.locator('[name="context"]'));
  if (await contextField.isVisible()) {
    await contextField.fill('QA browser test context');
  }

  // Submit
  const submitBtn = page.getByRole('button', { name: /create|start|submit/i }).last();
  await submitBtn.click();
  await page.waitForLoadState('networkidle');
}

test.describe('Core Chat Flows', () => {

  test('app loads and shows landing or dashboard', async ({ page }) => {
    await goto(page, '/');
    // Should not be a blank page or error
    const title = await page.title();
    expect(title).toBeTruthy();

    // Should not show a raw error stack
    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toContain('Error: ');
    expect(bodyText).not.toContain('Cannot read properties');
  });

  test('dashboard shows chat list or empty state', async ({ page }) => {
    await goto(page, '/');
    // Either a list of chats or an empty state message
    const hasList = await page.locator('[data-testid="chat-list"], .chat-list, aside').isVisible().catch(() => false);
    const hasEmpty = await page.getByText(/no chats|start a chat|get started/i).isVisible().catch(() => false);
    expect(hasList || hasEmpty).toBeTruthy();
  });

  test('new chat form renders with all required fields', async ({ page }) => {
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

    // Verify key form fields exist
    await expect(page.getByText(/role|expertise/i).first()).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(/task/i).first()).toBeVisible({ timeout: 5000 });
  });

  test('creating a chat navigates to chat view', async ({ page }) => {
    await createChat(page, 'researcher', 'What is prompt engineering?');
    // Should be on a chat page — URL should include /chat/ or similar
    const url = page.url();
    const onChatPage = url.includes('/chat') || url.includes('/c/');
    expect(onChatPage).toBeTruthy();
  });

  test('message input is visible in chat view', async ({ page }) => {
    await createChat(page, 'developer', 'Help me write a function');
    // Message input should be present
    const msgInput = page.getByPlaceholder(/message|ask|type/i).or(
      page.locator('textarea').last()
    );
    await expect(msgInput).toBeVisible({ timeout: 10000 });
  });

  test('chat appears in sidebar after creation', async ({ page }) => {
    await createChat(page, 'content_writer', 'Write a blog post');
    const url = page.url();
    // Navigate back to dashboard
    await goto(page, '/');
    // Chat list should show at least one item
    const chatItems = page.locator('[data-testid="chat-item"]').or(
      page.locator('.chat-item, li').filter({ hasText: /.+/ })
    );
    const count = await chatItems.count();
    expect(count).toBeGreaterThan(0);
  });

  test('markdown renders in AI response (code blocks)', async ({ page }) => {
    // If an AI response contains markdown, it should render as HTML not raw text
    await goto(page, '/');
    // Look for any existing chat with messages
    const firstChat = page.locator('li, [data-testid="chat-item"]').first();
    if (await firstChat.isVisible()) {
      await firstChat.click();
      await page.waitForLoadState('networkidle');
      // Check if any code blocks exist and are rendered
      const hasCodeBlock = await page.locator('pre, code').count();
      // This is a soft check — just verify no raw backtick markdown visible
      const bodyText = await page.locator('body').innerText();
      // If AI response has triple backticks, they should be rendered as code blocks
      if (bodyText.includes('```')) {
        const rendered = await page.locator('pre code').count();
        expect(rendered).toBeGreaterThan(0);
      }
    }
  });

});
