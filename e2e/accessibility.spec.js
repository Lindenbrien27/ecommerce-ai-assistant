const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const { verifyAs } = require('./helpers');

// Automated coverage for the basics (labels, landmarks, contrast, ARIA
// misuse, etc.) - not a substitute for manual screen-reader testing, but it
// catches real regressions on every push instead of relying on a one-time
// manual read-through staying true forever.
async function expectNoViolations(page) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
}

// A route/state assertion that would pass axe even if focus/title
// management silently broke - axe only inspects the DOM as it stands, it
// doesn't know what should have happened on navigation. useFocusOnMount and
// useDocumentTitle are dynamic behavior, so they need an explicit runtime
// assertion instead.
async function expectPageAnnounced(page, { heading, titleContains }) {
  await expect(page.locator('h1')).toHaveText(heading);
  await expect(page.locator('h1')).toBeFocused();
  await expect(page).toHaveTitle(new RegExp(titleContains));
}

test.describe('accessibility', () => {
  test('/verify has no violations', async ({ page }) => {
    await page.goto('/verify');
    await expectPageAnnounced(page, { heading: 'Order Support Assistant', titleContains: 'Verify your order' });
    await expectNoViolations(page);
  });

  test('/verify has no violations in dark mode', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/verify');
    await expectNoViolations(page);
  });

  test('/verify shows an accessible error after a failed verification attempt', async ({ page }) => {
    await verifyAs(page, { orderNumber: 'ORD-1001', email: 'not-jane@example.com' });
    await expect(page.locator('.verify-error')).toBeVisible();
    await expectNoViolations(page);
  });

  test('/orders has no violations', async ({ page }) => {
    await verifyAs(page, { orderNumber: 'ORD-1001', email: 'jane.doe@example.com' });
    await expect(page).toHaveURL(/\/orders$/);
    await expectPageAnnounced(page, { heading: 'Your Orders', titleContains: 'Your Orders' });
    await expectNoViolations(page);
  });

  test('/orders has no violations in dark mode', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await verifyAs(page, { orderNumber: 'ORD-1001', email: 'jane.doe@example.com' });
    await expect(page).toHaveURL(/\/orders$/);
    await expectNoViolations(page);
  });

  test('/orders/:id has no violations', async ({ page }) => {
    await verifyAs(page, { orderNumber: 'ORD-1001', email: 'jane.doe@example.com' });
    await expect(page).toHaveURL(/\/orders$/);
    await page.goto('/orders/ORD-1001');
    await expect(page.locator('.order-detail')).toBeVisible();
    await expectPageAnnounced(page, { heading: 'ORD-1001', titleContains: 'ORD-1001' });
    await expectNoViolations(page);
  });

  test('/orders/:id has no violations in dark mode', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await verifyAs(page, { orderNumber: 'ORD-1001', email: 'jane.doe@example.com' });
    await expect(page).toHaveURL(/\/orders$/);
    await page.goto('/orders/ORD-1001');
    await expect(page.locator('.order-detail')).toBeVisible();
    await expectNoViolations(page);
  });

  test('/orders/:id has no violations on a not-found order', async ({ page }) => {
    await verifyAs(page, { orderNumber: 'ORD-1001', email: 'jane.doe@example.com' });
    await expect(page).toHaveURL(/\/orders$/);
    // ORD-1003 belongs to a different customer, so this exercises the same
    // 404 "not found" state a genuinely nonexistent order number would.
    await page.goto('/orders/ORD-1003');
    await expect(page.locator('.verify-error')).toBeVisible();
    await expectNoViolations(page);
  });

  test('/chat has no violations', async ({ page }) => {
    await verifyAs(page, { orderNumber: 'ORD-1001', email: 'jane.doe@example.com' });
    await expect(page).toHaveURL(/\/orders$/);
    await page.goto('/chat');
    await expectPageAnnounced(page, { heading: 'Order Support Assistant', titleContains: 'Chat' });
    await expectNoViolations(page);
  });

  test('/chat has no violations in dark mode', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await verifyAs(page, { orderNumber: 'ORD-1001', email: 'jane.doe@example.com' });
    await expect(page).toHaveURL(/\/orders$/);
    await page.goto('/chat');
    await expectNoViolations(page);
  });

  test('/chat has no violations once a message and an error reply are in the transcript', async ({ page }) => {
    await verifyAs(page, { orderNumber: 'ORD-1001', email: 'jane.doe@example.com' });
    await expect(page).toHaveURL(/\/orders$/);
    await page.goto('/chat');
    await page.fill('#chat-input', "Where's my order?");
    await page.click('#chat-form button[type="submit"]');
    // No real ANTHROPIC_API_KEY in this environment (see chat.spec.js and
    // README > Secrets management) - /api/chat deterministically 500s,
    // which renders the same .msg.assistant.error bubble a real failure
    // would, so this exercises the actual rendered error state rather than
    // an empty transcript.
    await expect(page.locator('.msg.assistant.error')).toBeVisible({ timeout: 10_000 });
    await expectNoViolations(page);
  });
});
