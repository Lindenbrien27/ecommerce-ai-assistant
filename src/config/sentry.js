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
    // Full observability, not just error reporting: HTTP/Express request
    // spans, Postgres query spans, and - via anthropicAIIntegration below -
    // a span around every Claude API call carrying model, token usage, tool
    // names, and latency, which is the hot path this app's own performance
    // actually depends on. 1.0 rather than a statistical sample - this is a
    // low-traffic support tool, not a high-volume service where full tracing
    // would be a real cost/data-volume concern.
    tracesSampleRate: 1.0,
    integrations: (defaults) => [
      // OnUncaughtException/OnUnhandledRejection excluded from the
      // defaults - config/crashHandlers.js already registers its own
      // listeners for both and explicitly calls Sentry.captureException
      // itself (with its own pino logging first). Node calls every
      // registered listener for an event, not just one, so leaving
      // Sentry's own default listeners active alongside crashHandlers.js's
      // would report every crash twice.
      ...defaults.filter(
        (integration) => integration.name !== 'OnUncaughtException' && integration.name !== 'OnUnhandledRejection'
      ),
      Sentry.expressIntegration(),
      Sentry.postgresIntegration(),
      // recordInputs/recordOutputs both default to false here, deliberately
      // left that way - without them this still captures model, token
      // counts, tool names, and latency; enabling them would additionally
      // attach the full prompt/response text to the span, which for this
      // app means a customer's actual order details and conversation
      // content leaving the process for a third-party service. Not
      // something to opt into by default.
      Sentry.anthropicAIIntegration(),
    ],
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
