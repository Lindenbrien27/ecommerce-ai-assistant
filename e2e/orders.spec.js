const { test, expect } = require('@playwright/test');
const { verifyAs } = require('./helpers');

test.describe('orders', () => {
  test.beforeEach(async ({ page }) => {
    await verifyAs(page, { orderNumber: 'ORD-1001', email: 'jane.doe@example.com' });
    await expect(page).toHaveURL(/\/orders$/);
  });

  test('lists only the logged-in customer\'s own orders', async ({ page }) => {
    const items = page.locator('.order-list-item');
    await expect(items).toHaveCount(2);
    // Both seed rows share the same created_at (one INSERT, one now()) - the
    // keyset order breaks the tie on id DESC, so the higher (more recently
    // inserted) order number sorts first.
    await expect(page.locator('.order-number')).toContainText(['ORD-1002', 'ORD-1001']);
  });

  test('clicking an order opens its detail page with the right fields', async ({ page }) => {
    await page.click('.order-list-item >> nth=0');

    await expect(page).toHaveURL(/\/orders\/ORD-1002$/);
    await expect(page.locator('h1')).toHaveText('ORD-1002');
    await expect(page.locator('.order-detail')).toContainText('USB-C Charging Cable (3-pack)');
    await expect(page.locator('.order-detail')).toContainText('9400111899223197428490');
  });

  test('the browser back button returns to the order list (real history, not just state)', async ({
    page,
  }) => {
    await page.click('.order-list-item >> nth=0');
    await expect(page).toHaveURL(/\/orders\/ORD-1002$/);

    await page.goBack();
    await expect(page).toHaveURL(/\/orders$/);
    await expect(page.locator('.order-list-item')).toHaveCount(2);
  });

  test('a direct hard-load of an owned order URL works (SPA fallback + persisted session)', async ({
    page,
  }) => {
    await page.goto('/orders/ORD-1002');
    await expect(page.locator('h1')).toHaveText('ORD-1002');
    await expect(page.locator('.order-detail')).toContainText('USB-C Charging Cable');
  });

  test('navigating directly to a different customer\'s order number does not leak their data', async ({
    page,
  }) => {
    // ORD-1003 belongs to john.smith@example.com, not the logged-in jane.doe.
    await page.goto('/orders/ORD-1003');

    await expect(page.locator('.verify-error')).toBeVisible();
    await expect(page.locator('.verify-error')).toHaveText('Order not found.');
    await expect(page.locator('.order-detail')).toHaveCount(0);
  });
});
