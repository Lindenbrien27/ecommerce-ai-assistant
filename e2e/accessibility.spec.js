const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const { verifyAs } = require('./helpers');

// Automated coverage for the basics (labels, landmarks, contrast, ARIA
// misuse, etc.) - not a substitute for manual screen-reader testing, but it
// catches real regressions on every push instead of relying on a one-time
// manual read-through staying true forever.
async function expectNoViolations(page) {
  // Runs the whole check under prefers-reduced-motion: reduce - this is
  // the one state axe can actually verify contrast in correctly for the
  // sidebar nav/order-filter-tabs' gliding "fill" indicators
  // (.storefront-sidenav-indicator/.order-filter-indicator). Both are
  // absolutely-positioned *siblings* of the nav item/tab they visually
  // sit behind, not ancestors; axe-core's color-contrast check only walks
  // up the DOM's ancestor chain to resolve an effective background, so it
  // can't account for a sibling's layering at all - confirmed live, it
  // was pessimistically attributing an indicator's fill to *unrelated*
  // siblings in the same flex container too (flagging "Arrived"/
  // "Returned" tabs nowhere near the indicator's actual rendered
  // position). .exclude()-ing the indicator from the scan (tried first)
  // did not fix this - exclude only stops an element from being audited
  // itself, it doesn't stop axe from still treating an excluded element
  // as a background candidate for other, non-excluded elements.
  // index.css hides both indicators outright under this same media
  // query (a sliding highlight has no reduced-motion equivalent worth
  // keeping anyway) and gives the active row/tab its own real,
  // ancestor-resolvable background to replace it - see that CSS rule's
  // own comment for the full reasoning, including why this is also just
  // correct behavior on its own, not merely a workaround for this test.
  // The full-motion state was verified separately, by hand, via
  // screenshots - axe cannot reliably audit it, but a sighted user was.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  // networkidle first, then wait for animations - in that order, not just
  // the latter alone. The skeleton-to-real-content .fade-in (OrdersPage/
  // AiAssistantPanel) only starts once its data fetch resolves and React
  // swaps the skeleton for real content; checking document.getAnimations()
  // before that fetch finishes finds nothing in-flight yet (an empty list
  // trivially "finishes" immediately), and the fade-in can then start and
  // still be mid-transition while axe's own analyze() call - not
  // instantaneous - is running. networkidle closes that gap by ensuring
  // the fetch (and therefore the fade-in's start) has already happened
  // before the animation-wait below even looks. Confirmed as a real flake
  // by rerunning the un-networkidle'd version several times in a row.
  await page.waitForLoadState('networkidle');
  // Filtered to exclude infinite-iteration animations (the skeleton
  // shimmer itself, the chat typing indicator) - their own .finished
  // promise never resolves, so waiting on one unfiltered would hang this
  // forever instead of settling.
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect.getTiming().iterations !== Infinity)
        .map((a) => a.finished)
    )
  );
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
}

// A route/state assertion that would pass axe even if focus/title
// management silently broke - axe only inspects the DOM as it stands, it
// doesn't know what should have happened on navigation. useFocusOnMount and
// useDocumentTitle are dynamic behavior, so they need an explicit runtime
// assertion instead.
async function expectPageAnnounced(page, { heading, titleContains }) {
  await expect(page.locator('h1')).toHaveText(heading);
  await expect(page.locator('h1')).toBeFocused();
  await expect(page).toHaveTitle(new RegExp(titleContains));
}

test.describe('accessibility', () => {
  test('/verify has no violations', async ({ page }) => {
    await page.goto('/verify');
    await expectPageAnnounced(page, { heading: 'Track your orders', titleContains: 'Verify your order' });
    await expectNoViolations(page);
  });

  test('/verify has no violations in dark mode', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/verify');
    await expectNoViolations(page);
  });

  test('/verify shows an accessible error after a failed verification attempt', async ({ page }) => {
    // No such thing as a "wrong email" rejection under email-OTP (see
    // auth.spec.js's own comment on why) - the reachable failure mode is a
    // wrong code, entered after a real request for a real email.
    await page.goto('/verify');
    await page.fill('input[type="email"]', 'jane.doe@example.com');
    await page.click('#verify-form button[type="submit"]');
    await page.waitForSelector('#otp-form');
    const wrongCode = '000000';
    for (let i = 0; i < wrongCode.length; i += 1) {
      await page.fill(`#otp-digit-${i}`, wrongCode[i]);
    }
    await page.click('#otp-form button[type="submit"]');

    await expect(page.locator('.verify-error')).toBeVisible();
    await expectNoViolations(page);
  });

  test('/orders has no violations', async ({ page }) => {
    await verifyAs(page, { email: 'jane.doe@example.com' });
    await expect(page).toHaveURL(/\/orders$/);
    await expectPageAnnounced(page, { heading: 'Your Orders', titleContains: 'Your Orders' });
    await expectNoViolations(page);
  });

  test('/orders has no violations in dark mode', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await verifyAs(page, { email: 'jane.doe@example.com' });
    await expect(page).toHaveURL(/\/orders$/);
    await expectNoViolations(page);
  });

  test('/orders/:id has no violations', async ({ page }) => {
    await verifyAs(page, { email: 'jane.doe@example.com' });
    await expect(page).toHaveURL(/\/orders$/);
    await page.goto('/orders/ORD-1001');
    await expect(page.locator('.order-label-card')).toBeVisible();
    await expectPageAnnounced(page, { heading: 'ORD-1001', titleContains: 'ORD-1001' });
    await expectNoViolations(page);
  });

  test('/orders/:id has no violations in dark mode', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await verifyAs(page, { email: 'jane.doe@example.com' });
    await expect(page).toHaveURL(/\/orders$/);
    await page.goto('/orders/ORD-1001');
    await expect(page.locator('.order-label-card')).toBeVisible();
    await expectNoViolations(page);
  });

  test('/orders/:id has no violations on a not-found order', async ({ page }) => {
    await verifyAs(page, { email: 'jane.doe@example.com' });
    await expect(page).toHaveURL(/\/orders$/);
    // ORD-1003 belongs to a different customer, so this exercises the same
    // 404 "not found" state a genuinely nonexistent order number would.
    await page.goto('/orders/ORD-1003');
    await expect(page.locator('.verify-error')).toBeVisible();
    await expectNoViolations(page);
  });

  test('/chat has no violations', async ({ page }) => {
    await verifyAs(page, { email: 'jane.doe@example.com' });
    await expect(page).toHaveURL(/\/orders$/);
    await page.goto('/chat');
    await expectPageAnnounced(page, { heading: 'Order Support Assistant', titleContains: 'Chat' });
    await expectNoViolations(page);
  });

  test('/chat has no violations in dark mode', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await verifyAs(page, { email: 'jane.doe@example.com' });
    await expect(page).toHaveURL(/\/orders$/);
    await page.goto('/chat');
    await expectNoViolations(page);
  });

  test('/chat has no violations once a message and an error reply are in the transcript', async ({ page }) => {
    await verifyAs(page, { email: 'jane.doe@example.com' });
    await expect(page).toHaveURL(/\/orders$/);
    await page.goto('/chat');
    await page.fill('#chat-input', "Where's my order?");
    await page.click('#chat-form button[type="submit"]');
    // No real ANTHROPIC_API_KEY in this environment (see chat.spec.js and
    // README > Secrets management) - /api/chat deterministically 500s,
    // which renders the same .msg.assistant.error bubble a real failure
    // would, so this exercises the actual rendered error state rather than
    // an empty transcript.
    await expect(page.locator('.msg.assistant.error')).toBeVisible({ timeout: 10_000 });
    await expectNoViolations(page);
  });
});
