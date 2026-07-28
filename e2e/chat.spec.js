const { test, expect } = require('@playwright/test');
const { verifyAs } = require('./helpers');

test.describe('chat', () => {
  test.beforeEach(async ({ page }) => {
    await verifyAs(page, { email: 'jane.doe@example.com' });
    await expect(page).toHaveURL(/\/orders$/);
  });

  test('is reachable from the orders page support banner', async ({ page }) => {
    // The sidebar no longer has its own link to /chat (the decorative
    // Support Chat/FAQ's/Settings/Profile footer group was removed) - the
    // orders-support-banner's own "Chat with Support" link is the real,
    // working path now.
    await page.click('.orders-support-banner-chat');
    await expect(page).toHaveURL(/\/chat$/);
    await expect(page.locator('#chat-input')).toBeVisible();
  });

  test('sending a message without a configured AI provider fails gracefully, not silently', async ({
    page,
  }) => {
    // This environment runs with no real ANTHROPIC_API_KEY (see README >
    // Secrets management), so /api/chat deterministically 500s - this
    // proves the UI surfaces that as a visible error bubble instead of a
    // stuck spinner or a blank screen, which is the behavior that actually
    // matters here since real AI replies aren't something this project
    // pays to test end-to-end.
    await page.goto('/chat');
    await page.fill('#chat-input', "Where's my order?");
    await page.click('#chat-form button[type="submit"]');

    await expect(page.locator('.msg.user').last()).toHaveText("Where's my order?");
    await expect(page.locator('.msg.assistant.error')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('#chat-input')).toBeEnabled();
  });
});
