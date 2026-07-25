const helmet = require('helmet');

// helmet doesn't set Permissions-Policy at all as of v8 (dropped from core -
// the standardized feature set changes too often for helmet to keep an
// authoritative default). This app never uses any of these browser
// features, so disable them outright rather than leave the header unset -
// found by the OWASP ZAP baseline scan (see README > Dynamic scanning),
// not written speculatively.
function permissionsPolicy(req, res, next) {
  res.setHeader(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()'
  );
  next();
}

// This app is a fully self-contained SPA - no external fonts, no CDN
// scripts, no inline <style>/<script> in the built output, nothing to
// embed it in someone else's iframe for - so the CSP can be tighter than
// helmet's (already fairly strict) defaults in a few specific spots.
const securityHeaders = [
  helmet({
    contentSecurityPolicy: {
      directives: {
        ...helmet.contentSecurityPolicy.getDefaultDirectives(),
        'style-src': ["'self'"],
        'font-src': ["'self'"],
        'frame-ancestors': ["'none'"],
        // Same "only meaningful once actually served over HTTPS" reasoning
        // as hsts below, but this one isn't just inert over plain HTTP the
        // way an ignored HSTS header is - found while debugging why the
        // cross-browser e2e suite failed on WebKit specifically (every
        // single request, every test): this directive tells the browser to
        // silently rewrite every subresource fetch (scripts, stylesheets)
        // to https:, and WebKit does that even for 127.0.0.1/localhost with
        // no exception, unlike Chromium/Firefox, which special-case loopback
        // addresses as already "secure enough." With no real TLS listener on
        // the test/dev port, every asset request then fails outright and the
        // app never renders - not a WebKit bug so much as Chromium quietly
        // covering for a directive this project only actually wants active
        // in production. null removes the directive entirely (helmet's
        // parseDirectives treats a null value as "delete this key"), same
        // effect hsts's boolean has below.
        'upgrade-insecure-requests': process.env.NODE_ENV === 'production' ? [] : null,
      },
    },
    // Same "nothing here loads or embeds cross-origin resources" reasoning
    // as the CSP tightening above - safe to turn on (helmet defaults this
    // off, since 'require-corp' can break pages that *do* load cross-origin
    // content without CORP/CORS, which this one never does). Also found by
    // the ZAP baseline scan, not speculative.
    crossOriginEmbedderPolicy: true,
    // HSTS only means anything once the site is actually served over HTTPS -
    // browsers ignore the header entirely when it arrives over plain HTTP
    // (RFC 6797), so there's no reason to emit a permanently-inert header on
    // every local/CI response. Pairs with httpsEnforce.js's redirect, which
    // is the other, also production-only, half of the HTTPS story.
    hsts: process.env.NODE_ENV === 'production',
  }),
  permissionsPolicy,
];

module.exports = { securityHeaders };
