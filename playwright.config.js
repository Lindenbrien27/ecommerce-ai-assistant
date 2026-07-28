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
    // 127.0.0.1, not localhost - Playwright's Linux WebKit build resolves
    // "localhost" to the IPv6 loopback (::1) first, which this server
    // doesn't listen on, so every WebKit/Mobile Safari request just hangs
    // until timeout. Chromium/Firefox resolve it fine either way, so this
    // only ever showed up as a WebKit-only, fails-from-the-first-test
    // pattern once webkit was added as a project.
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'on-first-retry',
  },
  // Cross-browser (three engines - Chromium, Firefox, WebKit) and
  // cross-device (two touch/mobile-viewport presets, which is what
  // actually exercises the <=480px responsive CSS in frontend/src/index.css
  // - Desktop Chrome never triggers it) rather than just Chromium at one
  // fixed viewport. Every spec in e2e/ runs under all five as-is; nothing
  // here is Chromium-specific.
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    { name: 'Mobile Chrome', use: { ...devices['Pixel 5'] } },
    { name: 'Mobile Safari', use: { ...devices['iPhone 13'] } },
  ],
  webServer: {
    // A dedicated port so this doesn't collide with `npm run dev`/`npm start`
    // running locally at the same time. server.js's own `require('dotenv')
    // .config()` still picks up a local .env if present; DATABASE_URL/
    // JWT_SECRET/ANTHROPIC_API_KEY otherwise come from whatever already
    // populated process.env before `playwright test` ran (Doppler locally,
    // explicit env in CI).
    command: 'node server.js',
    url: `http://127.0.0.1:${PORT}/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
    env: {
      PORT: String(PORT),
      // Never 'production' - that would turn on the HTTPS-redirect
      // middleware, which would break every plain http://localhost request.
      NODE_ENV: 'test',
      // Every spec's beforeEach calls the real /api/auth/otp/request + /verify endpoints,
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
