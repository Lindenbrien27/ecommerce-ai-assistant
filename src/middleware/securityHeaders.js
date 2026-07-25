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
