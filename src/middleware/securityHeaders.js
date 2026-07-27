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
        // Product images (frontend/src/components/ProductImage.jsx) are
        // real photos hotlinked from Wikimedia Commons - this app has no
        // real photography of its own fictional demo products, and a
        // decorative icon was traded for actual photos deliberately.
        // Scoped to that one host specifically, not opened generally;
        // every image URL used is a real, verified, appropriately
        // -licensed file (see README > Image credits) rather than a
        // guessed path. Overrides helmet's default img-src ('self' data:),
        // which stays implicitly in effect for the rest - it's a full
        // directive value, not additive, so 'self'/data: are repeated here.
        'img-src': ["'self'", 'data:', 'https://upload.wikimedia.org'],
        // The one deliberate cross-origin exception in this CSP - the
        // frontend's optional Sentry error/performance monitoring
        // (frontend/src/config/sentry.js) has to actually reach Sentry's
        // ingestion API, which is cross-origin by definition; connect-src
        // otherwise falls back to default-src 'self' like every other
        // directive not listed here. Scoped to *.sentry.io specifically,
        // not opened generally - harmless if VITE_SENTRY_DSN is never set
        // (frontend monitoring stays off, nothing ever calls out to it),
        // same "optional, degrades to inert" shape as every other
        // Sentry-related config in this project.
        'connect-src': ["'self'", 'https://*.sentry.io'],
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

// Scoped to /api-docs only - swagger-ui-bundle.js (the interactive API
// docs at /api-docs, see src/app.js) applies some of its own styling via
// inline <style>/style attributes at runtime, a characteristic of the
// library itself, not something this app controls. Confirmed live in a
// real browser: the strict style-src above blocks it and the affected
// element loses its styling, even though the page still renders and
// functions. Runs after the global securityHeaders above and overrides
// just this one directive for this one route (helmet's CSP middleware
// uses res.setHeader, which replaces rather than merges, so only the
// last one to run for a given request wins) - every other route keeps
// the strict, no-unsafe-inline policy untouched.
const apiDocsStyleOverride = helmet.contentSecurityPolicy({
  directives: {
    ...helmet.contentSecurityPolicy.getDefaultDirectives(),
    'style-src': ["'self'", "'unsafe-inline'"],
    'font-src': ["'self'"],
    'frame-ancestors': ["'none'"],
    'upgrade-insecure-requests': process.env.NODE_ENV === 'production' ? [] : null,
  },
});

module.exports = { securityHeaders, apiDocsStyleOverride };
