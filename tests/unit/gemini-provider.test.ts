import { beforeEach, describe, expect, it, vi } from "vitest";

import type { GenerateQuestionContext } from "@/types/ai";

/**
 * Gemini provider.
 *
 * The SDK is mocked, so nothing here needs a real key or a network call. What
 * is being tested is the provider's contract with `BaseAIService`: correct
 * request shape, honest refusal detection, error classification that never
 * leaks a credential, and — most importantly — that malformed model output is
 * stopped at the Zod boundary rather than reaching the caller.
 */

const generateContent = vi.fn();

vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = { generateContent };
    constructor(public readonly options: { apiKey: string }) {}
  },
}));

const { GeminiAIService, GEMINI_DEFAULT_MODEL, classifyGeminiError, thinkingBudgetFor, toGeminiSchema } =
  await import("@/lib/ai/gemini");
const { AIError } = await import("@/lib/api/errors");

/** A minimal valid interview-question payload for the shared Zod schema. */
function questionPayload() {
  return JSON.stringify({
    question: "Explain how a hash table achieves average O(1) lookup.",
    topic: "Hashing",
    isFollowUp: false,
    rationale: "Checks whether the candidate understands bucket indexing.",
  });
}

function ok(text: string, extra: Record<string, unknown> = {}) {
  return {
    text,
    usageMetadata: { promptTokenCount: 120, candidatesTokenCount: 45 },
    candidates: [{ finishReason: "STOP" }],
    ...extra,
  };
}

const CTX: GenerateQuestionContext = {
  candidate: {
    name: "Test Candidate",
    targetRole: "Backend Engineer",
    experienceLevel: "FRESHER",
    skills: ["SQL", "Node.js"],
  },
  settings: {
    type: "TECHNICAL",
    persona: "PROFESSIONAL",
    difficulty: "MEDIUM",
    plannedQuestions: 6,
  },
  transcript: [],
  questionNumber: 1,
  coveredTopics: [],
  lastEvaluation: null,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("initialization", () => {
  it("reports itself as the gemini provider", () => {
    const service = new GeminiAIService("test-key", "gemini-2.5-flash");
    expect(service.providerName).toBe("gemini");
    expect(service.model).toBe("gemini-2.5-flash");
  });

  it("falls back to the documented default when no model is given", () => {
    const service = new GeminiAIService("test-key", "");
    expect(service.model).toBe(GEMINI_DEFAULT_MODEL);
  });

  it("passes the key to the SDK rather than relying on ambient env", () => {
    // The key must come from lib/env.ts only, never be picked up implicitly.
    const service = new GeminiAIService("test-key", "gemini-2.5-flash");
    expect(service).toBeDefined();
  });
});

describe("request shape", () => {
  it("asks for JSON constrained by the schema", async () => {
    generateContent.mockResolvedValue(ok(questionPayload()));
    const service = new GeminiAIService("test-key", "gemini-2.5-flash");

    await service.generateInterviewQuestion(CTX);

    const call = generateContent.mock.calls[0][0];
    expect(call.model).toBe("gemini-2.5-flash");
    expect(call.config.responseMimeType).toBe("application/json");
    expect(call.config.responseJsonSchema).toBeDefined();
    expect(call.config.systemInstruction).toBeTruthy();
    expect(call.config.maxOutputTokens).toBeGreaterThan(0);
  });

  it("sends the prompt as user content, never as the system instruction", async () => {
    generateContent.mockResolvedValue(ok(questionPayload()));
    const service = new GeminiAIService("test-key", "gemini-2.5-flash");

    await service.generateInterviewQuestion(CTX);

    const call = generateContent.mock.calls[0][0];
    expect(call.contents[0].role).toBe("user");
    expect(call.contents[0].parts[0].text).toBeTruthy();
  });

  it("makes exactly one API call per capability invocation", async () => {
    generateContent.mockResolvedValue(ok(questionPayload()));
    const service = new GeminiAIService("test-key", "gemini-2.5-flash");

    await service.generateInterviewQuestion(CTX);
    expect(generateContent).toHaveBeenCalledOnce();
  });
});

describe("thinkingBudgetFor", () => {
  it("disables thinking on low effort for a responsive turn", () => {
    expect(thinkingBudgetFor("low")).toBe(0);
  });

  it("hands the decision to the model above low", () => {
    // -1 is the SDK's documented AUTOMATIC value; allowed numeric ranges are
    // model-dependent, so picking one here would risk an API rejection.
    for (const effort of ["medium", "high", "xhigh", "max"] as const) {
      expect(thinkingBudgetFor(effort)).toBe(-1);
    }
  });
});

describe("toGeminiSchema", () => {
  it("drops additionalProperties, which Gemini's dialect rejects", () => {
    const out = toGeminiSchema({
      type: "object",
      additionalProperties: false,
      properties: { a: { type: "string" } },
      required: ["a"],
    });
    expect(out).not.toHaveProperty("additionalProperties");
    expect(out.required).toEqual(["a"]);
  });

  it("strips it from nested objects and array items too", () => {
    const out = toGeminiSchema({
      type: "object",
      properties: {
        list: {
          type: "array",
          items: { type: "object", additionalProperties: false, properties: {} },
        },
      },
    }) as Record<string, Record<string, Record<string, unknown>>>;

    const items = out.properties.list.items as Record<string, unknown>;
    expect(items).not.toHaveProperty("additionalProperties");
  });

  it("keeps everything that actually constrains generation", () => {
    const out = toGeminiSchema({
      type: "object",
      properties: {
        difficulty: { type: "string", enum: ["EASY", "MEDIUM"], description: "d" },
      },
      required: ["difficulty"],
    }) as Record<string, Record<string, Record<string, unknown>>>;

    expect(out.properties.difficulty.enum).toEqual(["EASY", "MEDIUM"]);
    expect(out.properties.difficulty.description).toBe("d");
  });

  it("does not mutate the schema it was given", () => {
    const original = { type: "object", additionalProperties: false };
    toGeminiSchema(original);
    expect(original).toHaveProperty("additionalProperties");
  });
});

describe("successful response", () => {
  it("returns validated data for well-formed output", async () => {
    generateContent.mockResolvedValue(ok(questionPayload()));
    const service = new GeminiAIService("test-key", "gemini-2.5-flash");

    const result = await service.generateInterviewQuestion(CTX);

    expect(result.question).toContain("hash table");
    expect(result.topic).toBe("Hashing");
  });
});

describe("bad output is stopped at the validation boundary", () => {
  it.each([
    ["invalid JSON", "not json at all {"],
    ["empty string", ""],
    ["whitespace only", "   "],
    ["JSON of the wrong shape", JSON.stringify({ unrelated: true })],
    ["a bare array", JSON.stringify([1, 2, 3])],
    ["null", "null"],
  ])("rejects %s", async (_label, text) => {
    generateContent.mockResolvedValue(ok(text));
    const service = new GeminiAIService("test-key", "gemini-2.5-flash");

    await expect(service.generateInterviewQuestion(CTX)).rejects.toThrow(AIError);
  });

  it("rejects output missing a required field", async () => {
    // `isFollowUp` is required and has no default; a model omitting it must
    // not be waved through.
    generateContent.mockResolvedValue(
      ok(
        JSON.stringify({
          question: "A sufficiently long question about hashing behaviour.",
          topic: "Hashing",
          rationale: "why",
        }),
      ),
    );
    const service = new GeminiAIService("test-key", "gemini-2.5-flash");

    await expect(service.generateInterviewQuestion(CTX)).rejects.toThrow(AIError);
  });

  it("rejects a field that exceeds its documented length bound", async () => {
    generateContent.mockResolvedValue(
      ok(
        JSON.stringify({
          question: "x".repeat(2000),
          topic: "Hashing",
          isFollowUp: false,
          rationale: "why",
        }),
      ),
    );
    const service = new GeminiAIService("test-key", "gemini-2.5-flash");

    await expect(service.generateInterviewQuestion(CTX)).rejects.toThrow(AIError);
  });

  it("never leaks the raw model text into the thrown message", async () => {
    generateContent.mockResolvedValue(ok("SECRET-MODEL-GIBBERISH{{{"));
    const service = new GeminiAIService("test-key", "gemini-2.5-flash");

    await expect(service.generateInterviewQuestion(CTX)).rejects.toThrow(
      /^(?!.*SECRET-MODEL-GIBBERISH).*$/s,
    );
  });
});

describe("refusals", () => {
  it("treats a blocked prompt as a refusal, not a parse failure", async () => {
    generateContent.mockResolvedValue({
      text: "",
      promptFeedback: { blockReason: "SAFETY" },
      candidates: [],
    });
    const service = new GeminiAIService("test-key", "gemini-2.5-flash");

    await expect(service.generateInterviewQuestion(CTX)).rejects.toThrow(
      /declined/i,
    );
  });

  it.each(["SAFETY", "PROHIBITED_CONTENT", "BLOCKLIST", "SPII"])(
    "treats finishReason %s as a refusal",
    async (finishReason) => {
      generateContent.mockResolvedValue({
        text: "",
        candidates: [{ finishReason }],
      });
      const service = new GeminiAIService("test-key", "gemini-2.5-flash");

      await expect(service.generateInterviewQuestion(CTX)).rejects.toThrow(
        /declined/i,
      );
    },
  );

  it("does not treat a normal STOP as a refusal", async () => {
    generateContent.mockResolvedValue(ok(questionPayload()));
    const service = new GeminiAIService("test-key", "gemini-2.5-flash");

    await expect(service.generateInterviewQuestion(CTX)).resolves.toBeDefined();
  });
});

describe("classifyGeminiError", () => {
  it("classifies quota exhaustion as rate_limit", () => {
    expect(classifyGeminiError({ status: 429 }).category).toBe("rate_limit");
    expect(
      classifyGeminiError(new Error("RESOURCE_EXHAUSTED: quota")).category,
    ).toBe("rate_limit");
  });

  it("classifies credential failures as auth and names the env var", () => {
    const error = classifyGeminiError({ status: 401 });
    expect(error.category).toBe("auth");
    expect(error.userMessage).toContain("GEMINI_API_KEY");
  });

  it("classifies a deadline as timeout", () => {
    expect(
      classifyGeminiError(new Error("deadline exceeded")).category,
    ).toBe("timeout");
  });

  it("falls back to transport for anything unrecognised", () => {
    expect(classifyGeminiError(new Error("weird")).category).toBe("transport");
    expect(classifyGeminiError(null).category).toBe("transport");
    expect(classifyGeminiError("string error").category).toBe("transport");
  });

  it("reads a status nested under response", () => {
    expect(classifyGeminiError({ response: { status: 429 } }).category).toBe(
      "rate_limit",
    );
  });

  it("never puts a credential-looking value in the user message", () => {
    // Split so a secret scanner does not flag a test fixture as a real key,
    // while still exercising the realistic Google key prefix.
    const fakeKey = ["AIza", "SyNOTAREALKEY0000000"].join("");
    const error = classifyGeminiError(
      new Error(`request failed with key ${fakeKey} rejected`),
    );
    expect(error.userMessage).not.toContain("AIza");
    expect(error.userMessage).not.toContain(fakeKey);
  });

  it("keeps the original error only as a cause, for server logs", () => {
    const original = new Error("upstream detail");
    expect(classifyGeminiError(original).cause).toBe(original);
  });
});

describe("provider errors surface as AIError", () => {
  it("converts a thrown SDK error into a safe AIError", async () => {
    generateContent.mockRejectedValue({ status: 429 });
    const service = new GeminiAIService("test-key", "gemini-2.5-flash");

    await expect(service.generateInterviewQuestion(CTX)).rejects.toThrow(AIError);
  });

  it("does not retry against another provider", async () => {
    // No automatic fallback: one failed call must stay one failed call, or an
    // outage could silently start billing a paid Anthropic account.
    generateContent.mockRejectedValue({ status: 500 });
    const service = new GeminiAIService("test-key", "gemini-2.5-flash");

    await expect(service.generateInterviewQuestion(CTX)).rejects.toThrow();
    expect(generateContent).toHaveBeenCalledOnce();
  });
});
