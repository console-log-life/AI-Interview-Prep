/**
 * Communication aggregation — pure functions, no I/O.
 *
 * The rule that shapes everything here: **STAR only counts where STAR was
 * expected.** Scoring a candidate's "Result" coverage on a question about hash
 * collisions would be meaningless, so behavioural and technical answers are
 * aggregated separately and the UI is told which is which.
 */

export type CommunicationRow = {
  clarity: number;
  structure: number;
  conciseness: number;
  technicalExplanation: number;
  starSituation: boolean;
  starTask: boolean;
  starAction: boolean;
  starResult: boolean;
  isBehavioural: boolean;
};

export type CommunicationDimension =
  | "clarity"
  | "structure"
  | "conciseness"
  | "technicalExplanation";

export const DIMENSION_LABEL: Record<CommunicationDimension, string> = {
  clarity: "Clarity",
  structure: "Structure",
  conciseness: "Conciseness",
  technicalExplanation: "Technical explanation",
};

export const STAR_PARTS = ["situation", "task", "action", "result"] as const;
export type StarPart = (typeof STAR_PARTS)[number];

export const STAR_LABEL: Record<StarPart, string> = {
  situation: "Situation",
  task: "Task",
  action: "Action",
  result: "Result",
};

export type CommunicationSummary = {
  analysed: number;
  /** Mean 0-10 per dimension, null when nothing has been analysed. */
  means: Record<CommunicationDimension, number | null>;
  /** The lowest-scoring dimension — what to work on. Null without data. */
  weakest: CommunicationDimension | null;
  /** Behavioural answers analysed. STAR stats are null when this is 0. */
  behaviouralCount: number;
  /** Fraction 0-1 of behavioural answers covering each STAR part. */
  starCoverage: Record<StarPart, number> | null;
  /** STAR parts missing from more than half the behavioural answers. */
  starGaps: StarPart[];
};

const DIMENSIONS: CommunicationDimension[] = [
  "clarity",
  "structure",
  "conciseness",
  "technicalExplanation",
];

/** Below this share of answers, a missing STAR part is treated as a gap. */
const STAR_GAP_THRESHOLD = 0.5;

export function summarizeCommunication(
  rows: CommunicationRow[],
): CommunicationSummary {
  if (rows.length === 0) {
    return {
      analysed: 0,
      means: {
        clarity: null,
        structure: null,
        conciseness: null,
        technicalExplanation: null,
      },
      weakest: null,
      behaviouralCount: 0,
      starCoverage: null,
      starGaps: [],
    };
  }

  const means = {} as Record<CommunicationDimension, number | null>;
  for (const dimension of DIMENSIONS) {
    const total = rows.reduce((sum, row) => sum + row[dimension], 0);
    means[dimension] = round(total / rows.length);
  }

  // Ties resolve to the earlier dimension, which keeps the output stable.
  const weakest = DIMENSIONS.reduce((lowest, dimension) =>
    (means[dimension] ?? 0) < (means[lowest] ?? 0) ? dimension : lowest,
  );

  const behavioural = rows.filter((row) => row.isBehavioural);

  if (behavioural.length === 0) {
    return {
      analysed: rows.length,
      means,
      weakest,
      behaviouralCount: 0,
      starCoverage: null,
      starGaps: [],
    };
  }

  const starCoverage: Record<StarPart, number> = {
    situation: share(behavioural, (row) => row.starSituation),
    task: share(behavioural, (row) => row.starTask),
    action: share(behavioural, (row) => row.starAction),
    result: share(behavioural, (row) => row.starResult),
  };

  const starGaps = STAR_PARTS.filter(
    (part) => starCoverage[part] < STAR_GAP_THRESHOLD,
  );

  return {
    analysed: rows.length,
    means,
    weakest,
    behaviouralCount: behavioural.length,
    starCoverage,
    starGaps,
  };
}

/**
 * Whether STAR structure should be expected for this answer.
 *
 * Driven by the round type first, then the topic — a behavioural question can
 * appear inside a MIXED round and still deserves STAR coaching.
 */
export function expectsStarStructure(args: {
  interviewType: string;
  topic: string | null;
}): boolean {
  if (args.interviewType === "BEHAVIORAL" || args.interviewType === "HR") {
    return true;
  }
  const topic = (args.topic ?? "").toLowerCase();
  return /behaviou?r|teamwork|conflict|leadership|communication|ownership|failure|strength|weakness|motivation/.test(
    topic,
  );
}

function share<T>(rows: T[], predicate: (row: T) => boolean): number {
  return round(rows.filter(predicate).length / rows.length, 2);
}

function round(value: number, digits = 1): number {
  const factor = Math.pow(10, digits);
  return Math.round(value * factor) / factor;
}
