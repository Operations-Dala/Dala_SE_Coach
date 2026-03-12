/**
 * AppError
 * Structured error with a safe user-facing message separate from the
 * internal (possibly sensitive) message that goes to logs / Sentry.
 *
 * Usage:
 *   throw new AppError('Upload failed — check file format', 400);
 *   throw new AppError('Gemini key missing', 400, 'key row null in settings table');
 */
export class AppError extends Error {
  /**
   * @param {string} userMessage   - Safe message shown to the client.
   * @param {number} statusCode    - HTTP status code (default 500).
   * @param {string} [internalMsg] - Optional detail for server logs only.
   */
  constructor(userMessage, statusCode = 500, internalMsg = null) {
    super(internalMsg || userMessage);
    this.userMessage = userMessage;
    this.statusCode  = statusCode;
    this.isAppError  = true;
  }
}

/**
 * Resolve the safe user message and HTTP status from any thrown value.
 * Also ships the error to Sentry (server-side only, no-op on client).
 *
 * @param {unknown} err
 * @param {string}  context - Short label for server logs ('upload', 'coach', …)
 * @param {Object}  [extra] - Additional context forwarded to Sentry
 * @returns {{ message: string, status: number }}
 */
export function resolveError(err, context = 'api', extra = {}) {
  const isAppErr = err?.isAppError === true;
  console.error(`[${context}]`, err?.message || err);

  // Send unexpected (non-AppError) failures to Sentry for visibility
  if (!isAppErr) {
    import('./monitoring.js')
      .then(({ captureError }) => captureError(err, context, extra))
      .catch(() => {});  // monitoring must never crash the app
  }

  return {
    message: isAppErr
      ? err.userMessage
      : 'An unexpected error occurred. Please try again or contact support.',
    status: isAppErr ? err.statusCode : 500,
  };
}
