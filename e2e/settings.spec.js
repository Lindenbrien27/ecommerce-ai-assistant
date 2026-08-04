const { test, expect } = require('@playwright/test');
const { verifyAs } = require('./helpers.js');

// Each of the 5 Playwright projects (chromium/firefox/webkit/Mobile Chrome/
// Mobile Safari) runs this file in parallel. A shared login email across
// all of them would mean every project's save-reload-assert sequence
// operates on the same database row. Deriving the email from
// testInfo.project.name instead gives each project its own row (and its
// own accountLimiter budget, keyed per-email). This app's OTP flow accepts
// any email - see TEST_ACCOUNTS.md ("Any other email works too - it
// verifies successfully") - so no seeding is required.
function settingsEmailFor(testInfo) {
  return `settings-${testInfo.project.name.replace(/\s+/g, '-').toLowerCase()}@example.com`;
}

test.describe('Settings', () => {
  test('profile changes persist across a reload', async ({ page }, testInfo) => {
    await verifyAs(page, { email: settingsEmailFor(testInfo) });
    await page.goto('/settings');

    await page.fill('.settings-field-row input[maxlength="100"]', 'Dev Account');
    await page.fill('.settings-field-row input[maxlength="50"]', 'devaccount');
    // Role is a custom dropdown (SettingsDropdown), not a native <select> -
    // matches the approved reui-reference design's own custom dropdown.
    await page.click('#settings-role-select');
    await page.click('.settings-select-option:has-text("DevOps")');
    await page.click('.settings-btn-primary');
    await expect(page.locator('.settings-saved-note')).toBeVisible();

    await page.reload();
    await expect(page.locator('.settings-field-row input[maxlength="100"]')).toHaveValue('Dev Account');
    await expect(page.locator('.settings-field-row input[maxlength="50"]')).toHaveValue('devaccount');
    await expect(page.locator('#settings-role-select')).toContainText('DevOps');
  });
});
