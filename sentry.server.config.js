import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.SENTRY_DSN,

  tracesSampleRate: 1.0,

  release: process.env.NEXT_PUBLIC_APP_VERSION,

  enabled: process.env.NODE_ENV === 'production',
});
