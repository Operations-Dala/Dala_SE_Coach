/**
 * Thin Sentry wrapper.
 * Import captureError() in API routes or long-running server code
 * to send errors to Sentry with structured context.
 *
 * Usage:
 *   import { captureError } from '@/lib/monitoring';
 *   captureError(err, 'coach', { se_name: 'John Doe', report_date: '2026-03-09' });
 */

import * as Sentry from '@sentry/nextjs';

/**
 * @param {unknown} err
 * @param {string}  operation  - Short label ('upload', 'coach', 'agent:performance', …)
 * @param {Object}  [extra]    - Additional key/value context attached to the event
 */
export function captureError(err, operation = 'unknown', extra = {}) {
  Sentry.withScope(scope => {
    scope.setTag('operation', operation);
    scope.setExtras(extra);
    Sentry.captureException(err instanceof Error ? err : new Error(String(err)));
  });
}
