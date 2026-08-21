const { test, expect } = require('@playwright/test');
const { verifyAs } = require('./helpers');

function findResponse(responses, matcher) {
  return responses.find((res) => matcher(new URL(res.url()).pathname));
}

test.describe('performance', () => {
  test('the main JS bundle is served compressed', async ({ page }) => {
    const responses = [];
    page.on('response', (res) => responses.push(res));

    await page.goto('/verify');

    const mainBundle = findResponse(responses, (p) => /^\/assets\/index-.*\.js$/.test(p));
    expect(mainBundle, 'expected the main bundle to have been requested').toBeTruthy();

    expect(['gzip', 'br']).toContain(mainBundle.headers()['content-encoding']);
  });

  test('hashed assets get long-lived immutable caching; the HTML shell does not', async ({ page }) => {
    const responses = [];
    page.on('response', (res) => responses.push(res));

    await page.goto('/verify');

    const mainBundle = findResponse(responses, (p) => /^\/assets\/index-.*\.js$/.test(p));
    expect(mainBundle.headers()['cache-control']).toBe('public, max-age=31536000, immutable');

    const shell = findResponse(responses, (p) => p === '/verify');
    expect(shell.headers()['cache-control']).toBe('no-cache');
  });

  test('page code is lazy-loaded - a page not yet visited has not been fetched', async ({ page }) => {
    const jsChunksLoaded = new Set();
    page.on('request', (req) => {
      const { pathname } = new URL(req.url());
      if (pathname.startsWith('/assets/') && pathname.endsWith('.js')) {
        jsChunksLoaded.add(pathname);
      }
    });

    await verifyAs(page, { email: 'jane.doe@example.com' });
    await expect(page).toHaveURL(/\/orders$/);

    const loadedSoFar = [...jsChunksLoaded];
    expect(loadedSoFar.some((p) => p.includes('/ChatPage-'))).toBe(false);
    expect(loadedSoFar.some((p) => p.includes('/OrderDetailPage-'))).toBe(false);

    await page.click('.order-history-summary >> nth=0');
    await page.click('.order-history-detail-actions a');
    await expect(page.locator('.order-label-card')).toBeVisible();
    expect([...jsChunksLoaded].some((p) => p.includes('/OrderDetailPage-'))).toBe(true);
    expect([...jsChunksLoaded].some((p) => p.includes('/ChatPage-'))).toBe(false);

    await page.click('.back-link');
    await expect(page).toHaveURL(/\/orders$/);
    await page.click('.profile-menu-trigger');
    await page.click('.profile-menu-item:has-text("Help & Support")');
    await expect(page.locator('#chat-input')).toBeVisible();
    expect([...jsChunksLoaded].some((p) => p.includes('/ChatPage-'))).toBe(true);
  });
});
