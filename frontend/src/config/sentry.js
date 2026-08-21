import * as Sentry from '@sentry/react';

const dsn = import.meta.env.VITE_SENTRY_DSN;

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
