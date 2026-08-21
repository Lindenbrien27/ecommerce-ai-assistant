

async function verifyAs(page, { email }) {
  await page.goto('/verify');
  await page.fill('input[type="email"]', email);

  const [response] = await Promise.all([
    page.waitForResponse((res) => res.url().includes('/api/auth/otp/request') && res.request().method() === 'POST'),
    page.click('#verify-form button[type="submit"]'),
  ]);
  const { devCode } = await response.json();

  await page.waitForSelector('#otp-form');
  for (let i = 0; i < devCode.length; i += 1) {
    await page.fill(`#otp-digit-${i}`, devCode[i]);
  }
  await page.click('#otp-form button[type="submit"]');
}

module.exports = { verifyAs };
