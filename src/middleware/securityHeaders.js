const helmet = require('helmet');

function permissionsPolicy(req, res, next) {
  res.setHeader(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()'
  );
  next();
}

const securityHeaders = [
  helmet({
    contentSecurityPolicy: {
      directives: {
        ...helmet.contentSecurityPolicy.getDefaultDirectives(),
        'style-src': ["'self'"],
        'font-src': ["'self'"],
        'frame-ancestors': ["'none'"],

        'img-src': ["'self'", 'data:'],

        'connect-src': ["'self'", 'https://*.sentry.io'],

        'upgrade-insecure-requests': process.env.NODE_ENV === 'production' ? [] : null,
      },
    },

    crossOriginEmbedderPolicy: true,

    hsts: process.env.NODE_ENV === 'production',
  }),
  permissionsPolicy,
];

const apiDocsStyleOverride = helmet.contentSecurityPolicy({
  directives: {
    ...helmet.contentSecurityPolicy.getDefaultDirectives(),
    'style-src': ["'self'", "'unsafe-inline'"],
    'font-src': ["'self'"],
    'frame-ancestors': ["'none'"],
    'upgrade-insecure-requests': process.env.NODE_ENV === 'production' ? [] : null,
  },
});

const adminCspOverride = helmet.contentSecurityPolicy({
  directives: {
    ...helmet.contentSecurityPolicy.getDefaultDirectives(),

    'style-src': ["'self'", 'https://accounts.google.com/gsi/style'],
    'font-src': ["'self'"],
    'frame-ancestors': ["'none'"],
    'script-src': ["'self'", 'https://accounts.google.com/gsi/client'],
    'frame-src': ["'self'", 'https://accounts.google.com'],
    'connect-src': ["'self'", 'https://accounts.google.com'],
    'upgrade-insecure-requests': process.env.NODE_ENV === 'production' ? [] : null,
  },
});

function adminCoopOverride(req, res, next) {
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  next();
}

module.exports = { securityHeaders, apiDocsStyleOverride, adminCspOverride, adminCoopOverride };
