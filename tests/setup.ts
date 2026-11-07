import { beforeEach, vi } from "vitest";

/**
 * Global test setup.
 *
 * `server-only` throws when imported outside a React Server Component, which
 * would break any unit test that touches a module in `lib/`. Stubbing it lets
 * the real modules be tested directly instead of being duplicated for tests.
 */
vi.mock("server-only", () => ({}));

// Deterministic, credential-free defaults so nothing reaches a real service.
// NODE_ENV is deliberately not set here — Vitest already sets it to "test",
// and Next.js types it as read-only, which would fail `next build`.
process.env.AUTH_SECRET = process.env.AUTH_SECRET ?? "test-secret-not-a-real-key";
process.env.STORAGE_PROVIDER = "local";
process.env.STORAGE_LOCAL_DIR = "./.test-storage";

beforeEach(() => {
  vi.restoreAllMocks();
});

/** True when a database is available, so DB tests can skip cleanly. */
export const hasDatabase = Boolean(process.env.DATABASE_URL);
