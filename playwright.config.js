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
    baseURL: `http://localhost:${PORT}`,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // A dedicated port so this doesn't collide with `npm run dev`/`npm start`
    // running locally at the same time. server.js's own `require('dotenv')
    // .config()` still picks up a local .env if present; DATABASE_URL/
    // JWT_SECRET/ANTHROPIC_API_KEY otherwise come from whatever already
    // populated process.env before `playwright test` ran (Doppler locally,
    // explicit env in CI).
    command: 'node server.js',
    url: `http://localhost:${PORT}/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
    env: {
      PORT: String(PORT),
      // Never 'production' - that would turn on the HTTPS-redirect
      // middleware, which would break every plain http://localhost request.
      NODE_ENV: 'test',
      // Every spec's beforeEach calls the real /api/auth/verify endpoint,
      // and they run in parallel - the default RATE_LIMIT_AUTH_MAX (10/60s)
      // is sized for real users, not a whole test suite logging in
      // repeatedly within the same window. The actual rate-limiting
      // behavior is already precisely covered by test/rateLimiter.test.js;
      // this just keeps it from interfering with unrelated specs here.
      RATE_LIMIT_AUTH_MAX: '100',
      RATE_LIMIT_ORDERS_MAX: '100',
      RATE_LIMIT_MAX: '100',
    },
  },
});
