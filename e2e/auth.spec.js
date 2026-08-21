const { test, expect } = require('@playwright/test');
const { verifyAs } = require('./helpers');

test.describe('authentication', () => {
  test('an unauthenticated visit to a protected route redirects to /verify', async ({ page }) => {
    await page.goto('/orders');
    await expect(page).toHaveURL(/\/verify$/);
    await expect(page.locator('#verify-form')).toBeVisible();
  });

  test('verifying with a real email and the correct code logs the customer in', async ({ page }) => {
    await verifyAs(page, { email: 'jane.doe@example.com' });

    await expect(page).toHaveURL(/\/orders$/);

    await expect(page.locator('.order-history-row')).toHaveCount(2);
  });

  test('entering the wrong code shows an error and stays on /verify', async ({ page }) => {
    await page.goto('/verify');
    await page.fill('input[type="email"]', 'jane.doe@example.com');
    await page.click('#verify-form button[type="submit"]');
    await page.waitForSelector('#otp-form');

    const wrongCode = '000000';
    for (let i = 0; i < wrongCode.length; i += 1) {
      await page.fill(`#otp-digit-${i}`, wrongCode[i]);
    }
    await page.click('#otp-form button[type="submit"]');

    await expect(page).toHaveURL(/\/verify$/);
    await expect(page.locator('.verify-error')).toBeVisible();
  });

  test('an email with no orders still verifies successfully and shows an empty state', async ({ page }) => {
    await verifyAs(page, { email: 'nobody@example.com' });

    await expect(page).toHaveURL(/\/orders$/);
    await expect(page.locator('.order-history-row')).toHaveCount(0);
    await expect(page.getByText('No orders found for this email')).toBeVisible();
  });

  test('logging out clears the session and blocks protected routes again', async ({ page }) => {
    await verifyAs(page, { email: 'jane.doe@example.com' });
    await expect(page).toHaveURL(/\/orders$/);

    await page.click('.profile-menu-trigger');
    await page.click('.profile-menu-signout');
    await expect(page).toHaveURL(/\/verify$/);

    await page.goto('/orders');
    await expect(page).toHaveURL(/\/verify$/);
  });
});
