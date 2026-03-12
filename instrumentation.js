/**
 * Next.js instrumentation hook — loaded once when the server starts.
 * Initialises the Sentry server-side SDK.
 * https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config.js');
  }
}
