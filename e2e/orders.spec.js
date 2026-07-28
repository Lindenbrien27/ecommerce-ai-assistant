const { test, expect } = require('@playwright/test');
const { verifyAs } = require('./helpers');

test.describe('orders', () => {
  test.beforeEach(async ({ page }) => {
    await verifyAs(page, { email: 'jane.doe@example.com' });
    await expect(page).toHaveURL(/\/orders$/);
  });

  test('lists only the logged-in customer\'s own orders', async ({ page }) => {
    const items = page.locator('.order-card');
    await expect(items).toHaveCount(2);
    // Keyset order is created_at DESC - ORD-1001 (shipped, still in transit)
    // has a later created_at than ORD-1002 (delivered, a completed order
    // from further back) per the seed dates in
    // migrations/1785068947495_fix-seed-order-dates.sql, so it sorts first.
    await expect(page.locator('.order-card-id')).toContainText(['ORD-1001', 'ORD-1002']);
  });

  test('clicking an order opens its detail page with the right fields', async ({ page }) => {
    await page.click('.order-card-details-link >> nth=0');

    await expect(page).toHaveURL(/\/orders\/ORD-1001$/);
    await expect(page.locator('h1')).toHaveText('ORD-1001');
    await expect(page.locator('.order-product-name')).toHaveText('Wireless Noise-Cancelling Headphones');
    await expect(page.locator('.order-detail')).toContainText('1Z999AA10123456784');
  });

  test('the browser back button returns to the order list (real history, not just state)', async ({
    page,
  }) => {
    await page.click('.order-card-details-link >> nth=0');
    await expect(page).toHaveURL(/\/orders\/ORD-1001$/);

    await page.goBack();
    await expect(page).toHaveURL(/\/orders$/);
    await expect(page.locator('.order-card')).toHaveCount(2);
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
    // ORD-1003 belongs to john.smith@example.com, not the logged-in jane.doe.
    await page.goto('/orders/ORD-1003');

    await expect(page.locator('.verify-error')).toBeVisible();
    await expect(page.locator('.verify-error')).toHaveText('Order not found.');
    await expect(page.locator('.order-detail')).toHaveCount(0);
  });

  test('the sidebar Category chips are a real multi-select filter, not decorative', async ({ page }) => {
    const audioChip = page.locator('.storefront-tag-list button', { hasText: 'Audio' });
    const cablesChip = page.locator('.storefront-tag-list button', { hasText: 'Cables' });

    // ORD-1001 is headphones (Audio), ORD-1002 is a USB-C cable (Cables).
    await expect(page.locator('.order-card')).toHaveCount(2);
    await expect(audioChip).toHaveAttribute('aria-pressed', 'false');

    await audioChip.click();
    await expect(audioChip).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.order-card')).toHaveCount(1);
    await expect(page.locator('.order-card-product')).toHaveText('Wireless Noise-Cancelling Headphones');

    // Selecting a second category is additive (multi-select), not a swap.
    await cablesChip.click();
    await expect(page.locator('.order-card')).toHaveCount(2);

    // Deselecting every category goes back to "no filter", not "show nothing".
    await audioChip.click();
    await cablesChip.click();
    await expect(audioChip).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('.order-card')).toHaveCount(2);
  });
});
