// Fills and submits the real verify form (not an API shortcut) - every
// spec that needs a logged-in customer goes through the actual UI flow,
// since that flow itself is one of the things worth continuously proving
// still works.
async function verifyAs(page, { orderNumber, email }) {
  await page.goto('/verify');
  await page.fill('input[type="text"]', orderNumber);
  await page.fill('input[type="email"]', email);
  await page.click('#verify-form button[type="submit"]');
}

module.exports = { verifyAs };
