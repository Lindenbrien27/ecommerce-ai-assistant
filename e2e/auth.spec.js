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
    await expect(page.locator('.order-card')).toHaveCount(2);
  });

  // No such thing as a "wrong email" rejection anymore - POST /api/auth/otp
  // /request always succeeds the same way regardless of whether the email
  // has ever placed an order (see otpService.js's own comment on why:
  // answering that here would let someone enumerate real customer emails).
  // What CAN fail is the code itself.
  test('entering the wrong code shows an error and stays on /verify', async ({ page }) => {
    await page.goto('/verify');
    await page.fill('input[type="email"]', 'jane.doe@example.com');
    await page.click('#verify-form button[type="submit"]');
    await page.waitForSelector('#otp-form');

    // Any 6 digits that don't match the real (unknown to this test) code.
    const wrongCode = '000000';
    for (let i = 0; i < wrongCode.length; i += 1) {
      await page.fill(`#otp-digit-${i}`, wrongCode[i]);
    }
    await page.click('#otp-form button[type="submit"]');

    await expect(page).toHaveURL(/\/verify$/);
    await expect(page.locator('.verify-error')).toBeVisible();
  });

  // The other side of the same no-enumeration design: an email with zero
  // orders still verifies successfully (there's nothing about it to reject)
  // and lands on a real, honest empty dashboard rather than a dead end.
  test('an email with no orders still verifies successfully and shows an empty state', async ({ page }) => {
    await verifyAs(page, { email: 'nobody@example.com' });

    await expect(page).toHaveURL(/\/orders$/);
    await expect(page.locator('.order-card')).toHaveCount(0);
    await expect(page.getByText('No orders found for this email.')).toBeVisible();
  });

  test('logging out clears the session and blocks protected routes again', async ({ page }) => {
    await verifyAs(page, { email: 'jane.doe@example.com' });
    await expect(page).toHaveURL(/\/orders$/);

    await page.click('.storefront-logout');
    await expect(page).toHaveURL(/\/verify$/);

    await page.goto('/orders');
    await expect(page).toHaveURL(/\/verify$/);
  });
});
