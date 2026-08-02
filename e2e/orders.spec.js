const { test, expect } = require('@playwright/test');
const { verifyAs } = require('./helpers');

test.describe('orders', () => {
  test.beforeEach(async ({ page }) => {
    await verifyAs(page, { email: 'jane.doe@example.com' });
    await expect(page).toHaveURL(/\/orders$/);
  });

  test('lists only the logged-in customer\'s own orders', async ({ page }) => {
    // ORD-1001 (shipped, still in transit) is still in motion, so it's a
    // Needs Attention card; ORD-1002 (delivered, a completed order) is
    // done moving, so it's a compact order history row instead - see
    // OrdersPage.jsx's own split by status.
    await expect(page.locator('.order-card')).toHaveCount(1);
    await expect(page.locator('.order-card-id')).toHaveText('ORD-1001');
    await expect(page.locator('.order-history-row')).toHaveCount(1);
    await expect(page.locator('.order-history-title')).toHaveText('USB-C Charging Cable (3-pack)');
  });

  test('clicking an order opens its detail page with the right fields', async ({ page }) => {
    await page.click('.order-card-details-link >> nth=0');

    await expect(page).toHaveURL(/\/orders\/ORD-1001$/);
    await expect(page.locator('h1')).toHaveText('ORD-1001');
    await expect(page.locator('.order-product-name')).toHaveText('Wireless Noise-Cancelling Headphones');
    await expect(page.locator('.order-manifest')).toContainText('1Z999AA10123456784');
  });

  test('the browser back button returns to the order list (real history, not just state)', async ({
    page,
  }) => {
    await page.click('.order-card-details-link >> nth=0');
    await expect(page).toHaveURL(/\/orders\/ORD-1001$/);

    await page.goBack();
    await expect(page).toHaveURL(/\/orders$/);
    await expect(page.locator('.order-card')).toHaveCount(1);
    await expect(page.locator('.order-history-row')).toHaveCount(1);
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
    await expect(page.locator('.order-label-card')).toHaveCount(0);
  });

  test('the Category badges editor is a real multi-select filter, not decorative', async ({
    page,
  }, testInfo) => {
    // The Category badges card is dropped entirely below 700px (see the
    // comment on that breakpoint in index.css) - a cramped mobile icon row
    // has no room for it, same precedent as the search bar being hidden
    // below 900px. Both mobile projects render narrower than that, so the
    // Edit button this test clicks doesn't exist there.
    test.skip(testInfo.project.name.startsWith('Mobile'), 'the Category badges card is hidden below 700px by design');

    // ORD-1001 (shipped) is headphones (Audio) and still in motion, so
    // it's a Needs Attention card (.order-card); ORD-1002 (delivered) is
    // a USB-C cable (Cables) and done moving, so it's a compact order
    // history row (.order-history-row) instead - the category chips
    // still need to narrow *both* sections together (see NeedsAttention
    // Section's own comment on why, unlike the status tabs/search bar
    // just below it, which only ever touch the history list).
    await expect(page.locator('.order-card')).toHaveCount(1);
    await expect(page.locator('.order-history-row')).toHaveCount(1);
    await expect(page.locator('.badges-active-row .badge-pill')).toHaveCount(0);

    // Edits are staged in the popover and only take effect on Save - one
    // click each on the two "available" rows, then Save applies both at
    // once (this is the multi-select part: additive, not a swap).
    await page.click('.badges-edit-btn');
    await page.click('.available-row:has-text("Audio")');
    await page.click('.available-row:has-text("Cables")');
    await page.click('.popover-save');

    await expect(page.locator('.badges-active-row .badge-pill')).toHaveCount(2);
    await expect(page.locator('.order-card')).toHaveCount(1);
    await expect(page.locator('.order-history-row')).toHaveCount(1);

    // Removing just Cables (in a fresh edit pass) narrows down to Audio
    // only - ORD-1001 (Needs Attention) still matches, ORD-1002 (history)
    // no longer does.
    await page.click('.badges-edit-btn');
    await page.click('.badge-row [aria-label="Remove Cables"]');
    await page.click('.popover-save');

    await expect(page.locator('.badges-active-row .badge-pill')).toHaveCount(1);
    await expect(page.locator('.order-card')).toHaveCount(1);
    await expect(page.locator('.order-card-product')).toHaveText('Wireless Noise-Cancelling Headphones');
    await expect(page.locator('.order-history-row')).toHaveCount(0);

    // Removing every category goes back to "no filter", not "show nothing".
    await page.click('.badges-edit-btn');
    await page.click('.badge-row [aria-label="Remove Audio"]');
    await page.click('.popover-save');

    await expect(page.locator('.badges-active-row .badge-pill')).toHaveCount(0);
    await expect(page.locator('.order-card')).toHaveCount(1);
    await expect(page.locator('.order-history-row')).toHaveCount(1);
  });

  test('closing the Category badges editor without saving discards the draft', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name.startsWith('Mobile'), 'the Category badges card is hidden below 700px by design');

    await page.click('.badges-edit-btn');
    await page.click('.available-row:has-text("Audio")');
    await page.click('.popover-close');

    // Nothing was saved, so the main view and the real filter are both
    // untouched - reopening the editor should show a fresh draft too, not
    // the discarded one.
    await expect(page.locator('.badges-active-row .badge-pill')).toHaveCount(0);
    await expect(page.locator('.order-card')).toHaveCount(1);
    await expect(page.locator('.order-history-row')).toHaveCount(1);

    await page.click('.badges-edit-btn');
    await expect(page.locator('.popover-section-label').first()).toContainText('Active Badges (0)');
  });
});
