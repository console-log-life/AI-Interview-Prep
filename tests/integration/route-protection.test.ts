import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

import { hashPassword, verifyPassword } from "@/lib/auth/password";
import {
  AppError,
  ForbiddenError,
  UnauthorizedError,
  ValidationError,
} from "@/lib/api/errors";
import { fieldErrors, handleRouteError } from "@/lib/api/response";
import { ZodError, z } from "zod";

/**
 * Route-protection rules.
 *
 * These mirror the matcher logic in `middleware.ts` exactly. Keeping them
 * pinned in a test means a future edit to the protected-route list cannot
 * silently expose a page.
 */
const PROTECTED_PREFIXES = [
  "/dashboard",
  "/profile",
  "/resume",
  "/interview",
  "/assessments",
  "/coding",
  "/progress",
  "/settings",
  "/job-description",
  "/coach",
  "/roadmap",
  "/skills",
  "/practice",
  "/admin",
];
const ADMIN_PREFIXES = ["/admin"];
const AUTH_PAGES = ["/login", "/register"];

function matches(pathname: string, prefixes: string[]): boolean {
  return prefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

describe("route protection", () => {
  it.each([
    "/dashboard",
    "/profile",
    "/resume",
    "/interview",
    "/interview/new",
    "/interview/abc123",
    "/interview/abc123/result",
    "/assessments",
    "/assessments/abc/result",
    "/coding",
    "/coding/two-sum",
    "/progress",
    "/settings",
    "/job-description",
    "/admin",
    "/admin/questions",
  ])("requires authentication for %s", (pathname) => {
    expect(matches(pathname, PROTECTED_PREFIXES)).toBe(true);
  });

  it.each(["/", "/login", "/register"])(
    "leaves %s publicly accessible",
    (pathname) => {
      expect(matches(pathname, PROTECTED_PREFIXES)).toBe(false);
    },
  );

  it("does not protect a path that merely starts with the same letters", () => {
    // "/admin-guide" must not be treated as being under "/admin".
    expect(matches("/admin-guide", ADMIN_PREFIXES)).toBe(false);
    expect(matches("/interviewing-tips", PROTECTED_PREFIXES)).toBe(false);
  });

  it("restricts every /admin path to administrators", () => {
    for (const path of [
      "/admin",
      "/admin/questions",
      "/admin/users",
      "/admin/analytics",
      "/admin/interviews",
      "/admin/assessments",
    ]) {
      expect(matches(path, ADMIN_PREFIXES)).toBe(true);
    }
  });

  it("does not restrict student pages to administrators", () => {
    for (const path of ["/dashboard", "/profile", "/coding"]) {
      expect(matches(path, ADMIN_PREFIXES)).toBe(false);
    }
  });

  it("treats the auth pages as sign-in pages", () => {
    expect(matches("/login", AUTH_PAGES)).toBe(true);
    expect(matches("/register", AUTH_PAGES)).toBe(true);
    expect(matches("/dashboard", AUTH_PAGES)).toBe(false);
  });
});

/**
 * The list above only helps if it stays in step with reality. These two tests
 * compare it against the actual route folders and against `middleware.ts`, so
 * adding a dashboard page without protecting it fails the suite rather than
 * shipping an open page.
 */
describe("protected list matches the application", () => {
  const root = path.resolve(__dirname, "../..");

  function routeSegments(dir: string): string[] {
    return readdirSync(path.join(root, dir), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      // Skip route groups "(x)" and dynamic segments "[id]".
      .filter((entry) => !/^[([]/.test(entry.name))
      .map((entry) => `/${entry.name}`);
  }

  it("covers every page under the (dashboard) route group", () => {
    for (const route of routeSegments("app/(dashboard)")) {
      expect(PROTECTED_PREFIXES).toContain(route);
    }
  });

  it("covers every page under /admin", () => {
    // /admin itself is the prefix; its children are covered transitively.
    expect(PROTECTED_PREFIXES).toContain("/admin");
    for (const route of routeSegments("app/admin")) {
      expect(matches(`/admin${route}`, ADMIN_PREFIXES)).toBe(true);
    }
  });

  it("is the same list the middleware actually enforces", () => {
    const source = readFileSync(path.join(root, "middleware.ts"), "utf8");
    const block = source.match(
      /const PROTECTED_PREFIXES = \[([\s\S]*?)\];/,
    )?.[1];
    expect(block).toBeDefined();

    const fromMiddleware = [...(block ?? "").matchAll(/"([^"]+)"/g)].map(
      (match) => match[1],
    );
    expect(fromMiddleware.sort()).toEqual([...PROTECTED_PREFIXES].sort());
  });
});

/**
 * bcrypt at 12 rounds is *intentionally* slow — that cost is the security
 * property. Four hashes in one test can exceed Vitest's 5s default on a
 * loaded machine, so these tests get an explicit budget. The assertions are
 * unchanged; only the time allowance is. Lowering the work factor to make
 * them fast would weaken the thing being tested.
 */
const BCRYPT_TIMEOUT_MS = 30_000;

describe("password hashing", () => {
  it("produces a hash that is not the plaintext", async () => {
    const hash = await hashPassword("StrongPass1");
    expect(hash).not.toBe("StrongPass1");
    expect(hash).not.toContain("StrongPass1");
    expect(hash.startsWith("$2")).toBe(true);
  }, BCRYPT_TIMEOUT_MS);

  it("verifies the correct password", async () => {
    const hash = await hashPassword("StrongPass1");
    expect(await verifyPassword("StrongPass1", hash)).toBe(true);
  }, BCRYPT_TIMEOUT_MS);

  it("rejects the wrong password", async () => {
    const hash = await hashPassword("StrongPass1");
    expect(await verifyPassword("WrongPass1", hash)).toBe(false);
  }, BCRYPT_TIMEOUT_MS);

  it("salts, so the same password hashes differently each time", async () => {
    const [a, b] = await Promise.all([
      hashPassword("StrongPass1"),
      hashPassword("StrongPass1"),
    ]);
    expect(a).not.toBe(b);
    // Both must still verify.
    expect(await verifyPassword("StrongPass1", a)).toBe(true);
    expect(await verifyPassword("StrongPass1", b)).toBe(true);
  }, BCRYPT_TIMEOUT_MS);

  it("returns false — and does not throw — for an account with no password", async () => {
    // OAuth-only or not-yet-migrated accounts have a null hash.
    expect(await verifyPassword("anything", null)).toBe(false);
    expect(await verifyPassword("anything", undefined)).toBe(false);
  });
});

describe("error handling", () => {
  it("gives each error type the right HTTP status", () => {
    expect(new UnauthorizedError().status).toBe(401);
    expect(new ForbiddenError().status).toBe(403);
    expect(new ValidationError().status).toBe(422);
    expect(new AppError("boom").status).toBe(400);
  });

  it("never leaks an unexpected error's message to the client", async () => {
    // `handleRouteError` deliberately logs the real error server-side before
    // returning a generic 500. The spy asserts that half of the contract and
    // keeps the (expected) log out of the test output — nothing here tries to
    // reach a database; the connection string is a fixture, not config.
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const leaky = new Error(
      "Connection string postgres://user:hunter2@db:5432 failed",
    );

    const response = handleRouteError(leaky);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.ok).toBe(false);
    expect(body.error.message).not.toContain("hunter2");
    expect(body.error.message).not.toContain("postgres://");
    expect(body.error.code).toBe("internal_error");

    // Operators must still be able to diagnose it.
    expect(logged).toHaveBeenCalledWith("[api] unhandled error:", leaky);
  });

  it("passes a known AppError message through, because it is user-safe", async () => {
    const response = handleRouteError(
      new ForbiddenError("This area is restricted to administrators."),
    );
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error.message).toBe("This area is restricted to administrators.");
  });

  it("turns a ZodError into a 422 with per-field messages", async () => {
    const schema = z.object({
      email: z.string().email(),
      age: z.number().min(18),
    });
    const parsed = schema.safeParse({ email: "nope", age: 12 });
    expect(parsed.success).toBe(false);

    if (!parsed.success) {
      const response = handleRouteError(parsed.error);
      const body = await response.json();

      expect(response.status).toBe(422);
      expect(body.error.code).toBe("validation_error");
      expect(body.error.details.fields.email).toBeDefined();
      expect(body.error.details.fields.age).toBeDefined();
    }
  });

  it("keeps only the first message per field", () => {
    const error = new ZodError([
      {
        code: "custom",
        path: ["password"],
        message: "First problem",
      },
      {
        code: "custom",
        path: ["password"],
        message: "Second problem",
      },
    ]);
    expect(fieldErrors(error)).toEqual({ password: "First problem" });
  });
});
