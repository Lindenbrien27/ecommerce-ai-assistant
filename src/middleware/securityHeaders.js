const helmet = require('helmet');

// This app is a fully self-contained SPA - no external fonts, no CDN
// scripts, no inline <style>/<script> in the built output, nothing to
// embed it in someone else's iframe for - so the CSP can be tighter than
// helmet's (already fairly strict) defaults in a few specific spots.
const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      ...helmet.contentSecurityPolicy.getDefaultDirectives(),
      'style-src': ["'self'"],
      'font-src': ["'self'"],
      'frame-ancestors': ["'none'"],
    },
  },
  // HSTS only means anything once the site is actually served over HTTPS -
  // browsers ignore the header entirely when it arrives over plain HTTP
  // (RFC 6797), so there's no reason to emit a permanently-inert header on
  // every local/CI response. Pairs with httpsEnforce.js's redirect, which
  // is the other, also production-only, half of the HTTPS story.
  hsts: process.env.NODE_ENV === 'production',
});

module.exports = { securityHeaders };
