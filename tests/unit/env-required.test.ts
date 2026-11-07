import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  assertRequiredEnv,
  missingEnvMessage,
  missingRequiredEnv,
} from "@/lib/env";

/**
 * The two variables the app cannot start without.
 *
 * Both previously failed a long way from their cause — `DATABASE_URL` as a
 * Prisma initialization error on the first query, `AUTH_SECRET` as an Auth.js
 * `MissingSecret` on the first sign-in — so what is being tested is that the
 * check names the variable and says what to do about it.
 */

const KEYS = ["DATABASE_URL", "AUTH_SECRET"] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of KEYS) saved[key] = process.env[key];
});

afterEach(() => {
  for (const key of KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

describe("missingRequiredEnv", () => {
  it("reports nothing when both are set", () => {
    process.env.DATABASE_URL = "postgresql://localhost:5432/app";
    process.env.AUTH_SECRET = "a-long-random-string";
    expect(missingRequiredEnv()).toEqual([]);
  });

  it("reports the one that is absent", () => {
    process.env.DATABASE_URL = "postgresql://localhost:5432/app";
    delete process.env.AUTH_SECRET;
    expect(missingRequiredEnv()).toEqual(["AUTH_SECRET"]);
  });

  it("reports both when neither is set", () => {
    delete process.env.DATABASE_URL;
    delete process.env.AUTH_SECRET;
    expect(missingRequiredEnv()).toEqual(["DATABASE_URL", "AUTH_SECRET"]);
  });

  it("treats whitespace as absent", () => {
    // A key left as `AUTH_SECRET="   "` is a typo, not a configuration.
    process.env.DATABASE_URL = "postgresql://localhost:5432/app";
    process.env.AUTH_SECRET = "   ";
    expect(missingRequiredEnv()).toEqual(["AUTH_SECRET"]);
  });

  it("treats an empty string as absent", () => {
    process.env.DATABASE_URL = "";
    process.env.AUTH_SECRET = "a-long-random-string";
    expect(missingRequiredEnv()).toEqual(["DATABASE_URL"]);
  });
});

describe("missingEnvMessage", () => {
  it("names every missing variable", () => {
    const message = missingEnvMessage(["DATABASE_URL", "AUTH_SECRET"]);
    expect(message).toContain("DATABASE_URL");
    expect(message).toContain("AUTH_SECRET");
  });

  it("points at the file that lists them", () => {
    expect(missingEnvMessage(["AUTH_SECRET"])).toContain(".env.example");
  });

  it("says what the value should be, not just that it is missing", () => {
    const message = missingEnvMessage(["DATABASE_URL", "AUTH_SECRET"]);
    expect(message).toMatch(/postgres/i);
    expect(message).toMatch(/random/i);
  });

  it("reads as singular for one variable", () => {
    expect(missingEnvMessage(["AUTH_SECRET"])).toContain("variable:");
    expect(missingEnvMessage(["AUTH_SECRET"])).not.toContain("variables:");
  });
});

describe("assertRequiredEnv", () => {
  it("is silent when the environment is complete", () => {
    process.env.DATABASE_URL = "postgresql://localhost:5432/app";
    process.env.AUTH_SECRET = "a-long-random-string";
    expect(() => assertRequiredEnv()).not.toThrow();
  });

  it("throws a message naming the variable to set", () => {
    process.env.DATABASE_URL = "postgresql://localhost:5432/app";
    delete process.env.AUTH_SECRET;
    expect(() => assertRequiredEnv()).toThrow(/AUTH_SECRET/);
  });
});
