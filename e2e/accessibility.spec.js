const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const { verifyAs } = require('./helpers');

async function expectNoViolations(page) {

  await page.emulateMedia({ reducedMotion: 'reduce' });

  await page.waitForLoadState('networkidle');

  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect.getTiming().iterations !== Infinity)
        .map((a) => a.finished)
    )
  );
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
}

async function expectPageAnnounced(page, { heading, titleContains }) {
  await expect(page.locator('h1')).toHaveText(heading);
  await expect(page.locator('h1')).toBeFocused();
  await expect(page).toHaveTitle(new RegExp(titleContains));
}

test.describe('accessibility', () => {
  test('/verify has no violations', async ({ page }) => {
    await page.goto('/verify');
    await expectPageAnnounced(page, { heading: 'Track your orders', titleContains: 'Verify your order' });
    await expectNoViolations(page);
  });

  test('/verify has no violations in dark mode', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/verify');
    await expectNoViolations(page);
  });

  test('/verify shows an accessible error after a failed verification attempt', async ({ page }) => {

    await page.goto('/verify');
    await page.fill('input[type="email"]', 'jane.doe@example.com');
    await page.click('#verify-form button[type="submit"]');
    await page.waitForSelector('#otp-form');
    const wrongCode = '000000';
    for (let i = 0; i < wrongCode.length; i += 1) {
      await page.fill(`#otp-digit-${i}`, wrongCode[i]);
    }
    await page.click('#otp-form button[type="submit"]');

    await expect(page.locator('.verify-error')).toBeVisible();
    await expectNoViolations(page);
  });

  test('/orders has no violations', async ({ page }) => {
    await verifyAs(page, { email: 'jane.doe@example.com' });
    await expect(page).toHaveURL(/\/orders$/);
    await expectPageAnnounced(page, { heading: 'Your Orders', titleContains: 'Your Orders' });
    await expectNoViolations(page);
  });

  test('/orders has no violations in dark mode', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await verifyAs(page, { email: 'jane.doe@example.com' });
    await expect(page).toHaveURL(/\/orders$/);
    await expectNoViolations(page);
  });

  test('/orders/:id has no violations', async ({ page }) => {
    await verifyAs(page, { email: 'jane.doe@example.com' });
    await expect(page).toHaveURL(/\/orders$/);
    await page.goto('/orders/ORD-1001');
    await expect(page.locator('.order-label-card')).toBeVisible();
    await expectPageAnnounced(page, { heading: 'ORD-1001', titleContains: 'ORD-1001' });
    await expectNoViolations(page);
  });

  test('/orders/:id has no violations in dark mode', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await verifyAs(page, { email: 'jane.doe@example.com' });
    await expect(page).toHaveURL(/\/orders$/);
    await page.goto('/orders/ORD-1001');
    await expect(page.locator('.order-label-card')).toBeVisible();
    await expectNoViolations(page);
  });

  test('/orders/:id has no violations on a not-found order', async ({ page }) => {
    await verifyAs(page, { email: 'jane.doe@example.com' });
    await expect(page).toHaveURL(/\/orders$/);

    await page.goto('/orders/ORD-1003');
    await expect(page.locator('.verify-error')).toBeVisible();
    await expectNoViolations(page);
  });

  test('/chat has no violations', async ({ page }) => {
    await verifyAs(page, { email: 'jane.doe@example.com' });
    await expect(page).toHaveURL(/\/orders$/);
    await page.goto('/chat');
    await expectPageAnnounced(page, { heading: 'Order Support Assistant', titleContains: 'Chat' });
    await expectNoViolations(page);
  });

  test('/chat has no violations in dark mode', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await verifyAs(page, { email: 'jane.doe@example.com' });
    await expect(page).toHaveURL(/\/orders$/);
    await page.goto('/chat');
    await expectNoViolations(page);
  });

  test('/chat has no violations once a message and an error reply are in the transcript', async ({ page }) => {
    await verifyAs(page, { email: 'jane.doe@example.com' });
    await expect(page).toHaveURL(/\/orders$/);
    await page.goto('/chat');
    await page.fill('#chat-input', "Where's my order?");
    await page.click('#chat-form button[type="submit"]');

    await expect(page.locator('.msg.assistant.error')).toBeVisible({ timeout: 10_000 });
    await expectNoViolations(page);
  });
});
