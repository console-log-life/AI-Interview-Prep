/**
 * Assessment scoring.
 *
 * Deliberately pure: no Prisma, no I/O, no dates from `Date.now()` passed in
 * implicitly. That makes the rules directly unit-testable (see
 * `tests/unit/scoring.test.ts`) and keeps the grading logic in one readable
 * place rather than spread across a route handler.
 */

export type ScorableQuestion = {
  id: string;
  type:
    | "MCQ"
    | "MULTI_SELECT"
    | "TRUE_FALSE"
    | "SHORT_ANSWER"
    | "CODING"
    | "BEHAVIORAL"
    | "TECHNICAL";
  points: number;
  topic: string;
  difficulty: "EASY" | "MEDIUM" | "HARD";
  correctOptionIds: string[];
};

export type SubmittedAnswer = {
  questionId: string;
  selectedOptions: string[];
  textAnswer?: string | null;
};

export type GradedAnswer = {
  questionId: string;
  isCorrect: boolean | null;
  pointsAwarded: number;
  answered: boolean;
};

export type TopicBreakdown = {
  topic: string;
  correct: number;
  total: number;
  percentage: number;
};

export type DifficultyBreakdown = {
  difficulty: "EASY" | "MEDIUM" | "HARD";
  correct: number;
  total: number;
  percentage: number;
};

export type ScoreResult = {
  score: number;
  maxScore: number;
  percentage: number;
  correctCount: number;
  incorrectCount: number;
  unansweredCount: number;
  passed: boolean;
  graded: GradedAnswer[];
  byTopic: TopicBreakdown[];
  byDifficulty: DifficultyBreakdown[];
};

/** Set equality, order-independent — used for MULTI_SELECT grading. */
function sameSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const setB = new Set(b);
  return a.every((value) => setB.has(value));
}

function isAutoGradable(type: ScorableQuestion["type"]): boolean {
  return type === "MCQ" || type === "MULTI_SELECT" || type === "TRUE_FALSE";
}

/**
 * Grades one answer.
 *
 * Objective types are all-or-nothing: partial credit on a multi-select would
 * reward guessing every option. Open-ended types are not auto-graded — they
 * return `isCorrect: null` and contribute 0 to the score, and the UI shows the
 * reference answer for self-review instead of a fake mark.
 */
export function gradeAnswer(
  question: ScorableQuestion,
  answer: SubmittedAnswer | undefined,
): GradedAnswer {
  const selected = answer?.selectedOptions ?? [];
  const text = answer?.textAnswer?.trim() ?? "";

  if (!isAutoGradable(question.type)) {
    const answered = text.length > 0;
    return {
      questionId: question.id,
      isCorrect: null,
      pointsAwarded: 0,
      answered,
    };
  }

  if (selected.length === 0) {
    return {
      questionId: question.id,
      isCorrect: false,
      pointsAwarded: 0,
      answered: false,
    };
  }

  const correct =
    question.type === "MULTI_SELECT"
      ? sameSet(selected, question.correctOptionIds)
      : selected.length === 1 && question.correctOptionIds.includes(selected[0]);

  return {
    questionId: question.id,
    isCorrect: correct,
    pointsAwarded: correct ? question.points : 0,
    answered: true,
  };
}

export function scoreAttempt(
  questions: ScorableQuestion[],
  answers: SubmittedAnswer[],
  passPercentage = 60,
): ScoreResult {
  const answerMap = new Map(answers.map((a) => [a.questionId, a]));

  const graded = questions.map((question) =>
    gradeAnswer(question, answerMap.get(question.id)),
  );

  // Only auto-gradable questions count towards the score, so an assessment
  // that mixes MCQs with short-answer questions still reports an honest
  // percentage rather than one dragged down by ungraded items.
  const gradableQuestions = questions.filter((q) => isAutoGradable(q.type));
  const gradableIds = new Set(gradableQuestions.map((q) => q.id));

  const maxScore = gradableQuestions.reduce((sum, q) => sum + q.points, 0);
  const score = graded
    .filter((g) => gradableIds.has(g.questionId))
    .reduce((sum, g) => sum + g.pointsAwarded, 0);

  let correctCount = 0;
  let incorrectCount = 0;
  let unansweredCount = 0;

  for (const item of graded) {
    if (!item.answered) {
      unansweredCount += 1;
    } else if (item.isCorrect === true) {
      correctCount += 1;
    } else if (item.isCorrect === false) {
      incorrectCount += 1;
    }
    // isCorrect === null && answered → open-ended, counted in neither bucket.
  }

  const percentage = maxScore > 0 ? (score / maxScore) * 100 : 0;

  return {
    score,
    maxScore,
    percentage: Math.round(percentage * 100) / 100,
    correctCount,
    incorrectCount,
    unansweredCount,
    passed: maxScore > 0 && percentage >= passPercentage,
    graded,
    byTopic: buildTopicBreakdown(gradableQuestions, graded),
    byDifficulty: buildDifficultyBreakdown(gradableQuestions, graded),
  };
}

export function buildTopicBreakdown(
  questions: ScorableQuestion[],
  graded: GradedAnswer[],
): TopicBreakdown[] {
  const gradedMap = new Map(graded.map((g) => [g.questionId, g]));
  const buckets = new Map<string, { correct: number; total: number }>();

  for (const question of questions) {
    const bucket = buckets.get(question.topic) ?? { correct: 0, total: 0 };
    bucket.total += 1;
    if (gradedMap.get(question.id)?.isCorrect === true) bucket.correct += 1;
    buckets.set(question.topic, bucket);
  }

  return [...buckets.entries()]
    .map(([topic, { correct, total }]) => ({
      topic,
      correct,
      total,
      percentage: total > 0 ? Math.round((correct / total) * 100) : 0,
    }))
    .sort((a, b) => a.percentage - b.percentage);
}

export function buildDifficultyBreakdown(
  questions: ScorableQuestion[],
  graded: GradedAnswer[],
): DifficultyBreakdown[] {
  const gradedMap = new Map(graded.map((g) => [g.questionId, g]));
  const order: Array<ScorableQuestion["difficulty"]> = ["EASY", "MEDIUM", "HARD"];
  const buckets = new Map<string, { correct: number; total: number }>();

  for (const question of questions) {
    const bucket = buckets.get(question.difficulty) ?? { correct: 0, total: 0 };
    bucket.total += 1;
    if (gradedMap.get(question.id)?.isCorrect === true) bucket.correct += 1;
    buckets.set(question.difficulty, bucket);
  }

  return order
    .filter((difficulty) => buckets.has(difficulty))
    .map((difficulty) => {
      const bucket = buckets.get(difficulty)!;
      return {
        difficulty,
        correct: bucket.correct,
        total: bucket.total,
        percentage:
          bucket.total > 0 ? Math.round((bucket.correct / bucket.total) * 100) : 0,
      };
    });
}

/**
 * Server-side expiry check.
 *
 * The countdown in the browser is presentation only — a user can pause JS,
 * edit React state or replay the request. `expiresAt` on the attempt row is
 * the only authority, and every submit re-checks it here.
 */
export function isAttemptExpired(expiresAt: Date, now: Date = new Date()): boolean {
  // Small grace window so a submit fired at 00:00 by an honest client is not
  // rejected because of network latency.
  const GRACE_MS = 5_000;
  return now.getTime() > expiresAt.getTime() + GRACE_MS;
}

export function secondsRemaining(expiresAt: Date, now: Date = new Date()): number {
  return Math.max(0, Math.floor((expiresAt.getTime() - now.getTime()) / 1000));
}
