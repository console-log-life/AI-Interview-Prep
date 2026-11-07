import { describe, expect, it } from "vitest";

import {
  DUPLICATE_THRESHOLD,
  questionHash,
  similarity,
  validateBatch,
  validateQuestion,
  type CandidateQuestion,
} from "@/lib/assessments/question-quality";

/**
 * AI-generated questions are untrusted content. Schema validation proves the
 * shape; these rules are what stop a well-formed but useless question from
 * reaching a student.
 */

function question(
  overrides: Partial<CandidateQuestion> = {},
): CandidateQuestion {
  return {
    text: "Which data structure gives O(1) average-case lookup by key?",
    type: "MCQ",
    topic: "Hashing",
    difficulty: "MEDIUM",
    options: [
      { text: "Hash table", isCorrect: true },
      { text: "Sorted array", isCorrect: false },
      { text: "Linked list", isCorrect: false },
      { text: "Binary heap", isCorrect: false },
    ],
    expectedAnswer: "Hash table",
    explanation:
      "A hash table computes a bucket index directly from the key, so an average lookup does not depend on the number of stored elements.",
    ...overrides,
  };
}

function errorCodes(candidate: CandidateQuestion, corpus: string[] = []) {
  return validateQuestion(candidate, corpus)
    .issues.filter((issue) => issue.severity === "error")
    .map((issue) => issue.code);
}

describe("questionHash", () => {
  it("ignores punctuation, case and spacing", () => {
    expect(questionHash("What is a B-tree?")).toBe(
      questionHash("what   is a btree"),
    );
  });

  it("differs for genuinely different questions", () => {
    expect(questionHash("What is a B-tree?")).not.toBe(
      questionHash("What is a hash table?"),
    );
  });
});

describe("similarity", () => {
  it("is 1 for identical text", () => {
    expect(similarity("explain the CAP theorem", "explain the CAP theorem")).toBe(1);
  });

  it("is high for a trivial rewording", () => {
    const score = similarity(
      "Explain how database indexing improves query performance",
      "Explain how indexing in a database improves the performance of a query",
    );
    expect(score).toBeGreaterThan(DUPLICATE_THRESHOLD);
  });

  it("is low for unrelated questions", () => {
    const score = similarity(
      "Explain the CAP theorem",
      "What is the time complexity of merge sort",
    );
    expect(score).toBeLessThan(0.2);
  });

  it("returns 0 rather than NaN for empty input", () => {
    expect(similarity("", "")).toBe(0);
    expect(Number.isNaN(similarity("a", ""))).toBe(false);
  });
});

describe("validateQuestion", () => {
  it("accepts a well-formed question", () => {
    const result = validateQuestion(question(), []);
    expect(result.valid).toBe(true);
    expect(result.score).toBeGreaterThan(80);
  });

  it("rejects a question with no correct option", () => {
    const codes = errorCodes(
      question({
        options: [
          { text: "Hash table", isCorrect: false },
          { text: "Sorted array", isCorrect: false },
          { text: "Linked list", isCorrect: false },
          { text: "Binary heap", isCorrect: false },
        ],
      }),
    );
    expect(codes).toContain("no_correct_option");
  });

  it("rejects a single-answer question with two correct options", () => {
    const codes = errorCodes(
      question({
        options: [
          { text: "Hash table", isCorrect: true },
          { text: "Hash map", isCorrect: true },
          { text: "Linked list", isCorrect: false },
          { text: "Binary heap", isCorrect: false },
        ],
      }),
    );
    expect(codes).toContain("multiple_correct");
  });

  it("rejects a question where every option is correct", () => {
    const codes = errorCodes(
      question({
        type: "MULTI_SELECT",
        options: [
          { text: "Hash table", isCorrect: true },
          { text: "Sorted array", isCorrect: true },
          { text: "Linked list", isCorrect: true },
          { text: "Binary heap", isCorrect: true },
        ],
      }),
    );
    expect(codes).toContain("all_options_correct");
  });

  it("rejects 'All of the above' style options", () => {
    const codes = errorCodes(
      question({
        options: [
          { text: "Hash table", isCorrect: false },
          { text: "Sorted array", isCorrect: false },
          { text: "Linked list", isCorrect: false },
          { text: "All of the above", isCorrect: true },
        ],
      }),
    );
    expect(codes).toContain("banned_option");
  });

  it("rejects duplicate option text", () => {
    const codes = errorCodes(
      question({
        options: [
          { text: "Hash table", isCorrect: true },
          { text: "hash table", isCorrect: false },
          { text: "Linked list", isCorrect: false },
          { text: "Binary heap", isCorrect: false },
        ],
      }),
    );
    expect(codes).toContain("duplicate_option");
  });

  it("rejects an explanation too short to teach anything", () => {
    const codes = errorCodes(question({ explanation: "Because it is." }));
    expect(codes).toContain("weak_explanation");
  });

  it("rejects a question too short to be meaningful", () => {
    const codes = errorCodes(question({ text: "Hashing?" }));
    expect(codes).toContain("text_too_short");
  });

  it("requires exactly two options for true/false", () => {
    const codes = errorCodes(
      question({
        type: "TRUE_FALSE",
        options: [
          { text: "True", isCorrect: true },
          { text: "False", isCorrect: false },
          { text: "Maybe", isCorrect: false },
        ],
      }),
    );
    expect(codes).toContain("true_false_option_count");
  });

  it("requires a substantial reference answer for open-ended questions", () => {
    const codes = errorCodes(
      question({
        type: "SHORT_ANSWER",
        options: [],
        expectedAnswer: "Yes",
      }),
    );
    expect(codes).toContain("no_reference_answer");
  });

  it("rejects an exact duplicate of an existing question", () => {
    const codes = errorCodes(question(), [question().text]);
    expect(codes).toContain("exact_duplicate");
  });

  it("rejects a near-duplicate of an existing question", () => {
    // Same tokens, different wording — the hash differs, so only the
    // similarity check can catch this one.
    const codes = errorCodes(question(), [
      "Which data structure gives an O(1) average-case lookup by key?",
    ]);
    expect(codes).toContain("near_duplicate");
  });

  it("does not flag a genuinely different question on the same topic", () => {
    const codes = errorCodes(question(), [
      "What causes a hash collision and how is it resolved by chaining?",
    ]);
    expect(codes).not.toContain("near_duplicate");
    expect(codes).not.toContain("exact_duplicate");
  });

  it("produces a stable dedupe hash regardless of validity", () => {
    const good = validateQuestion(question(), []);
    const bad = validateQuestion(question({ explanation: "no" }), []);
    expect(good.dedupeHash).toBe(bad.dedupeHash);
  });

  it("lowers the score for warnings without failing the question", () => {
    const clean = validateQuestion(question(), []);
    const warned = validateQuestion(
      // Missing terminal punctuation is a warning, not an error.
      question({
        text: "Which data structure gives O(1) average-case lookup by key",
      }),
      [],
    );
    expect(warned.valid).toBe(true);
    expect(warned.score).toBeLessThan(clean.score);
  });
});

describe("validateBatch", () => {
  it("separates accepted from rejected", () => {
    const { accepted, rejected } = validateBatch(
      [question(), question({ explanation: "no" })],
      [],
    );
    expect(accepted).toHaveLength(1);
    expect(rejected).toHaveLength(1);
  });

  it("stops a batch from duplicating itself", () => {
    // The same question twice: the second must be caught against the first.
    const { accepted, rejected } = validateBatch([question(), question()], []);
    expect(accepted).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(
      rejected[0].quality.issues.some((issue) => issue.code === "exact_duplicate"),
    ).toBe(true);
  });

  it("checks the batch against the existing corpus too", () => {
    const { accepted } = validateBatch([question()], [question().text]);
    expect(accepted).toHaveLength(0);
  });

  it("handles an empty batch without throwing", () => {
    const result = validateBatch([], []);
    expect(result.accepted).toEqual([]);
    expect(result.rejected).toEqual([]);
  });
});
