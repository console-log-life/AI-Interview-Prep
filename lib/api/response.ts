import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { AppError } from "./errors";

export type ApiSuccess<T> = { ok: true; data: T };
export type ApiFailure = {
  ok: false;
  error: { message: string; code: string; details?: unknown };
};
export type ApiResult<T> = ApiSuccess<T> | ApiFailure;

export function ok<T>(data: T, status = 200): NextResponse<ApiSuccess<T>> {
  return NextResponse.json({ ok: true as const, data }, { status });
}

export function fail(
  message: string,
  status = 400,
  code = "bad_request",
  details?: unknown,
): NextResponse<ApiFailure> {
  return NextResponse.json(
    { ok: false as const, error: { message, code, details } },
    { status },
  );
}

/** Flatten a ZodError into `{ field: "first message" }` for form display. */
export function fieldErrors(error: ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "form";
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

/**
 * Single funnel for every route handler.
 *
 * Known `AppError`s keep their message and status. Everything else is logged
 * with full detail server-side and reduced to a generic 500 for the client.
 */
export function handleRouteError(error: unknown): NextResponse<ApiFailure> {
  if (error instanceof ZodError) {
    return fail("Some fields need attention.", 422, "validation_error", {
      fields: fieldErrors(error),
    });
  }

  if (error instanceof AppError) {
    return fail(error.message, error.status, error.code, error.details);
  }

  console.error("[api] unhandled error:", error);
  return fail(
    "Something went wrong on our side. Please try again.",
    500,
    "internal_error",
  );
}

/** Wraps a route handler so no error path can leak a stack trace. */
export function route<Args extends unknown[]>(
  handler: (...args: Args) => Promise<NextResponse>,
) {
  return async (...args: Args): Promise<NextResponse> => {
    try {
      return await handler(...args);
    } catch (error) {
      return handleRouteError(error);
    }
  };
}
