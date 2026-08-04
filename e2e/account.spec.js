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

    await page.fill('.settings-field-row input[maxlength="100"]', 'Dev Account');
    await page.fill('.settings-field-row input[maxlength="50"]', 'devaccount');
    // Role is a custom dropdown (SettingsDropdown), not a native <select> -
    // matches the approved reui-reference design's own custom dropdown.
    await page.click('#profile-role-select');
    await page.click('.settings-select-option:has-text("DevOps")');
    await page.click('.settings-btn-primary');
    await expect(page.locator('.settings-saved-note')).toBeVisible();

    await page.reload();
    await expect(page.locator('.settings-field-row input[maxlength="100"]')).toHaveValue('Dev Account');
    await expect(page.locator('.settings-field-row input[maxlength="50"]')).toHaveValue('devaccount');
    await expect(page.locator('#profile-role-select')).toContainText('DevOps');
  });

  test('address save and remove round-trip', async ({ page }, testInfo) => {
    await verifyAs(page, { email: accountEmailFor(testInfo) });
    await page.goto('/address');

    await page.fill('.settings-field-row:has-text("Address line 1") input', '1 Main St');
    await page.fill('.settings-field-row:has-text("City") input', 'Springfield');
    await page.fill('.settings-field-row:has-text("Postal code") input', '62701');
    await page.fill('.settings-field-row:has-text("Country") input', 'US');
    await page.click('.settings-btn-primary');
    await expect(page.locator('.settings-saved-note')).toBeVisible();

    await page.reload();
    await expect(page.locator('.settings-field-row:has-text("City") input')).toHaveValue('Springfield');

    await page.click('.settings-btn-secondary');
    await page.reload();
    await expect(page.locator('.settings-field-row:has-text("City") input')).toHaveValue('');
  });

  test('payment method save and remove round-trip', async ({ page }, testInfo) => {
    await verifyAs(page, { email: accountEmailFor(testInfo) });
    await page.goto('/payment');

    // Card brand is also a custom dropdown, same component as Role above.
    await page.click('#payment-brand-select');
    await page.click('.settings-select-option:has-text("Visa")');
    await page.fill('.settings-field-row:has-text("Last 4 digits") input', '4242');
    const nextYear = String(new Date().getFullYear() + 1);
    await page.selectOption('.settings-field-row:has-text("Expiry month") select', '8');
    await page.selectOption('.settings-field-row:has-text("Expiry year") select', nextYear);
    await page.fill('.settings-field-row:has-text("Billing name") input', 'Dev Account');
    await page.click('.settings-btn-primary');
    await expect(page.locator('.settings-saved-note')).toBeVisible();

    await page.reload();
    await expect(page.locator('#payment-brand-select')).toContainText('Visa');
    await expect(page.locator('.settings-field-row:has-text("Last 4 digits") input')).toHaveValue('4242');

    await page.click('.settings-btn-secondary');
    await page.reload();
    await expect(page.locator('#payment-brand-select')).toContainText('Select a brand');
    await expect(page.locator('.settings-field-row:has-text("Last 4 digits") input')).toHaveValue('');
  });
});
