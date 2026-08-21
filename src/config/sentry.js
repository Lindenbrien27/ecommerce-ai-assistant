const Sentry = require('@sentry/node');

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',

    tracesSampleRate: 1.0,
    integrations: (defaults) => [

      ...defaults.filter(
        (integration) => integration.name !== 'OnUncaughtException' && integration.name !== 'OnUnhandledRejection'
      ),
      Sentry.expressIntegration(),
      Sentry.postgresIntegration(),

      Sentry.anthropicAIIntegration(),
    ],

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
