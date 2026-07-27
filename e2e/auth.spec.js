const { test, expect } = require('@playwright/test');
const { verifyAs } = require('./helpers');

test.describe('authentication', () => {
  test('an unauthenticated visit to a protected route redirects to /verify', async ({ page }) => {
    await page.goto('/orders');
    await expect(page).toHaveURL(/\/verify$/);
    await expect(page.locator('#verify-form')).toBeVisible();
  });

  test('verifying with a real order number and its email logs the customer in', async ({ page }) => {
    await verifyAs(page, { orderNumber: 'ORD-1001', email: 'jane.doe@example.com' });

    await expect(page).toHaveURL(/\/orders$/);
    await expect(page.locator('.order-card')).toHaveCount(2);
  });

  test('verifying with the wrong email for a real order shows an error and stays on /verify', async ({
    page,
  }) => {
    await verifyAs(page, { orderNumber: 'ORD-1001', email: 'not-jane@example.com' });

    await expect(page).toHaveURL(/\/verify$/);
    await expect(page.locator('.verify-error')).toBeVisible();
    await expect(page.locator('.order-card')).toHaveCount(0);
  });

  test('logging out clears the session and blocks protected routes again', async ({ page }) => {
    await verifyAs(page, { orderNumber: 'ORD-1001', email: 'jane.doe@example.com' });
    await expect(page).toHaveURL(/\/orders$/);

    await page.click('.storefront-logout');
    await expect(page).toHaveURL(/\/verify$/);

    await page.goto('/orders');
    await expect(page).toHaveURL(/\/verify$/);
  });
});
