import { describe, expect, it, vi } from "vitest";

/**
 * Reading evidence back out of the database.
 *
 * `InterviewDelivery.evidence` is a JSONB column, so Postgres guarantees it is
 * valid JSON and nothing more — not that it is an array, not that the entries
 * have the shape the report renders. A row written by an older client, or a
 * buggy one, must therefore degrade to "no evidence" rather than crash the
 * report page or render a half-populated record that reads as a finding.
 *
 * Prisma is mocked because `parseEvidence` is a pure function living in a
 * module that also talks to the database; the import must not construct a
 * client.
 */

vi.mock("@/lib/db/prisma", () => ({
  prisma: { interview: {}, interviewDelivery: {} },
}));

const { parseEvidence } = await import("@/lib/interviews/delivery-service");

/** One well-formed record, as the live client posts it. */
const VALID = {
  turn: 3,
  atMs: 184_000,
  questionText: "How did you decide on that index?",
  answerText: "We looked at the query plan and saw a sequential scan on user_id.",
  topicLabel: "PostgreSQL",
  intent: "ASK_FOR_REASONING",
  wordCount: 13,
  strengths: ["explained their reasoning"],
  gaps: ["claimed an outcome without evidence"],
};

describe("parseEvidence — valid input", () => {
  it("round-trips a well-formed record unchanged", () => {
    expect(parseEvidence([VALID])).toEqual([VALID]);
  });

  it("preserves the question and answer verbatim", () => {
    const [record] = parseEvidence([VALID]);
    expect(record.questionText).toBe(VALID.questionText);
    expect(record.answerText).toBe(VALID.answerText);
  });

  it("keeps multiple records in the stored order", () => {
    const rows = parseEvidence([
      { ...VALID, turn: 1 },
      { ...VALID, turn: 2 },
      { ...VALID, turn: 3 },
    ]);
    expect(rows.map((r) => r.turn)).toEqual([1, 2, 3]);
  });

  it("accepts a record with no observations, leaving the UI to filter it", () => {
    const rows = parseEvidence([{ ...VALID, strengths: [], gaps: [] }]);
    expect(rows).toHaveLength(1);
    expect(rows[0].strengths).toEqual([]);
    expect(rows[0].gaps).toEqual([]);
  });
});

describe("parseEvidence — non-array input", () => {
  it.each([
    ["null", null],
    ["undefined", undefined],
    ["an object", { turn: 1 }],
    ["a string", "[]"],
    ["a number", 7],
    ["a boolean", true],
  ])("returns an empty array for %s", (_label, value) => {
    expect(parseEvidence(value)).toEqual([]);
  });
});

describe("parseEvidence — malformed entries", () => {
  it("drops an entry that is not an object", () => {
    expect(parseEvidence(["nope", 42, null, undefined, []])).toEqual([]);
  });

  it("drops an entry with no questionText", () => {
    const { questionText: _omitted, ...rest } = VALID;
    expect(parseEvidence([rest])).toEqual([]);
  });

  it("drops an entry with no answerText", () => {
    const { answerText: _omitted, ...rest } = VALID;
    expect(parseEvidence([rest])).toEqual([]);
  });

  it("drops an entry whose question or answer is the wrong type", () => {
    expect(parseEvidence([{ ...VALID, questionText: 12 }])).toEqual([]);
    expect(parseEvidence([{ ...VALID, answerText: { text: "hi" } }])).toEqual([]);
  });

  it("keeps the good entries alongside the bad ones", () => {
    const rows = parseEvidence([VALID, "garbage", { ...VALID, turn: 9 }, null]);
    expect(rows.map((r) => r.turn)).toEqual([3, 9]);
  });

  it("defaults missing numbers to zero rather than emitting NaN", () => {
    const [record] = parseEvidence([
      { questionText: "Q", answerText: "A", strengths: [], gaps: [] },
    ]);
    expect(record.turn).toBe(0);
    expect(record.atMs).toBe(0);
    expect(record.wordCount).toBe(0);
    expect(Number.isNaN(record.turn)).toBe(false);
  });

  it("coerces a non-string topicLabel to null", () => {
    expect(parseEvidence([{ ...VALID, topicLabel: 5 }])[0].topicLabel).toBeNull();
    expect(parseEvidence([{ ...VALID, topicLabel: undefined }])[0].topicLabel).toBeNull();
  });

  it("falls back to SUFFICIENT for an unrecognised intent", () => {
    expect(parseEvidence([{ ...VALID, intent: "NOT_A_REAL_INTENT" }])[0].intent).toBe(
      "SUFFICIENT",
    );
    expect(parseEvidence([{ ...VALID, intent: 99 }])[0].intent).toBe("SUFFICIENT");
    expect(parseEvidence([{ ...VALID, intent: undefined }])[0].intent).toBe("SUFFICIENT");
  });

  it("keeps a recognised intent", () => {
    expect(parseEvidence([{ ...VALID, intent: "PRESS_INCOMPLETE" }])[0].intent).toBe(
      "PRESS_INCOMPLETE",
    );
  });

  it("filters non-string observations out of strengths and gaps", () => {
    const [record] = parseEvidence([
      { ...VALID, strengths: ["real", 1, null, { a: 1 }], gaps: [false, "also real"] },
    ]);
    expect(record.strengths).toEqual(["real"]);
    expect(record.gaps).toEqual(["also real"]);
  });

  it("defaults non-array strengths and gaps to empty arrays", () => {
    const [record] = parseEvidence([
      { ...VALID, strengths: "explained their reasoning", gaps: null },
    ]);
    expect(record.strengths).toEqual([]);
    expect(record.gaps).toEqual([]);
  });
});

describe("parseEvidence — the empty case a text interview produces", () => {
  it("returns an empty array for the column default", () => {
    expect(parseEvidence([])).toEqual([]);
  });
});
