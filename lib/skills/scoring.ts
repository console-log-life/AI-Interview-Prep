/**
 * Skill scoring — pure functions, no I/O.
 *
 * The whole intelligence layer rests on this file, so it is deliberately
 * free of Prisma and dates-from-now: every function takes its inputs
 * explicitly and is directly unit-testable.
 *
 * Two ideas do the work:
 *
 *  1. **Recency weighting.** An answer from three months ago says less about
 *     you today than one from this week. Observations decay exponentially with
 *     a configurable half-life.
 *
 *  2. **Confidence separate from score.** A single lucky answer produces a
 *     high score with *low confidence*. Reporting them separately is what
 *     stops "one perfect interview = 90% ready", which is the single most
 *     dishonest thing a prep tool can do.
 */

export type Difficulty = "EASY" | "MEDIUM" | "HARD";

export type Observation = {
  /** Normalised 0-100. */
  score: number;
  /** Relative importance of the source event. */
  weight: number;
  difficulty: Difficulty;
  observedAt: Date;
};

/** Harder questions are stronger evidence of real ability. */
export const DIFFICULTY_WEIGHT: Record<Difficulty, number> = {
  EASY: 0.8,
  MEDIUM: 1.0,
  HARD: 1.3,
};

/** An interview answer is richer evidence than one multiple-choice tick. */
export const SOURCE_WEIGHT = {
  INTERVIEW: 1.4,
  CODING: 1.2,
  ASSESSMENT: 1.0,
  RESUME: 0.5,
} as const;

export type EvidenceSource = keyof typeof SOURCE_WEIGHT;

/** Days after which an observation counts for half as much. */
export const HALF_LIFE_DAYS = 30;

/** Effective observations needed before confidence is considered full. */
export const FULL_CONFIDENCE_WEIGHT = 8;

export function recencyFactor(
  observedAt: Date,
  now: Date = new Date(),
  halfLifeDays: number = HALF_LIFE_DAYS,
): number {
  const ageDays = Math.max(
    0,
    (now.getTime() - observedAt.getTime()) / 86_400_000,
  );
  return Math.pow(0.5, ageDays / halfLifeDays);
}

export type SkillScore = {
  /** Recency-weighted mean, 0-100. */
  score: number;
  /** 0-1 — how much evidence stands behind the score. */
  confidence: number;
  /** Score delta: recent half vs older half. Positive = improving. */
  trend: number;
  observations: number;
  lastPracticedAt: Date | null;
};

export const EMPTY_SKILL_SCORE: SkillScore = {
  score: 0,
  confidence: 0,
  trend: 0,
  observations: 0,
  lastPracticedAt: null,
};

/**
 * Folds an observation list into a single skill score.
 *
 * Confidence saturates rather than growing without bound, so the 40th
 * observation does not claim more certainty than the 12th.
 */
export function computeSkillScore(
  observations: Observation[],
  now: Date = new Date(),
): SkillScore {
  if (observations.length === 0) return { ...EMPTY_SKILL_SCORE };

  let weightedSum = 0;
  let weightTotal = 0;
  let effectiveWeight = 0;
  let latest = observations[0].observedAt;

  for (const observation of observations) {
    const recency = recencyFactor(observation.observedAt, now);
    const weight =
      observation.weight * DIFFICULTY_WEIGHT[observation.difficulty] * recency;

    weightedSum += observation.score * weight;
    weightTotal += weight;
    effectiveWeight += recency * observation.weight;

    if (observation.observedAt > latest) latest = observation.observedAt;
  }

  const score = weightTotal > 0 ? weightedSum / weightTotal : 0;

  return {
    score: round(clamp(score)),
    confidence: round(
      Math.min(1, effectiveWeight / FULL_CONFIDENCE_WEIGHT),
      2,
    ),
    trend: computeTrend(observations),
    observations: observations.length,
    lastPracticedAt: latest,
  };
}

/**
 * Improvement signal: mean of the newer half minus mean of the older half.
 *
 * Needs at least four observations — below that, a "trend" would be noise
 * dressed up as insight.
 */
export function computeTrend(observations: Observation[]): number {
  if (observations.length < 4) return 0;

  const sorted = [...observations].sort(
    (a, b) => a.observedAt.getTime() - b.observedAt.getTime(),
  );
  const midpoint = Math.floor(sorted.length / 2);
  const older = sorted.slice(0, midpoint);
  const newer = sorted.slice(midpoint);

  const mean = (list: Observation[]) =>
    list.reduce((sum, item) => sum + item.score, 0) / list.length;

  return round(mean(newer) - mean(older));
}

export type ConfidenceBand = "none" | "low" | "medium" | "high";

export function confidenceBand(confidence: number): ConfidenceBand {
  if (confidence <= 0) return "none";
  if (confidence < 0.35) return "low";
  if (confidence < 0.7) return "medium";
  return "high";
}

export const CONFIDENCE_LABEL: Record<ConfidenceBand, string> = {
  none: "No data",
  low: "Low confidence",
  medium: "Medium confidence",
  high: "High confidence",
};

/**
 * Turns an interview sub-score (0-10) into a 0-100 skill observation.
 * Kept here so the 10 → 100 conversion lives in exactly one place.
 */
export function interviewScoreToSkillScore(score: number): number {
  return clamp(score * 10);
}

/**
 * The recommended next action for a skill, derived from score + confidence.
 *
 * Low confidence never yields "you are strong here" — it yields "we need more
 * evidence", which is the honest reading.
 */
export type SkillAction =
  | "GATHER_EVIDENCE"
  | "BUILD_FUNDAMENTALS"
  | "PRACTISE"
  | "DEEPEN"
  | "MAINTAIN";

export function recommendedAction(
  score: number,
  confidence: number,
): SkillAction {
  if (confidence < 0.2) return "GATHER_EVIDENCE";
  if (score < 40) return "BUILD_FUNDAMENTALS";
  if (score < 65) return "PRACTISE";
  if (score < 82) return "DEEPEN";
  return "MAINTAIN";
}

export const SKILL_ACTION_LABEL: Record<SkillAction, string> = {
  GATHER_EVIDENCE: "Practise to establish a baseline",
  BUILD_FUNDAMENTALS: "Review the fundamentals",
  PRACTISE: "Drill this topic",
  DEEPEN: "Push into harder problems",
  MAINTAIN: "Keep it warm with occasional review",
};

// --- helpers ---------------------------------------------------------------

function clamp(value: number, min = 0, max = 100): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function round(value: number, digits = 1): number {
  const factor = Math.pow(10, digits);
  return Math.round(value * factor) / factor;
}
