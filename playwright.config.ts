import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './qa/browser',
  fullyParallel: false, // Run sequentially to avoid DB conflicts
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [['list'], ['json', { outputFile: 'qa/last-browser-report.json' }]],
  use: {
    baseURL: process.env.QA_BASE_URL || 'http://localhost:5000',
    headless: true,
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  // No webServer block — start the server manually before running tests
});
