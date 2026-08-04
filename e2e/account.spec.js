const { test, expect } = require('@playwright/test');
const { verifyAs } = require('./helpers.js');

test.describe('Account settings', () => {
  test('profile changes persist across a reload', async ({ page }) => {
    await verifyAs(page, { email: 'dev@example.com' });
    await page.goto('/profile');

    await page.fill('.settings-field input[maxlength="100"]', 'Dev Account');
    await page.fill('.settings-field input[maxlength="50"]', 'devaccount');
    await page.selectOption('.settings-field select', 'devops');
    await page.click('.settings-save-btn');
    await expect(page.locator('.settings-saved-note')).toBeVisible();

    await page.reload();
    await expect(page.locator('.settings-field input[maxlength="100"]')).toHaveValue('Dev Account');
    await expect(page.locator('.settings-field select')).toHaveValue('devops');
  });

  test('address save and remove round-trip', async ({ page }) => {
    await verifyAs(page, { email: 'dev@example.com' });
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

  test('payment method save and remove round-trip', async ({ page }) => {
    await verifyAs(page, { email: 'dev@example.com' });
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
