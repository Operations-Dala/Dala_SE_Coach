import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Capture 100% of errors; reduce to 0.1–0.5 in high-traffic production
  tracesSampleRate: 1.0,

  // Meaningful release tags help link errors to deploys
  release: process.env.NEXT_PUBLIC_APP_VERSION,

  // Only enable in production
  enabled: process.env.NODE_ENV === 'production',
});
