// Fills and submits the real 2-step email-OTP verify form (not an API
// shortcut) - every spec that needs a logged-in customer goes through the
// actual UI flow, since that flow itself is one of the things worth
// continuously proving still works. Reads the code from POST /api/auth/otp
// /request's own devCode field rather than a real inbox - this test
// environment has no SMTP_* configured (see .env.example), so the backend
// includes it directly in that response instead of emailing it, the same
// convenience this app already extends to POST /api/chat running with no
// real ANTHROPIC_API_KEY.
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
