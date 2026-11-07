import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Provider selection.
 *
 * `lib/env.ts` reads `process.env` at module load, so each case sets the
 * variables and then imports the modules fresh via `resetModules`. That is
 * what makes it possible to assert real provider selection rather than
 * mocking the thing under test.
 */

/**
 * Both SDKs are stubbed. This file is about which provider the registry
 * chooses, not about either transport — and loading the real clients on every
 * `resetModules` is slow enough to trip the default test timeout.
 */
vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = { generateContent: vi.fn() };
  },
}));

vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create: vi.fn() };
  },
}));

const ORIGINAL = { ...process.env };

async function loadRegistry(vars: Record<string, string | undefined>) {
  vi.resetModules();

  for (const key of [
    "AI_PROVIDER",
    "AI_MODEL",
    "ANTHROPIC_API_KEY",
    "GEMINI_API_KEY",
  ]) {
    delete process.env[key];
  }
  for (const [key, value] of Object.entries(vars)) {
    if (value !== undefined) process.env[key] = value;
  }

  const registry = await import("@/lib/ai");
  const envModule = await import("@/lib/env");
  return { ...registry, ...envModule };
}

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  process.env = { ...ORIGINAL };
  vi.resetModules();
});

/**
 * Generous timeout for the cases that re-import the whole registry.
 *
 * `resetModules` plus a fresh import of the provider graph is genuinely slow —
 * measured at ~1.7s idle, and comfortably past the 5s default when the machine
 * is also running a build. The assertions are about which provider is selected,
 * never about how fast that happens, so a tight timeout only buys flakiness.
 */
const REGISTRY_TIMEOUT_MS = 30_000;

describe("provider selection", () => {
  it("builds the Gemini provider when AI_PROVIDER=gemini", async () => {
    const { getAIService, aiAvailable } = await loadRegistry({
      AI_PROVIDER: "gemini",
      GEMINI_API_KEY: "test-key",
    });

    expect(aiAvailable()).toBe(true);
    expect(getAIService().providerName).toBe("gemini");
  }, REGISTRY_TIMEOUT_MS);

  it("builds the Anthropic provider when AI_PROVIDER=anthropic", async () => {
    const { getAIService, aiAvailable } = await loadRegistry({
      AI_PROVIDER: "anthropic",
      ANTHROPIC_API_KEY: "test-key",
    });

    expect(aiAvailable()).toBe(true);
    expect(getAIService().providerName).toBe("anthropic");
  }, REGISTRY_TIMEOUT_MS);

  it("accepts the provider name case-insensitively", async () => {
    const { getAIService } = await loadRegistry({
      AI_PROVIDER: "Gemini",
      GEMINI_API_KEY: "test-key",
    });
    expect(getAIService().providerName).toBe("gemini");
  });

  it("rejects an unknown provider with an actionable message", async () => {
    const { getAIService } = await loadRegistry({
      AI_PROVIDER: "openai",
      GEMINI_API_KEY: "test-key",
    });

    // Unknown provider is not configured, so this is the not-configured path.
    expect(() => getAIService()).toThrow(/AI_PROVIDER|not configured/i);
  });
});

describe("credentials are checked per provider", () => {
  it("is unavailable when the selected provider's key is missing", async () => {
    const { aiAvailable, getAIService } = await loadRegistry({
      AI_PROVIDER: "gemini",
    });

    expect(aiAvailable()).toBe(false);
    expect(() => getAIService()).toThrow(/GEMINI_API_KEY/);
  });

  it("does not let an Anthropic key make a Gemini deployment look ready", async () => {
    // Otherwise the UI offers AI features that fail on the first request.
    const { aiAvailable } = await loadRegistry({
      AI_PROVIDER: "gemini",
      ANTHROPIC_API_KEY: "some-anthropic-key",
    });

    expect(aiAvailable()).toBe(false);
  });

  it("does not let a Gemini key make an Anthropic deployment look ready", async () => {
    const { aiAvailable } = await loadRegistry({
      AI_PROVIDER: "anthropic",
      GEMINI_API_KEY: "some-gemini-key",
    });

    expect(aiAvailable()).toBe(false);
  });

  it("names the right env var per provider", async () => {
    const gemini = await loadRegistry({ AI_PROVIDER: "gemini" });
    expect(gemini.AI_UNAVAILABLE_MESSAGE).toContain("GEMINI_API_KEY");

    const anthropic = await loadRegistry({ AI_PROVIDER: "anthropic" });
    expect(anthropic.AI_UNAVAILABLE_MESSAGE).toContain("ANTHROPIC_API_KEY");
  });

  it("never puts a key value in the unavailable message", async () => {
    // Split so a secret scanner does not flag a test fixture as a real key.
    const fakeKey = ["AIza", "SyNOTAREALKEY0000000"].join("");
    const { AI_UNAVAILABLE_MESSAGE } = await loadRegistry({
      AI_PROVIDER: "gemini",
      GEMINI_API_KEY: fakeKey,
    });
    expect(AI_UNAVAILABLE_MESSAGE).not.toContain("AIza");
    expect(AI_UNAVAILABLE_MESSAGE).not.toContain(fakeKey);
  });
});

describe("model defaults", () => {
  it("defaults to a Gemini model when the provider is Gemini", async () => {
    const { env } = await loadRegistry({
      AI_PROVIDER: "gemini",
      GEMINI_API_KEY: "test-key",
    });
    expect(env.ai.model).toBe("gemini-2.5-flash");
  });

  it("defaults to a Claude model when the provider is Anthropic", async () => {
    const { env } = await loadRegistry({
      AI_PROVIDER: "anthropic",
      ANTHROPIC_API_KEY: "test-key",
    });
    expect(env.ai.model).toBe("claude-opus-5");
  });

  it("never hands a Claude model id to Gemini by default", async () => {
    // The regression this guards: AI_MODEL is shared between providers, so a
    // single hardcoded default sends "claude-opus-5" to Google.
    const { env } = await loadRegistry({
      AI_PROVIDER: "gemini",
      GEMINI_API_KEY: "test-key",
    });
    expect(env.ai.model).not.toContain("claude");
  });

  it("honours an explicit AI_MODEL override", async () => {
    const { env, getAIService } = await loadRegistry({
      AI_PROVIDER: "gemini",
      GEMINI_API_KEY: "test-key",
      AI_MODEL: "gemini-2.0-flash",
    });
    expect(env.ai.model).toBe("gemini-2.0-flash");
    expect(getAIService().model).toBe("gemini-2.0-flash");
  });
});

describe("no cross-provider fallback", () => {
  it("only ever constructs the configured provider", async () => {
    const { getAIService } = await loadRegistry({
      AI_PROVIDER: "gemini",
      GEMINI_API_KEY: "test-key",
      // An Anthropic key being present must not change anything: falling back
      // to it on a Gemini failure could bill a paid account unexpectedly.
      ANTHROPIC_API_KEY: "also-present",
    });

    expect(getAIService().providerName).toBe("gemini");
  });

  it("caches one instance rather than rebuilding per call", async () => {
    const { getAIService } = await loadRegistry({
      AI_PROVIDER: "gemini",
      GEMINI_API_KEY: "test-key",
    });
    expect(getAIService()).toBe(getAIService());
  });
});

describe("test seam", () => {
  it("lets a fake provider be injected and cleared", async () => {
    const { __setAIService, getAIService } = await loadRegistry({
      AI_PROVIDER: "gemini",
      GEMINI_API_KEY: "test-key",
    });

    const fake = { providerName: "fake" } as never;
    __setAIService(fake);
    expect(getAIService()).toBe(fake);

    __setAIService(null);
    expect(getAIService().providerName).toBe("gemini");
  });
});
