const { test, expect } = require('@playwright/test');
const { verifyAs } = require('./helpers');

test.describe('chat', () => {
  test.beforeEach(async ({ page }) => {
    await verifyAs(page, { email: 'jane.doe@example.com' });
    await expect(page).toHaveURL(/\/orders$/);
  });

  test('is reachable from the account menu\'s Help & Support link', async ({ page }) => {

    await page.click('.profile-menu-trigger');
    await page.click('.profile-menu-item:has-text("Help & Support")');
    await expect(page).toHaveURL(/\/chat$/);
    await expect(page.locator('#chat-input')).toBeVisible();
  });

  test('sending a message without a configured AI provider fails gracefully, not silently', async ({
    page,
  }) => {

    await page.goto('/chat');
    await page.fill('#chat-input', "Where's my order?");
    await page.click('#chat-form button[type="submit"]');

    await expect(page.locator('.msg.user').last()).toHaveText("Where's my order?");
    await expect(page.locator('.msg.assistant.error')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('#chat-input')).toBeEnabled();
  });
});
