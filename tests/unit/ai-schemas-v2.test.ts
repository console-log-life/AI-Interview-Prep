import { describe, expect, it } from "vitest";

import {
  claimsJsonSchema,
  claimsResponseSchema,
  coachJsonSchema,
  coachResponseSchema,
  codeReviewJsonSchema,
  codeReviewResponseSchema,
  communicationJsonSchema,
  communicationResponseSchema,
  questionsJsonSchema,
  questionsResponseSchema,
  roadmapJsonSchema,
  roadmapResponseSchema,
} from "@/lib/ai/schemas-v2";

/**
 * The two-layer contract: the JSON Schema constrains generation, Zod is the
 * trust boundary. These tests treat the model as hostile — malformed, hostile
 * or oversized output must be rejected or clamped, never written through.
 */

const ALL_SCHEMAS = [
  ["claims", claimsJsonSchema],
  ["codeReview", codeReviewJsonSchema],
  ["coach", coachJsonSchema],
  ["roadmap", roadmapJsonSchema],
  ["questions", questionsJsonSchema],
  ["communication", communicationJsonSchema],
] as const;

describe("JSON Schemas", () => {
  it.each(ALL_SCHEMAS)("%s is a closed object schema", (_name, schema) => {
    expect(schema.type).toBe("object");
    // Open schemas let a model smuggle in unexpected fields.
    expect(schema.additionalProperties).toBe(false);
    expect(Array.isArray(schema.required)).toBe(true);
  });

  it.each(ALL_SCHEMAS)("%s requires every declared property", (_name, schema) => {
    const declared = Object.keys(schema.properties);
    expect([...schema.required].sort()).toEqual(declared.sort());
  });
});

describe("claimsResponseSchema", () => {
  it("accepts a well-formed claim", () => {
    const parsed = claimsResponseSchema.parse({
      claims: [
        {
          claimType: "project",
          text: "Built a payment service handling 2,000 requests per second.",
          technologies: ["Node.js", "Redis"],
          probes: ["How did you measure 2,000 rps?"],
        },
      ],
    });
    expect(parsed.claims).toHaveLength(1);
  });

  it("rejects an unknown claim type rather than coercing it", () => {
    expect(() =>
      claimsResponseSchema.parse({
        claims: [
          {
            claimType: "hobby",
            text: "Plays the guitar on weekends.",
            technologies: [],
            probes: [],
          },
        ],
      }),
    ).toThrow();
  });

  it("defaults missing arrays instead of producing undefined", () => {
    const parsed = claimsResponseSchema.parse({
      claims: [
        { claimType: "skill", text: "Strong in SQL." },
      ],
    });
    expect(parsed.claims[0].technologies).toEqual([]);
    expect(parsed.claims[0].probes).toEqual([]);
  });

  it("rejects an implausible flood of claims", () => {
    expect(() =>
      claimsResponseSchema.parse({
        claims: Array.from({ length: 40 }, () => ({
          claimType: "skill",
          text: "Knows things.",
          technologies: [],
          probes: [],
        })),
      }),
    ).toThrow();
  });

  it("treats a missing claims array as empty, not a crash", () => {
    expect(claimsResponseSchema.parse({}).claims).toEqual([]);
  });
});

describe("codeReviewResponseSchema", () => {
  const valid = {
    correctness: 80,
    timeComplexity: "O(n log n)",
    spaceComplexity: "O(n)",
    readability: 70,
    maintainability: 65,
    efficiency: 75,
    summary: "Works, but sorts unnecessarily.",
    issues: [
      { severity: "MEDIUM", title: "Unneeded sort", detail: "A hash map avoids it.", line: 12 },
    ],
    edgeCases: ["Empty input"],
    optimizationNotes: "Use a hash map.",
    optimizedApproach: "",
    learningPoints: ["Hash maps trade space for time"],
  };

  it("accepts a well-formed review", () => {
    expect(codeReviewResponseSchema.parse(valid).correctness).toBe(80);
  });

  it("rejects a score outside 0-100", () => {
    expect(() =>
      codeReviewResponseSchema.parse({ ...valid, correctness: 150 }),
    ).toThrow();
    expect(() =>
      codeReviewResponseSchema.parse({ ...valid, readability: -5 }),
    ).toThrow();
  });

  it("coerces a numeric string, because models emit them", () => {
    const parsed = codeReviewResponseSchema.parse({
      ...valid,
      correctness: "80",
    });
    expect(parsed.correctness).toBe(80);
  });

  it("rejects an unknown issue severity", () => {
    expect(() =>
      codeReviewResponseSchema.parse({
        ...valid,
        issues: [{ severity: "CATASTROPHIC", title: "x", detail: "y", line: 1 }],
      }),
    ).toThrow();
  });

  it("rejects an optimized approach beyond the size ceiling", () => {
    expect(() =>
      codeReviewResponseSchema.parse({
        ...valid,
        optimizedApproach: "x".repeat(6001),
      }),
    ).toThrow();
  });

  it("defaults complexity to 'unknown' rather than inventing one", () => {
    const { timeComplexity, spaceComplexity, ...rest } = valid;
    void timeComplexity;
    void spaceComplexity;
    const parsed = codeReviewResponseSchema.parse(rest);
    expect(parsed.timeComplexity).toBe("unknown");
    expect(parsed.spaceComplexity).toBe("unknown");
  });
});

describe("coachResponseSchema", () => {
  it("requires a non-empty answer", () => {
    expect(() =>
      coachResponseSchema.parse({ answer: "", suggestedTasks: [], citedFacts: [] }),
    ).toThrow();
  });

  it("rejects a task kind the app cannot route", () => {
    expect(() =>
      coachResponseSchema.parse({
        answer: "Practise SQL joins.",
        suggestedTasks: [
          { title: "Watch a film", kind: "ENTERTAINMENT", topic: "x", estimatedMin: 90 },
        ],
        citedFacts: [],
      }),
    ).toThrow();
  });

  it("clamps an absurd task duration by rejecting it", () => {
    expect(() =>
      coachResponseSchema.parse({
        answer: "Practise.",
        suggestedTasks: [
          { title: "Study", kind: "STUDY", topic: "DSA", estimatedMin: 5000 },
        ],
        citedFacts: [],
      }),
    ).toThrow();
  });

  it("caps the number of suggested tasks", () => {
    expect(() =>
      coachResponseSchema.parse({
        answer: "Do everything.",
        suggestedTasks: Array.from({ length: 10 }, () => ({
          title: "Study",
          kind: "STUDY",
          topic: "DSA",
          estimatedMin: 30,
        })),
        citedFacts: [],
      }),
    ).toThrow();
  });
});

describe("roadmapResponseSchema", () => {
  const task = {
    day: 1,
    title: "Five SQL join questions",
    detail: "Target the weakest area first.",
    kind: "ASSESSMENT",
    topic: "SQL joins",
    estimatedMin: 30,
  };

  it("accepts a well-formed roadmap", () => {
    const parsed = roadmapResponseSchema.parse({
      title: "14-day backend sprint",
      summary: "Fix SQL and DP, then rehearse.",
      tasks: [task],
    });
    expect(parsed.tasks).toHaveLength(1);
  });

  it("rejects a day number outside any supported horizon", () => {
    expect(() =>
      roadmapResponseSchema.parse({
        title: "Plan",
        summary: "",
        tasks: [{ ...task, day: 500 }],
      }),
    ).toThrow();
  });

  it("rejects day zero — days are 1-based", () => {
    expect(() =>
      roadmapResponseSchema.parse({
        title: "Plan",
        summary: "",
        tasks: [{ ...task, day: 0 }],
      }),
    ).toThrow();
  });
});

describe("questionsResponseSchema", () => {
  it("rejects a question type the app does not support", () => {
    expect(() =>
      questionsResponseSchema.parse({
        questions: [
          {
            text: "Which structure gives O(1) lookup?",
            type: "ESSAY",
            topic: "Hashing",
            subtopic: "",
            difficulty: "MEDIUM",
            options: [],
            expectedAnswer: "Hash table",
            explanation: "Direct indexing.",
            skillsTested: [],
            estimatedTimeSec: 60,
            cognitiveLevel: "UNDERSTAND",
          },
        ],
      }),
    ).toThrow();
  });

  it("treats a missing questions array as empty", () => {
    expect(questionsResponseSchema.parse({}).questions).toEqual([]);
  });
});

describe("communicationResponseSchema", () => {
  it("rejects scores outside the permitted range", () => {
    expect(() =>
      communicationResponseSchema.parse({
        clarity: 999,
        structure: 5,
        conciseness: 5,
        confidence: 5,
        fillerImpact: 5,
        strengths: [],
        improvements: [],
        summary: "ok",
      }),
    ).toThrow();
  });
});
