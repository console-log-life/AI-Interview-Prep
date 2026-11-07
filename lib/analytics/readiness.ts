/**
 * Readiness V2 — pure functions, no I/O.
 *
 * V1 was a weighted average scaled by an activity count. It was honest but
 * blunt: it could not tell "80% from five recent hard interviews" apart from
 * "80% from five easy assessments six weeks ago".
 *
 * V2 separates three things that V1 conflated:
 *
 *   score       — how well you are performing
 *   evidence    — how much we actually know (breadth + volume + recency)
 *   penalties   — active repeated mistakes and stale practice
 *
 * The headline number is `score * evidenceFactor`, and `confidence` is
 * reported alongside it so a high score from thin evidence cannot masquerade
 * as readiness. This is the single most important honesty property of the
 * product.
 */

export type PillarKey = "interview" | "assessment" | "coding";

export type PillarInput = {
  /** Mean 0-100 across this pillar, or null when never attempted. */
  score: number | null;
  /** Number of completed activities. */
  count: number;
  /** Most recent activity, or null. */
  lastAt: Date | null;
};

export type ReadinessInput = {
  interview: PillarInput;
  assessment: PillarInput;
  coding: PillarInput;
  /** Distinct root skills with any evidence, out of the 12 headline skills. */
  skillsCovered: number;
  totalSkills: number;
  /** Mean confidence (0-1) across skills that have evidence. */
  meanSkillConfidence: number;
  /** Currently ACTIVE mistakes seen more than once. */
  repeatedMistakes: number;
  now?: Date;
};

export const PILLAR_WEIGHT: Record<PillarKey, number> = {
  interview: 0.45,
  assessment: 0.3,
  coding: 0.25,
};

/** Activities needed in a pillar before it is considered well-evidenced. */
const PILLAR_SATURATION: Record<PillarKey, number> = {
  interview: 4,
  assessment: 5,
  coding: 8,
};

/** Practice older than this starts to decay the evidence factor. */
const STALE_AFTER_DAYS = 21;
const FULLY_STALE_DAYS = 75;

export type ConfidenceLevel = "NONE" | "LOW" | "MEDIUM" | "HIGH";

export type ReadinessResult = {
  /** Headline 0-100. */
  readiness: number;
  /** Performance before the evidence discount — "how you did". */
  rawPerformance: number;
  /** 0-1 multiplier applied to rawPerformance. */
  evidenceFactor: number;
  confidence: ConfidenceLevel;
  /** 0-1 numeric behind `confidence`. */
  confidenceScore: number;
  /** Per-pillar contribution, for the UI breakdown. */
  pillars: Array<{
    key: PillarKey;
    score: number | null;
    count: number;
    weight: number;
    coverage: number;
    daysSince: number | null;
  }>;
  skillCoverage: number;
  /** Points deducted for active repeated mistakes. */
  mistakePenalty: number;
  /** 0-1 recency health. */
  recencyFactor: number;
  /** Plain-English reasons, shown verbatim in the UI. */
  explanations: string[];
};

export function computeReadiness(input: ReadinessInput): ReadinessResult {
  const now = input.now ?? new Date();
  const explanations: string[] = [];

  const pillarKeys: PillarKey[] = ["interview", "assessment", "coding"];
  const pillars = pillarKeys.map((key) => {
    const pillar = input[key];
    const coverage =
      pillar.count > 0
        ? Math.min(1, pillar.count / PILLAR_SATURATION[key])
        : 0;
    const daysSince = pillar.lastAt
      ? Math.floor((now.getTime() - pillar.lastAt.getTime()) / 86_400_000)
      : null;
    return {
      key,
      score: pillar.score,
      count: pillar.count,
      weight: PILLAR_WEIGHT[key],
      coverage,
      daysSince,
    };
  });

  // --- 1. Raw performance ------------------------------------------------
  // Only pillars with real data participate, renormalised over their weights,
  // so never having coded does not silently score you 0 on a third of the mark.
  const active = pillars.filter(
    (pillar) => pillar.score !== null && pillar.count > 0,
  );

  if (active.length === 0) {
    return {
      readiness: 0,
      rawPerformance: 0,
      evidenceFactor: 0,
      confidence: "NONE",
      confidenceScore: 0,
      pillars,
      skillCoverage: 0,
      mistakePenalty: 0,
      recencyFactor: 0,
      explanations: [
        "No scored activity yet — complete an interview, assessment or coding problem to establish a baseline.",
      ],
    };
  }

  const weightSum = active.reduce((sum, pillar) => sum + pillar.weight, 0);
  const rawPerformance =
    active.reduce((sum, pillar) => sum + (pillar.score ?? 0) * pillar.weight, 0) /
    weightSum;

  // --- 2. Evidence factor ------------------------------------------------
  // (a) How much practice, weighted by pillar importance.
  const volume =
    pillars.reduce((sum, pillar) => sum + pillar.coverage * pillar.weight, 0) /
    (PILLAR_WEIGHT.interview + PILLAR_WEIGHT.assessment + PILLAR_WEIGHT.coding);

  // (b) How much of the skill map has been touched.
  const skillCoverage =
    input.totalSkills > 0
      ? Math.min(1, input.skillsCovered / input.totalSkills)
      : 0;

  // (c) How recent the most recent activity is.
  const mostRecent = pillars
    .map((pillar) => pillar.daysSince)
    .filter((days): days is number => days !== null)
    .sort((a, b) => a - b)[0];

  const recencyFactor =
    mostRecent === undefined
      ? 0
      : mostRecent <= STALE_AFTER_DAYS
        ? 1
        : Math.max(
            0.55,
            1 -
              (mostRecent - STALE_AFTER_DAYS) /
                (FULLY_STALE_DAYS - STALE_AFTER_DAYS),
          );

  // Volume dominates; coverage and confidence refine it. The 0.15 floor stops
  // a genuinely strong first result from being crushed to near zero.
  const evidenceFactor = clamp01(
    0.15 +
      0.85 *
        (0.5 * volume +
          0.25 * skillCoverage +
          0.25 * clamp01(input.meanSkillConfidence)) *
        recencyFactor,
  );

  // --- 3. Repeated-mistake penalty ---------------------------------------
  // Capped at 8 points: unresolved patterns should sting, not dominate.
  const mistakePenalty = Math.min(8, input.repeatedMistakes * 2);

  const readiness = clamp(
    rawPerformance * evidenceFactor - mistakePenalty,
    0,
    100,
  );

  // --- 4. Confidence ------------------------------------------------------
  const confidenceScore = clamp01(
    0.45 * volume + 0.3 * skillCoverage + 0.25 * clamp01(input.meanSkillConfidence),
  );
  const confidence = toConfidenceLevel(confidenceScore);

  // --- 5. Explanations ----------------------------------------------------
  if (volume < 0.4) {
    explanations.push(
      "Your score is held back by limited practice volume — more sessions will raise both the score and its confidence.",
    );
  }
  if (skillCoverage < 0.5) {
    explanations.push(
      `You have evidence in ${input.skillsCovered} of ${input.totalSkills} core skill areas. Broadening coverage improves how much this number can be trusted.`,
    );
  }
  if (mostRecent !== undefined && mostRecent > STALE_AFTER_DAYS) {
    explanations.push(
      `Your most recent practice was ${mostRecent} days ago, so older results count for less.`,
    );
  }
  if (input.repeatedMistakes > 0) {
    explanations.push(
      `${input.repeatedMistakes} repeated mistake${input.repeatedMistakes === 1 ? "" : "s"} ${input.repeatedMistakes === 1 ? "is" : "are"} still unresolved, costing ${mistakePenalty} point${mistakePenalty === 1 ? "" : "s"}.`,
    );
  }
  const untouched = pillars.filter((pillar) => pillar.count === 0);
  if (untouched.length > 0) {
    explanations.push(
      `No ${untouched.map((pillar) => PILLAR_LABEL[pillar.key]).join(" or ")} activity recorded yet.`,
    );
  }
  if (explanations.length === 0) {
    explanations.push(
      "Broad, recent evidence across all three areas — this score is well supported.",
    );
  }

  return {
    readiness: Math.round(readiness),
    rawPerformance: Math.round(rawPerformance),
    evidenceFactor: round(evidenceFactor, 2),
    confidence,
    confidenceScore: round(confidenceScore, 2),
    pillars,
    skillCoverage: round(skillCoverage, 2),
    mistakePenalty,
    recencyFactor: round(recencyFactor, 2),
    explanations,
  };
}

export const PILLAR_LABEL: Record<PillarKey, string> = {
  interview: "interview",
  assessment: "assessment",
  coding: "coding",
};

export const CONFIDENCE_LEVEL_LABEL: Record<ConfidenceLevel, string> = {
  NONE: "No evidence",
  LOW: "Low evidence",
  MEDIUM: "Medium evidence",
  HIGH: "High evidence",
};

export function toConfidenceLevel(score: number): ConfidenceLevel {
  if (score <= 0.01) return "NONE";
  if (score < 0.35) return "LOW";
  if (score < 0.7) return "MEDIUM";
  return "HIGH";
}

/**
 * Readiness against a specific job description.
 *
 * Distinct from general readiness: the JD decides which skills count and how
 * much. Being excellent at DSA does not make you ready for a role that is 60%
 * system design.
 */
export type JobReadinessInput = {
  requirements: Array<{
    skillKey: string | null;
    label: string;
    /** true = required, false = preferred. */
    required: boolean;
  }>;
  /** Current skill scores keyed by skillKey. */
  skillScores: Map<string, { score: number; confidence: number }>;
};

export type JobReadinessResult = {
  overall: number;
  confidence: ConfidenceLevel;
  covered: Array<{ label: string; skillKey: string; score: number; required: boolean }>;
  gaps: Array<{ label: string; skillKey: string | null; score: number; required: boolean }>;
  /** Requirements we have no skill mapping or evidence for. */
  unknown: string[];
};

export function computeJobReadiness(
  input: JobReadinessInput,
): JobReadinessResult {
  const covered: JobReadinessResult["covered"] = [];
  const gaps: JobReadinessResult["gaps"] = [];
  const unknown: string[] = [];

  let weightedSum = 0;
  let weightTotal = 0;
  let confidenceSum = 0;
  let confidenceCount = 0;

  for (const requirement of input.requirements) {
    const weight = requirement.required ? 1 : 0.45;

    if (!requirement.skillKey) {
      unknown.push(requirement.label);
      // An unmappable requirement still counts as risk, at score 0.
      weightTotal += weight;
      continue;
    }

    const evidence = input.skillScores.get(requirement.skillKey);
    if (!evidence || evidence.confidence < 0.1) {
      gaps.push({
        label: requirement.label,
        skillKey: requirement.skillKey,
        score: evidence?.score ?? 0,
        required: requirement.required,
      });
      weightTotal += weight;
      continue;
    }

    weightedSum += evidence.score * weight;
    weightTotal += weight;
    confidenceSum += evidence.confidence;
    confidenceCount += 1;

    if (evidence.score >= 60) {
      covered.push({
        label: requirement.label,
        skillKey: requirement.skillKey,
        score: evidence.score,
        required: requirement.required,
      });
    } else {
      gaps.push({
        label: requirement.label,
        skillKey: requirement.skillKey,
        score: evidence.score,
        required: requirement.required,
      });
    }
  }

  const overall = weightTotal > 0 ? weightedSum / weightTotal : 0;
  const meanConfidence =
    confidenceCount > 0 ? confidenceSum / confidenceCount : 0;

  // Coverage matters as much as depth — half the requirements unmeasured
  // should not read as high confidence.
  const coverageRatio =
    input.requirements.length > 0
      ? confidenceCount / input.requirements.length
      : 0;

  return {
    overall: Math.round(clamp(overall, 0, 100)),
    confidence: toConfidenceLevel(meanConfidence * 0.6 + coverageRatio * 0.4),
    covered: covered.sort((a, b) => b.score - a.score),
    gaps: gaps.sort(
      (a, b) => Number(b.required) - Number(a.required) || a.score - b.score,
    ),
    unknown,
  };
}

// --- helpers ---------------------------------------------------------------

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

function round(value: number, digits = 1): number {
  const factor = Math.pow(10, digits);
  return Math.round(value * factor) / factor;
}
