import { describe, expect, it } from "vitest";

import {
  evidenceOfKind,
  parseStoredEvidence,
  resolveReportEvidence,
  type CitableTurn,
} from "@/lib/interviews/report-evidence";
import type { ReportEvidence } from "@/types/ai";

/**
 * Citations for the report's strengths and weaknesses.
 *
 * The model names the question number a point came from. That number is a
 * claim, not a fact, and this is the layer that checks it. The failure being
 * guarded against is not a crash — it is a quote attached to the wrong answer,
 * which is worse than showing no evidence at all, because it reads as proof.
 */

const TURNS: CitableTurn[] = [
  {
    question: "How did you decide on that index?",
    answer: "We read the query plan and saw a sequential scan on user_id.",
    topic: "PostgreSQL",
  },
  {
    question: "Tell me about a disagreement on your team.",
    answer: "I disagreed with our caching approach and we measured both.",
    topic: "Behavioural",
  },
  {
    question: "What would you change about that design?",
    answer: "I don't know.",
    topic: "System design",
  },
];

const strength = (questionIndex: number, point = "Explained their reasoning"): ReportEvidence => ({
  kind: "STRENGTH",
  point,
  questionIndex,
});

describe("resolveReportEvidence — valid citations", () => {
  it("attaches the real question and answer to the point", () => {
    const [entry] = resolveReportEvidence([strength(1)], TURNS);

    expect(entry.question).toBe(TURNS[0].question);
    expect(entry.answer).toBe(TURNS[0].answer);
    expect(entry.point).toBe("Explained their reasoning");
  });

  it("treats the index as 1-based, matching what the candidate is shown", () => {
    const [entry] = resolveReportEvidence([strength(2)], TURNS);
    expect(entry.question).toBe(TURNS[1].question);
    expect(entry.questionIndex).toBe(2);
  });

  it("carries the topic through", () => {
    expect(resolveReportEvidence([strength(1)], TURNS)[0].topic).toBe("PostgreSQL");
  });

  it("keeps the order the generator wrote", () => {
    const resolved = resolveReportEvidence(
      [strength(2, "second"), strength(1, "first")],
      TURNS,
    );
    expect(resolved.map((e) => e.point)).toEqual(["second", "first"]);
  });

  it("allows the same answer to support more than one point", () => {
    const resolved = resolveReportEvidence(
      [strength(1, "read the query plan"), strength(1, "measured before changing")],
      TURNS,
    );
    expect(resolved).toHaveLength(2);
  });

  it("resolves weaknesses the same way", () => {
    const [entry] = resolveReportEvidence(
      [{ kind: "WEAKNESS", point: "No trade-off discussion", questionIndex: 2 }],
      TURNS,
    );
    expect(entry.kind).toBe("WEAKNESS");
    expect(entry.answer).toBe(TURNS[1].answer);
  });
});

describe("resolveReportEvidence — a citation that cannot be trusted is dropped", () => {
  it("drops an index past the end of the interview", () => {
    // The model invented a question number. Guessing which answer it meant
    // would fabricate the evidence.
    expect(resolveReportEvidence([strength(9)], TURNS)).toEqual([]);
  });

  it("drops a zero or negative index", () => {
    expect(resolveReportEvidence([strength(0)], TURNS)).toEqual([]);
    expect(resolveReportEvidence([strength(-1)], TURNS)).toEqual([]);
  });

  it("drops a non-integer index rather than rounding it", () => {
    // Rounding 1.5 would silently pick an answer the model did not name.
    expect(resolveReportEvidence([strength(1.5)], TURNS)).toEqual([]);
    expect(resolveReportEvidence([strength(Number.NaN)], TURNS)).toEqual([]);
  });

  it("drops a point that is empty or only whitespace", () => {
    expect(resolveReportEvidence([strength(1, "")], TURNS)).toEqual([]);
    expect(resolveReportEvidence([strength(1, "   ")], TURNS)).toEqual([]);
  });

  it("drops a citation to a question the candidate did not answer", () => {
    const turns: CitableTurn[] = [{ question: "Q", answer: "", topic: "T" }];
    expect(resolveReportEvidence([strength(1)], turns)).toEqual([]);
  });

  it("drops a citation to a turn with no question text", () => {
    const turns: CitableTurn[] = [{ question: "   ", answer: "A real answer", topic: "T" }];
    expect(resolveReportEvidence([strength(1)], turns)).toEqual([]);
  });

  it("keeps the good citations alongside the bad ones", () => {
    const resolved = resolveReportEvidence(
      [strength(1, "good"), strength(99, "invented"), strength(2, "also good")],
      TURNS,
    );
    expect(resolved.map((e) => e.point)).toEqual(["good", "also good"]);
  });

  it("returns nothing when there were no turns at all", () => {
    // A zero-answer interview has nothing to cite, and must not borrow a
    // citation from anywhere.
    expect(resolveReportEvidence([strength(1)], [])).toEqual([]);
  });

  it("returns nothing when the generator cited nothing", () => {
    expect(resolveReportEvidence([], TURNS)).toEqual([]);
  });

  it("trims the point rather than storing the padding", () => {
    expect(resolveReportEvidence([strength(1, "  padded  ")], TURNS)[0].point).toBe(
      "padded",
    );
  });

  it("falls back to General for a missing topic", () => {
    const turns: CitableTurn[] = [{ question: "Q", answer: "A", topic: "" }];
    expect(resolveReportEvidence([strength(1)], turns)[0].topic).toBe("General");
  });
});

describe("evidenceOfKind", () => {
  it("separates strengths from weaknesses", () => {
    const resolved = resolveReportEvidence(
      [
        strength(1, "a strength"),
        { kind: "WEAKNESS", point: "a weakness", questionIndex: 2 },
      ],
      TURNS,
    );

    expect(evidenceOfKind(resolved, "STRENGTH").map((e) => e.point)).toEqual([
      "a strength",
    ]);
    expect(evidenceOfKind(resolved, "WEAKNESS").map((e) => e.point)).toEqual([
      "a weakness",
    ]);
  });

  it("returns an empty list when a kind has no citations", () => {
    expect(evidenceOfKind([], "STRENGTH")).toEqual([]);
  });
});

describe("parseStoredEvidence — reading the JSONB column back", () => {
  const STORED = {
    kind: "STRENGTH",
    point: "Explained their reasoning",
    questionIndex: 1,
    question: "How did you decide on that index?",
    answer: "We read the query plan.",
    topic: "PostgreSQL",
  };

  it("round-trips a well-formed row", () => {
    expect(parseStoredEvidence([STORED])).toEqual([STORED]);
  });

  it("returns an empty list for the column default", () => {
    // Every report written before citations existed takes this path.
    expect(parseStoredEvidence([])).toEqual([]);
  });

  it.each([
    ["null", null],
    ["undefined", undefined],
    ["an object", { kind: "STRENGTH" }],
    ["a string", "[]"],
    ["a number", 3],
  ])("returns an empty list for %s", (_label, value) => {
    expect(parseStoredEvidence(value)).toEqual([]);
  });

  it("drops a row with an unrecognised kind", () => {
    expect(parseStoredEvidence([{ ...STORED, kind: "MAYBE" }])).toEqual([]);
  });

  it("drops a row missing its quote, so nothing renders an empty blockquote", () => {
    expect(parseStoredEvidence([{ ...STORED, answer: "" }])).toEqual([]);
    expect(parseStoredEvidence([{ ...STORED, question: undefined }])).toEqual([]);
  });

  it("drops a row whose point is gone", () => {
    expect(parseStoredEvidence([{ ...STORED, point: "  " }])).toEqual([]);
  });

  it("keeps the good rows alongside the bad ones", () => {
    const rows = parseStoredEvidence([STORED, "garbage", null, { ...STORED, point: "two" }]);
    expect(rows.map((r) => r.point)).toEqual([STORED.point, "two"]);
  });

  it("defaults a non-integer stored index to 0 rather than emitting NaN", () => {
    const [row] = parseStoredEvidence([{ ...STORED, questionIndex: "first" }]);
    expect(row.questionIndex).toBe(0);
    expect(Number.isNaN(row.questionIndex)).toBe(false);
  });
});
