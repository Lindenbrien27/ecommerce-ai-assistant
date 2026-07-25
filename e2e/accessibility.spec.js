const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const { verifyAs } = require('./helpers');

// Automated coverage for the basics (labels, landmarks, contrast, ARIA
// misuse, etc.) - not a substitute for manual screen-reader testing, but it
// catches real regressions on every push instead of relying on a one-time
// manual read-through staying true forever.
async function expectNoViolations(page) {
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
}

test.describe('accessibility', () => {
  test('/verify has no violations', async ({ page }) => {
    await page.goto('/verify');
    await expectNoViolations(page);
  });

  test('/orders has no violations', async ({ page }) => {
    await verifyAs(page, { orderNumber: 'ORD-1001', email: 'jane.doe@example.com' });
    await expect(page).toHaveURL(/\/orders$/);
    await expectNoViolations(page);
  });

  test('/orders/:id has no violations', async ({ page }) => {
    await verifyAs(page, { orderNumber: 'ORD-1001', email: 'jane.doe@example.com' });
    await expect(page).toHaveURL(/\/orders$/);
    await page.goto('/orders/ORD-1001');
    await expect(page.locator('.order-detail')).toBeVisible();
    await expectNoViolations(page);
  });

  test('/chat has no violations', async ({ page }) => {
    await verifyAs(page, { orderNumber: 'ORD-1001', email: 'jane.doe@example.com' });
    await page.goto('/chat');
    await expectNoViolations(page);
  });
});
