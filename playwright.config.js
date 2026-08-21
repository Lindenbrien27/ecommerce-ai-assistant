const { defineConfig, devices } = require('@playwright/test');

const PORT = 3010;

module.exports = defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? 'github' : 'list',
  use: {

    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'on-first-retry',
  },

  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    { name: 'Mobile Chrome', use: { ...devices['Pixel 5'] } },
    { name: 'Mobile Safari', use: { ...devices['iPhone 13'] } },
  ],
  webServer: {

    command: 'node server.js',
    url: `http://127.0.0.1:${PORT}/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
    env: {
      PORT: String(PORT),

      NODE_ENV: 'test',

      RATE_LIMIT_AUTH_MAX: '100',
      RATE_LIMIT_ORDERS_MAX: '100',
      RATE_LIMIT_MAX: '100',

      SMTP_HOST: '',
      SMTP_PORT: '',
      SMTP_USER: '',
      SMTP_PASS: '',
      EMAIL_FROM: '',
    },
  },
});
