/**
 * Typed application errors.
 *
 * Anything thrown as an `AppError` is safe to show a user. Anything else is
 * treated as an unexpected failure: it is logged server-side and the client
 * only ever sees a generic message — raw stack traces never reach the browser.
 */
export class AppError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(
    message: string,
    options: { status?: number; code?: string; details?: unknown } = {},
  ) {
    super(message);
    this.name = "AppError";
    this.status = options.status ?? 400;
    this.code = options.code ?? "bad_request";
    this.details = options.details;
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "You need to sign in to do that.") {
    super(message, { status: 401, code: "unauthorized" });
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "You do not have access to this resource.") {
    super(message, { status: 403, code: "forbidden" });
    this.name = "ForbiddenError";
  }
}

export class NotFoundError extends AppError {
  constructor(message = "We could not find what you were looking for.") {
    super(message, { status: 404, code: "not_found" });
    this.name = "NotFoundError";
  }
}

export class ConflictError extends AppError {
  constructor(message = "That action conflicts with the current state.") {
    super(message, { status: 409, code: "conflict" });
    this.name = "ConflictError";
  }
}

export class ValidationError extends AppError {
  constructor(message = "Some fields need attention.", details?: unknown) {
    super(message, { status: 422, code: "validation_error", details });
    this.name = "ValidationError";
  }
}

export class RateLimitError extends AppError {
  constructor(message = "You are going a bit fast — please wait a moment.") {
    super(message, { status: 429, code: "rate_limited" });
    this.name = "RateLimitError";
  }
}

/** Thrown when an optional integration (AI, sandbox) has no credentials. */
export class ServiceUnavailableError extends AppError {
  constructor(message: string, code = "service_unavailable") {
    super(message, { status: 503, code });
    this.name = "ServiceUnavailableError";
  }
}

export class AIError extends AppError {
  constructor(
    message = "We couldn't reach the AI service right now. Please try again.",
    details?: unknown,
  ) {
    super(message, { status: 502, code: "ai_error", details });
    this.name = "AIError";
  }
}
