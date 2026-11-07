/**
 * The per-answer rubric, and the justification behind each number.
 *
 * Six dimensions were already being scored and stored on every answer, and
 * none of them ever reached the candidate — the report showed one overall
 * score out of ten and a paragraph of feedback. So the most specific thing the
 * system knew about an answer was also the most hidden.
 *
 * Showing the numbers alone would be worse than hiding them: "Clarity 4/10" on
 * its own is a verdict with no way to act on it or disagree with it. Each
 * dimension therefore carries a short written justification from the same
 * evaluation call that produced the score, and a dimension with no score is
 * omitted entirely rather than rendered as a zero.
 */

export const RUBRIC_DIMENSIONS = [
  {
    key: "correctness",
    label: "Correctness",
    hint: "Was what they said actually right?",
  },
  {
    key: "relevance",
    label: "Relevance",
    hint: "Did it answer the question that was asked?",
  },
  {
    key: "clarity",
    label: "Clarity",
    hint: "Could a listener follow it the first time?",
  },
  {
    key: "technicalDepth",
    label: "Depth",
    hint: "Did they go past the surface?",
  },
  {
    key: "completeness",
    label: "Completeness",
    hint: "Did they cover what a strong answer would?",
  },
  {
    key: "structure",
    label: "Structure",
    hint: "Was the answer organised, e.g. situation then action then result?",
  },
] as const;

export type RubricKey = (typeof RUBRIC_DIMENSIONS)[number]["key"];

/** One short justification per dimension. Any key may be absent. */
export type RubricNotes = Partial<Record<RubricKey, string>>;

/** Scores as they come off an `InterviewEvaluation` row. */
export type RubricScores = Partial<Record<RubricKey, number | null>>;

export type RubricRow = {
  key: RubricKey;
  label: string;
  hint: string;
  score: number;
  /** Null when the evaluator scored the dimension but did not justify it. */
  note: string | null;
};

const VALID_KEYS = new Set<string>(RUBRIC_DIMENSIONS.map((d) => d.key));

/**
 * Reads justifications back out of the JSONB column.
 *
 * Defensive for the same reason every other JSONB read here is: Postgres
 * guarantees valid JSON and nothing about its shape, and a row written before
 * this existed has `{}`. Unknown keys are dropped rather than passed through,
 * so a future rename cannot leak an unlabelled row into the report.
 */
export function parseRubricNotes(value: unknown): RubricNotes {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};

  const notes: RubricNotes = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!VALID_KEYS.has(key)) continue;
    if (typeof raw !== "string") continue;
    const text = raw.trim();
    if (text) notes[key as RubricKey] = text;
  }
  return notes;
}

/**
 * Builds the rows the report renders.
 *
 * A dimension is included only when it has a real score. `structure` is not
 * meaningful for a factual recall question and `technicalDepth` is not
 * meaningful for an HR one, and the evaluator is allowed to leave either null —
 * rendering those as "0/10" would invent a failing mark for something that was
 * never assessed.
 */
export function rubricRows(
  scores: RubricScores,
  notes: RubricNotes = {},
): RubricRow[] {
  return RUBRIC_DIMENSIONS.flatMap((dimension) => {
    const score = scores[dimension.key];
    if (typeof score !== "number" || !Number.isFinite(score)) return [];

    return [
      {
        key: dimension.key,
        label: dimension.label,
        hint: dimension.hint,
        score: clampScore(score),
        note: notes[dimension.key] ?? null,
      },
    ];
  });
}

/**
 * A band for colouring, deliberately coarse.
 *
 * Three bands rather than a gradient: the underlying numbers come from a
 * language model, and a palette implying it can tell 6 from 7 would overstate
 * how precise the score is.
 */
export function rubricBand(score: number): "strong" | "mixed" | "weak" {
  if (score >= 7) return "strong";
  if (score >= 4) return "mixed";
  return "weak";
}

function clampScore(score: number): number {
  return Math.max(0, Math.min(10, Math.round(score)));
}
