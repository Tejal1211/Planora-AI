/**
 * @module errors
 * @description Application error class for Planora AI.
 *
 * `AppError` is thrown by route handlers and logic functions to signal
 * expected failure conditions (400, 404, 429). The global error handler
 * in `app.ts` maps it directly to an HTTP response.
 *
 * Security guarantees:
 *  - No stack trace is ever forwarded to the client.
 *  - The `details` field accepts only structured data; it is serialised
 *    by Express's `res.json()` and therefore cannot carry executable content.
 *  - HTTP status codes are set explicitly from the `status` field, never
 *    inferred from the error message string.
 */

/**
 * A domain-level error that carries an HTTP status code.
 * Thrown for expected failure paths; caught by the global error handler.
 *
 * @example
 *   throw new AppError(404, 'Event not found');
 *   throw new AppError(400, 'Validation failed', [{ path: 'date', message: 'Invalid date' }]);
 *   throw AppError.notFound('Vendor not found');
 */
export class AppError extends Error {
  /** HTTP status code to send in the response. */
  public readonly status: number;

  /** Optional structured details (e.g. field-level validation errors). */
  public readonly details?: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.details = details;
    // Restore prototype chain for `instanceof` checks across transpilation targets.
    Object.setPrototypeOf(this, new.target.prototype);
  }

  /** Convenience factory — 404 Not Found. */
  static notFound(msg = 'Not found'): AppError {
    return new AppError(404, msg);
  }

  /** Convenience factory — 400 Bad Request. */
  static badRequest(msg: string): AppError {
    return new AppError(400, msg);
  }

  /** Convenience factory — 429 Too Many Requests. */
  static tooManyRequests(msg = 'Too many requests'): AppError {
    return new AppError(429, msg);
  }
}

/**
 * Type guard — returns `true` if `err` is an `AppError` instance.
 * Safe to use in `catch` blocks where the caught value is `unknown`.
 *
 * @example
 *   catch (err) {
 *     if (isAppError(err)) console.error(err.status, err.message);
 *   }
 */
export function isAppError(err: unknown): err is AppError {
  return err instanceof AppError;
}
