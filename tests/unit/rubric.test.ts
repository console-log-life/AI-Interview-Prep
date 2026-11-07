import { describe, expect, it } from "vitest";

import {
  RUBRIC_DIMENSIONS,
  parseRubricNotes,
  rubricBand,
  rubricRows,
  type RubricScores,
} from "@/lib/interviews/rubric";

/**
 * The per-answer rubric.
 *
 * Six dimensions were scored and stored on every answer from the start and
 * none of them ever reached the candidate. The two things that must hold now
 * that they do: a dimension the evaluator did not assess is **omitted**, never
 * drawn as 0/10 — that would invent a failing mark — and a justification read
 * back out of JSONB can never be trusted to have the right shape.
 */

const FULL: RubricScores = {
  correctness: 8,
  relevance: 9,
  clarity: 6,
  technicalDepth: 7,
  completeness: 5,
  structure: 4,
};

describe("rubricRows — which dimensions are shown", () => {
  it("returns every dimension that has a score, in rubric order", () => {
    expect(rubricRows(FULL).map((r) => r.key)).toEqual(
      RUBRIC_DIMENSIONS.map((d) => d.key),
    );
  });

  it("omits a dimension the evaluator left null", () => {
    // A behavioural round scores no correctness. Rendering 0/10 would read as
    // the candidate getting it wrong.
    const rows = rubricRows({ ...FULL, correctness: null, technicalDepth: null });
    expect(rows.map((r) => r.key)).not.toContain("correctness");
    expect(rows.map((r) => r.key)).not.toContain("technicalDepth");
    expect(rows).toHaveLength(4);
  });

  it("omits a dimension that is absent entirely", () => {
    expect(rubricRows({ clarity: 7 }).map((r) => r.key)).toEqual(["clarity"]);
  });

  it("returns nothing when no dimension was scored", () => {
    expect(rubricRows({})).toEqual([]);
  });

  it("keeps a legitimate zero, which is not the same as unassessed", () => {
    // An empty or off-topic answer really does score 0 for relevance.
    const rows = rubricRows({ relevance: 0 });
    expect(rows).toHaveLength(1);
    expect(rows[0].score).toBe(0);
  });

  it("drops a non-finite score rather than rendering NaN", () => {
    expect(rubricRows({ clarity: Number.NaN })).toEqual([]);
    expect(rubricRows({ clarity: Number.POSITIVE_INFINITY })).toEqual([]);
  });

  it("clamps a score outside 0-10", () => {
    expect(rubricRows({ clarity: 44 })[0].score).toBe(10);
    expect(rubricRows({ clarity: -5 })[0].score).toBe(0);
  });

  it("rounds a fractional score", () => {
    expect(rubricRows({ clarity: 6.6 })[0].score).toBe(7);
  });

  it("carries a human label and hint for every row", () => {
    for (const row of rubricRows(FULL)) {
      expect(row.label.length).toBeGreaterThan(0);
      expect(row.hint.length).toBeGreaterThan(0);
    }
  });
});

describe("rubricRows — justifications", () => {
  it("attaches the note for its own dimension", () => {
    const rows = rubricRows(FULL, {
      clarity: "Jumped between two ideas without finishing either.",
    });
    const clarity = rows.find((r) => r.key === "clarity");
    expect(clarity?.note).toBe("Jumped between two ideas without finishing either.");
  });

  it("leaves other dimensions unexplained rather than reusing a note", () => {
    const rows = rubricRows(FULL, { clarity: "only clarity" });
    expect(rows.find((r) => r.key === "relevance")?.note).toBeNull();
  });

  it("reports a null note when there are no justifications at all", () => {
    // Every evaluation written before justifications existed takes this path.
    for (const row of rubricRows(FULL)) expect(row.note).toBeNull();
  });

  it("does not invent a note for an omitted dimension", () => {
    const rows = rubricRows({ ...FULL, structure: null }, { structure: "orphan note" });
    expect(rows.map((r) => r.key)).not.toContain("structure");
  });
});

describe("rubricBand", () => {
  it("bands strong, mixed and weak", () => {
    expect(rubricBand(10)).toBe("strong");
    expect(rubricBand(7)).toBe("strong");
    expect(rubricBand(6)).toBe("mixed");
    expect(rubricBand(4)).toBe("mixed");
    expect(rubricBand(3)).toBe("weak");
    expect(rubricBand(0)).toBe("weak");
  });
});

describe("parseRubricNotes — reading the JSONB column back", () => {
  it("keeps recognised dimensions", () => {
    expect(parseRubricNotes({ clarity: "clear", relevance: "on topic" })).toEqual({
      clarity: "clear",
      relevance: "on topic",
    });
  });

  it("returns an empty object for the column default", () => {
    expect(parseRubricNotes({})).toEqual({});
  });

  it.each([
    ["null", null],
    ["undefined", undefined],
    ["an array", [{ clarity: "x" }]],
    ["a string", '{"clarity":"x"}'],
    ["a number", 5],
  ])("returns an empty object for %s", (_label, value) => {
    expect(parseRubricNotes(value)).toEqual({});
  });

  it("drops an unknown key, so a renamed dimension cannot leak through", () => {
    expect(parseRubricNotes({ clarity: "kept", vibes: "dropped" })).toEqual({
      clarity: "kept",
    });
  });

  it("drops a non-string note", () => {
    expect(parseRubricNotes({ clarity: 7, relevance: null, structure: {} })).toEqual({});
  });

  it("drops a note that is only whitespace", () => {
    expect(parseRubricNotes({ clarity: "   " })).toEqual({});
  });

  it("trims a stored note", () => {
    expect(parseRubricNotes({ clarity: "  padded  " })).toEqual({ clarity: "padded" });
  });
});
