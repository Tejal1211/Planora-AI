/**
 * @module errors
 * @description Application error class for Planora AI.
 *
 * `AppError` is thrown by route handlers and logic functions to signal
 * expected failure conditions (404, 400, 429). The global error handler
 * in `app.ts` maps it directly to an HTTP response — no stack trace is
 * ever leaked to the client.
 */

/**
 * A domain-level error that carries an HTTP status code.
 *
 * @example
 *   throw new AppError(404, 'Event not found');
 *   throw new AppError(400, 'Validation failed', { field: 'date' });
 */
export class AppError extends Error {
  constructor(public status: number, message: string, public details?: unknown) {
    super(message);
    this.name = 'AppError';
  }

  /** Convenience factory: 404 Not Found */
  static notFound(msg = 'Not found') { return new AppError(404, msg); }
  /** Convenience factory: 400 Bad Request */
  static badRequest(msg: string) { return new AppError(400, msg); }
  /** Convenience factory: 429 Too Many Requests */
  static tooManyRequests(msg = 'Too many requests') { return new AppError(429, msg); }
}
