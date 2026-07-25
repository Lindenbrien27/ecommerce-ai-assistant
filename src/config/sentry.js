const Sentry = require('@sentry/node');

// Optional, same pattern as ANTHROPIC_API_KEY (see requiredEnv.js): without
// SENTRY_DSN, Sentry.init() is simply skipped - every Sentry.* call used
// elsewhere (captureException, setupExpressErrorHandler, flush) is still
// safe to call on an uninitialized SDK, it just becomes a no-op instead of
// sending anything. That lets the rest of the app call Sentry unconditionally
// rather than threading an "is monitoring configured" check through every
// call site.
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',
    // Error tracking, not performance tracing - no transactions/spans, so
    // no volume reason to sample below 100% of the errors this does report.
    tracesSampleRate: 0,
    // Same intent as the pino redact config in config/logger.js (and the
    // Sentry Express integration's own default of only reporting 5xx, which
    // already keeps routine 401/404/429s out of this entirely) - strip
    // anything that could carry a secret before an event ever leaves the
    // process, since this pipeline is separate from pino's and isn't
    // covered by that redact config.
    beforeSend(event) {
      if (event.request?.headers) {
        delete event.request.headers.authorization;
        delete event.request.headers.cookie;
        delete event.request.headers['x-api-key'];
      }
      return event;
    },
  });
}

module.exports = Sentry;
