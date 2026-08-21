const { test, expect } = require('@playwright/test');
const { verifyAs } = require('./helpers');

test.describe('orders', () => {
  test.beforeEach(async ({ page }) => {
    await verifyAs(page, { email: 'jane.doe@example.com' });
    await expect(page).toHaveURL(/\/orders$/);
  });

  test('lists only the logged-in customer\'s own orders', async ({ page }) => {

    await expect(page.locator('.order-history-row')).toHaveCount(2);
    await expect(page.locator('.order-history-title').first()).toHaveText('Wireless Noise-Cancelling Headphones');
    await expect(page.locator('.order-history-title').nth(1)).toHaveText('USB-C Charging Cable (3-pack)');
  });

  test('clicking an order opens its detail page with the right fields', async ({ page }) => {

    await page.click('.order-history-summary >> nth=0');
    await page.click('.order-history-detail-actions a');

    await expect(page).toHaveURL(/\/orders\/ORD-1001$/);
    await expect(page.locator('h1')).toHaveText('ORD-1001');
    await expect(page.locator('.order-product-name')).toHaveText('Wireless Noise-Cancelling Headphones');
    await expect(page.locator('.order-manifest')).toContainText('1Z999AA10123456784');
  });

  test('the browser back button returns to the order list (real history, not just state)', async ({
    page,
  }) => {
    await page.click('.order-history-summary >> nth=0');
    await page.click('.order-history-detail-actions a');
    await expect(page).toHaveURL(/\/orders\/ORD-1001$/);

    await page.goBack();
    await expect(page).toHaveURL(/\/orders$/);
    await expect(page.locator('.order-history-row')).toHaveCount(2);
  });

  test('a direct hard-load of an owned order URL works (SPA fallback + persisted session)', async ({
    page,
  }) => {
    await page.goto('/orders/ORD-1002');
    await expect(page.locator('h1')).toHaveText('ORD-1002');
    await expect(page.locator('.order-product-name')).toContainText('USB-C Charging Cable');
  });

  test('navigating directly to a different customer\'s order number does not leak their data', async ({
    page,
  }) => {

    await page.goto('/orders/ORD-1003');

    await expect(page.locator('.verify-error')).toBeVisible();
    await expect(page.locator('.verify-error')).toHaveText('Order not found.');
    await expect(page.locator('.order-label-card')).toHaveCount(0);
  });

  test('the Category badges editor is a real multi-select filter, not decorative', async ({
    page,
  }, testInfo) => {

    test.skip(testInfo.project.name.startsWith('Mobile'), 'the Category badges card is hidden below 700px by design');

    await expect(page.locator('.order-history-row')).toHaveCount(2);
    await expect(page.locator('.badges-active-row .badge-pill')).toHaveCount(0);

    await page.click('.badges-edit-btn');
    await page.click('.available-row:has-text("Audio")');
    await page.click('.available-row:has-text("Cables")');
    await page.click('.popover-save');

    await expect(page.locator('.badges-active-row .badge-pill')).toHaveCount(2);
    await expect(page.locator('.order-history-row')).toHaveCount(2);

    await page.click('.badges-edit-btn');
    await page.click('.badge-row [aria-label="Remove Cables"]');
    await page.click('.popover-save');

    await expect(page.locator('.badges-active-row .badge-pill')).toHaveCount(1);
    await expect(page.locator('.order-history-row')).toHaveCount(1);
    await expect(page.locator('.order-history-title')).toHaveText('Wireless Noise-Cancelling Headphones');

    await page.click('.badges-edit-btn');
    await page.click('.badge-row [aria-label="Remove Audio"]');
    await page.click('.popover-save');

    await expect(page.locator('.badges-active-row .badge-pill')).toHaveCount(0);
    await expect(page.locator('.order-history-row')).toHaveCount(2);
  });

  test('closing the Category badges editor without saving discards the draft', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name.startsWith('Mobile'), 'the Category badges card is hidden below 700px by design');

    await page.click('.badges-edit-btn');
    await page.click('.available-row:has-text("Audio")');
    await page.click('.popover-close');

    await expect(page.locator('.badges-active-row .badge-pill')).toHaveCount(0);
    await expect(page.locator('.order-history-row')).toHaveCount(2);

    await page.click('.badges-edit-btn');
    await expect(page.locator('.popover-section-label').first()).toContainText('Active Badges (0)');
  });
});
