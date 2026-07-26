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
    // Real browsers send Accept-Encoding: gzip, deflate, br - this is what
    // the app actually serves in response, not a curl request with a
    // manually forced header. compression@1.8+ supports brotli (via
    // Node's built-in zlib) as well as gzip and prefers whichever the
    // client asked for first, so either is correct - what matters is that
    // the response isn't going out uncompressed.
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

    await verifyAs(page, { orderNumber: 'ORD-1001', email: 'jane.doe@example.com' });
    await expect(page).toHaveURL(/\/orders$/);

    const loadedSoFar = [...jsChunksLoaded];
    expect(loadedSoFar.some((p) => p.includes('/ChatPage-'))).toBe(false);
    expect(loadedSoFar.some((p) => p.includes('/OrderDetailPage-'))).toBe(false);

    await page.click('.order-list-item >> nth=0');
    await expect(page.locator('.order-detail')).toBeVisible();
    expect([...jsChunksLoaded].some((p) => p.includes('/OrderDetailPage-'))).toBe(true);
    expect([...jsChunksLoaded].some((p) => p.includes('/ChatPage-'))).toBe(false);

    await page.click('.app-sidebar a[href="/chat"]');
    await expect(page.locator('#chat-input')).toBeVisible();
    expect([...jsChunksLoaded].some((p) => p.includes('/ChatPage-'))).toBe(true);
  });
});
