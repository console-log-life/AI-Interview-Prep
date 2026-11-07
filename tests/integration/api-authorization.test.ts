import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Every API route must authenticate.
 *
 * A per-route unit test would only cover the routes someone remembered to
 * write one for. This walks `app/api` instead, so a new handler that forgets
 * `requireUser()` fails the suite the moment it is added — which is the only
 * version of this check that keeps working as the app grows.
 */

const API_ROOT = path.resolve(__dirname, "../../app/api");

/** Routes that are deliberately public, with the reason they have to be. */
const PUBLIC_ROUTES: Record<string, string> = {
  "auth/[...nextauth]": "Auth.js sign-in/out endpoints — pre-authentication.",
  "auth/register": "Account creation — the caller has no session yet.",
};

/** Handlers that must additionally be admin-only. */
const ADMIN_PREFIX = "admin/";

function findRouteFiles(dir: string, prefix = ""): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  const found: string[] = [];

  for (const entry of entries) {
    const next = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...findRouteFiles(next, prefix ? `${prefix}/${entry.name}` : entry.name));
    } else if (entry.name === "route.ts") {
      found.push(prefix);
    }
  }

  return found;
}

const routes = findRouteFiles(API_ROOT);

function sourceOf(route: string): string {
  return readFileSync(path.join(API_ROOT, route, "route.ts"), "utf8");
}

/**
 * Exported HTTP handlers in a route file.
 *
 * Handles both forms: `export const GET = ...` and the destructured
 * `export const { GET, POST } = handlers` that Auth.js uses.
 */
function exportedMethods(source: string): string[] {
  const direct = [
    ...source.matchAll(/export const (GET|POST|PATCH|PUT|DELETE)\b/g),
  ].map((match) => match[1]);

  const destructured = [...source.matchAll(/export const \{([^}]*)\}/g)]
    .flatMap((match) => match[1].split(","))
    .map((name) => name.trim())
    .filter((name) =>
      ["GET", "POST", "PATCH", "PUT", "DELETE"].includes(name),
    );

  return [...new Set([...direct, ...destructured])];
}

describe("API route inventory", () => {
  it("finds the route files", () => {
    expect(routes.length).toBeGreaterThan(30);
  });

  it("has no route outside app/api missing a handler export", () => {
    for (const route of routes) {
      const methods = exportedMethods(sourceOf(route));
      expect(
        methods.length,
        `${route} exports no HTTP handler`,
      ).toBeGreaterThan(0);
    }
  });
});

describe("authentication", () => {
  const guarded = routes.filter((route) => !(route in PUBLIC_ROUTES));

  it.each(guarded)("%s requires a session", (route) => {
    const source = sourceOf(route);
    const authenticates =
      source.includes("requireUser(") || source.includes("requireAdmin(");

    expect(
      authenticates,
      `${route} does not call requireUser() or requireAdmin()`,
    ).toBe(true);
  });

  it("only exempts routes that are documented as public", () => {
    for (const route of Object.keys(PUBLIC_ROUTES)) {
      expect(routes, `${route} is listed public but does not exist`).toContain(
        route,
      );
    }
  });

  it("derives the user id from the session, never the request body", () => {
    for (const route of guarded) {
      const source = sourceOf(route);
      // A route parsing `userId` out of the payload would let a caller act as
      // somebody else — the exact hole the session guard exists to close.
      expect(
        /userId\s*:\s*z\./.test(source),
        `${route} appears to accept userId from the request body`,
      ).toBe(false);
    }
  });
});

describe("admin authorization", () => {
  const adminRoutes = routes.filter((route) => route.startsWith(ADMIN_PREFIX));

  it("finds the admin routes", () => {
    expect(adminRoutes.length).toBeGreaterThan(0);
  });

  it.each(adminRoutes)("%s requires an administrator", (route) => {
    const source = sourceOf(route);
    expect(
      source.includes("requireAdmin("),
      `${route} is under /api/admin but does not call requireAdmin()`,
    ).toBe(true);
  });

  it("keeps requireAdmin out of non-admin routes", () => {
    const leaked = routes
      .filter((route) => !route.startsWith(ADMIN_PREFIX))
      .filter((route) => sourceOf(route).includes("requireAdmin("));

    expect(leaked).toEqual([]);
  });
});

describe("route hygiene", () => {
  it("marks every route dynamic so nothing user-specific is cached", () => {
    for (const route of routes) {
      if (route in PUBLIC_ROUTES) continue;
      expect(
        sourceOf(route).includes('dynamic = "force-dynamic"'),
        `${route} is missing force-dynamic`,
      ).toBe(true);
    }
  });

  it("validates request bodies on every mutating handler", () => {
    for (const route of routes) {
      if (route in PUBLIC_ROUTES) continue;

      const source = sourceOf(route);
      const mutates = exportedMethods(source).some((method) =>
        ["POST", "PATCH", "PUT"].includes(method),
      );
      if (!mutates) continue;

      // Either a Zod parse, or no body read at all (action-only endpoints).
      const readsBody = source.includes("request.json()");
      const validates = source.includes(".parse(");

      expect(
        !readsBody || validates,
        `${route} reads a request body without validating it`,
      ).toBe(true);
    }
  });

  it("never hardcodes a credential", () => {
    for (const route of routes) {
      const source = sourceOf(route);
      expect(/sk-ant-[A-Za-z0-9]/.test(source), `${route}`).toBe(false);
      expect(/postgres:\/\/[^"']*:[^"']+@/.test(source), `${route}`).toBe(false);
    }
  });
});
