import * as Sentry from '@sentry/react';

// Optional, same pattern as the backend's own src/config/sentry.js: without
// VITE_SENTRY_DSN, Sentry.init() is simply skipped and every Sentry.* call
// used elsewhere (ErrorBoundary, captureException) becomes a no-op. Note
// the different mechanism, though - Vite bakes VITE_-prefixed env vars into
// the built bundle at *build* time (import.meta.env), not read from
// process.env at server startup the way the backend's SENTRY_DSN is.
const dsn = import.meta.env.VITE_SENTRY_DSN;

// Same intent as the backend's beforeSend header redaction - regardless of
// exactly which Sentry integration might attach request headers to a
// breadcrumb or span (the fetch instrumentation captures them internally
// for its own use, e.g. distributed-tracing headers), the Authorization
// header carries this app's live bearer token and must never leave the
// browser attached to a telemetry event.
function scrubHeaders(event) {
  const request = event.request;
  if (request?.headers) {
    delete request.headers.authorization;
    delete request.headers.cookie;
  }
  for (const breadcrumb of event.breadcrumbs ?? []) {
    if (breadcrumb.data?.headers) {
      delete breadcrumb.data.headers.authorization;
      delete breadcrumb.data.headers.cookie;
    }
  }
  return event;
}

if (dsn) {
  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    // Pageload/navigation spans and Web Vitals - this is the "what's
    // actually being used, how fast is it" half of the ask, not just error
    // capture. No Session Replay: this app shows a customer's real order
    // details and chat transcript, and Replay's default masking wouldn't be
    // something to trust without a lot more deliberate configuration than
    // this project needs yet - the same "don't opt into capturing more
    // than necessary by default" judgment call as recordInputs/
    // recordOutputs on the backend's anthropicAIIntegration.
    integrations: [Sentry.browserTracingIntegration()],
    tracesSampleRate: 1.0,
    beforeSend: scrubHeaders,
    beforeSendTransaction: scrubHeaders,
    beforeBreadcrumb: (breadcrumb) => {
      if (breadcrumb.data?.headers) {
        delete breadcrumb.data.headers.authorization;
        delete breadcrumb.data.headers.cookie;
      }
      return breadcrumb;
    },
  });
}

export { Sentry };
