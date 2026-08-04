const { test, expect } = require('@playwright/test');
const { verifyAs } = require('./helpers.js');

// Each of the 5 Playwright projects (chromium/firefox/webkit/Mobile Chrome/
// Mobile Safari) runs this whole file in parallel. A shared login email
// across all of them would mean every project's address/payment save-
// reload-assert-remove-reload-assert sequence operates on the very same
// database row - one project's save or delete landing mid-sequence in
// another is a genuine data race, not just theoretical flakiness. Deriving
// the email from testInfo.project.name instead gives each project its own
// row (and its own accountLimiter budget, keyed per-email). This app's OTP
// flow accepts any email - see TEST_ACCOUNTS.md ("Any other email works
// too - it verifies successfully") - so no seeding is required.
function accountEmailFor(testInfo) {
  return `account-${testInfo.project.name.replace(/\s+/g, '-').toLowerCase()}@example.com`;
}

test.describe('Account settings', () => {
  test('profile changes persist across a reload', async ({ page }, testInfo) => {
    await verifyAs(page, { email: accountEmailFor(testInfo) });
    await page.goto('/profile');

    await page.fill('.settings-field input[maxlength="100"]', 'Dev Account');
    await page.fill('.settings-field input[maxlength="50"]', 'devaccount');
    await page.selectOption('.settings-field select', 'devops');
    await page.click('.settings-save-btn');
    await expect(page.locator('.settings-saved-note')).toBeVisible();

    await page.reload();
    await expect(page.locator('.settings-field input[maxlength="100"]')).toHaveValue('Dev Account');
    await expect(page.locator('.settings-field input[maxlength="50"]')).toHaveValue('devaccount');
    await expect(page.locator('.settings-field select')).toHaveValue('devops');
  });

  test('address save and remove round-trip', async ({ page }, testInfo) => {
    await verifyAs(page, { email: accountEmailFor(testInfo) });
    await page.goto('/address');

    await page.fill('.settings-field:has-text("Address line 1") input', '1 Main St');
    await page.fill('.settings-field:has-text("City") input', 'Springfield');
    await page.fill('.settings-field:has-text("Postal code") input', '62701');
    await page.fill('.settings-field:has-text("Country") input', 'US');
    await page.click('.settings-save-btn');
    await expect(page.locator('.settings-saved-note')).toBeVisible();

    await page.reload();
    await expect(page.locator('.settings-field:has-text("City") input')).toHaveValue('Springfield');

    await page.click('.settings-remove-btn');
    await page.reload();
    await expect(page.locator('.settings-field:has-text("City") input')).toHaveValue('');
  });

  test('payment method save and remove round-trip', async ({ page }, testInfo) => {
    await verifyAs(page, { email: accountEmailFor(testInfo) });
    await page.goto('/payment');

    await page.selectOption('.settings-field:has-text("Card brand") select', 'Visa');
    await page.fill('.settings-field:has-text("Last 4 digits") input', '4242');
    const nextYear = String(new Date().getFullYear() + 1);
    await page.selectOption('.settings-field:has-text("Expiry month") select', '8');
    await page.selectOption('.settings-field:has-text("Expiry year") select', nextYear);
    await page.fill('.settings-field:has-text("Billing name") input', 'Dev Account');
    await page.click('.settings-save-btn');
    await expect(page.locator('.settings-saved-note')).toBeVisible();

    await page.reload();
    await expect(page.locator('.settings-field:has-text("Last 4 digits") input')).toHaveValue('4242');

    await page.click('.settings-remove-btn');
    await page.reload();
    await expect(page.locator('.settings-field:has-text("Last 4 digits") input')).toHaveValue('');
  });
});
