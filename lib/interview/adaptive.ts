/**
 * Adaptive interview engine — pure decision logic, no I/O.
 *
 * V1 had a single rule: "score 3-6 with missing points → ask a follow-up".
 * That worked but had no memory, could not change difficulty, and could not
 * tell a candidate who is coasting from one who is drowning.
 *
 * V2 models the interview as a state machine. Each graded answer updates the
 * state, and the state decides the next move. Everything here is a pure
 * function of (state, evaluation), which makes the whole adaptive behaviour
 * unit-testable without an API key.
 *
 * The hard constraint: a follow-up must never spawn an endless follow-up
 * chain. `MAX_FOLLOW_UP_DEPTH` is enforced in `decideNextAction`, and there is
 * a test that drives twenty consecutive weak answers to prove it terminates.
 */

export type Difficulty = "EASY" | "MEDIUM" | "HARD";

export type InterviewStateSnapshot = {
  currentDifficulty: Difficulty;
  /** Consecutive follow-ups on the current thread. */
  followUpDepth: number;
  turnCount: number;
  coveredTopics: string[];
  masteredTopics: string[];
  strugglingTopics: string[];
  /** Rolling 0-100 estimate of ability this session. */
  skillEstimate: number;
  /** 0-1. */
  confidence: number;
  streakStrong: number;
  streakWeak: number;
  /** Resume claims / JD requirements not yet probed. */
  pendingProbes: string[];
};

export type AnswerSignal = {
  /** 0-10 from the evaluator. */
  score: number;
  missingPoints: string[];
  topic: string;
  /** Whether the question just answered was itself a follow-up. */
  wasFollowUp: boolean;
  /**
   * The exact probe string the answered question was generated from, when it
   * was a claim probe. Passing it lets the engine retire that probe precisely
   * instead of guessing from the topic.
   */
  probedClaim?: string | null;
};

export const MAX_FOLLOW_UP_DEPTH = 2;

/** Score bands, on the evaluator's 0-10 scale. */
export const STRONG_THRESHOLD = 8;
export const WEAK_THRESHOLD = 4;
/** Below this an answer is effectively empty — probing it teaches nothing. */
export const EMPTY_THRESHOLD = 2;

/** Consecutive strong/weak answers before difficulty moves. */
const DIFFICULTY_STREAK = 2;

export const INITIAL_STATE: InterviewStateSnapshot = {
  currentDifficulty: "MEDIUM",
  followUpDepth: 0,
  turnCount: 0,
  coveredTopics: [],
  masteredTopics: [],
  strugglingTopics: [],
  skillEstimate: 50,
  confidence: 0,
  streakStrong: 0,
  streakWeak: 0,
  pendingProbes: [],
};

export function createInitialState(
  overrides: Partial<InterviewStateSnapshot> = {},
): InterviewStateSnapshot {
  return { ...INITIAL_STATE, ...overrides };
}

/**
 * Folds a graded answer into the state.
 *
 * `skillEstimate` uses an exponential moving average so the estimate responds
 * to recent answers without a single bad one erasing the whole session.
 */
export function applyAnswer(
  state: InterviewStateSnapshot,
  signal: AnswerSignal,
): InterviewStateSnapshot {
  const answerScore = clamp(signal.score * 10, 0, 100);

  // Early answers move the estimate more; later ones refine it.
  const alpha = state.turnCount === 0 ? 0.6 : 0.35;
  const skillEstimate = round(
    state.skillEstimate * (1 - alpha) + answerScore * alpha,
  );

  const isStrong = signal.score >= STRONG_THRESHOLD;
  const isWeak = signal.score < WEAK_THRESHOLD;

  const streakStrong = isStrong ? state.streakStrong + 1 : 0;
  const streakWeak = isWeak ? state.streakWeak + 1 : 0;

  const coveredTopics = addUnique(state.coveredTopics, signal.topic);

  // A topic is "mastered" only on a strong answer, and stops being "struggling".
  const masteredTopics = isStrong
    ? addUnique(state.masteredTopics, signal.topic)
    : state.masteredTopics;
  const strugglingTopics = isWeak
    ? addUnique(state.strugglingTopics, signal.topic)
    : isStrong
      ? state.strugglingTopics.filter((topic) => topic !== signal.topic)
      : state.strugglingTopics;

  const turnCount = state.turnCount + 1;

  return {
    ...state,
    turnCount,
    skillEstimate,
    // Confidence grows with turns, saturating around six answers.
    confidence: round(Math.min(1, turnCount / 6), 2),
    streakStrong,
    streakWeak,
    coveredTopics,
    masteredTopics,
    strugglingTopics,
    currentDifficulty: nextDifficulty(state.currentDifficulty, {
      streakStrong,
      streakWeak,
    }),
    // Depth increments only while we stay on a follow-up thread.
    followUpDepth: signal.wasFollowUp ? state.followUpDepth : 0,
    pendingProbes: retireProbes(state.pendingProbes, signal),
  };
}

/**
 * Drops probes the interview has now covered.
 *
 * An exact match on the probe that produced the question is authoritative. The
 * topic-substring rule is a secondary sweep for probes covered incidentally —
 * it only fires on topics of three characters or more, because a one- or
 * two-letter topic would match almost everything and silently empty the queue.
 */
function retireProbes(
  probes: string[],
  signal: AnswerSignal,
): string[] {
  const topic = signal.topic.trim().toLowerCase();
  const probed = signal.probedClaim ?? null;

  return probes.filter((probe) => {
    if (probed && probe === probed) return false;
    if (topic.length >= 3 && probe.toLowerCase().includes(topic)) return false;
    return true;
  });
}

/**
 * Difficulty ladder.
 *
 * Requires a *streak*, not a single answer, so one lucky or unlucky response
 * cannot swing the whole interview.
 */
export function nextDifficulty(
  current: Difficulty,
  streaks: { streakStrong: number; streakWeak: number },
): Difficulty {
  const order: Difficulty[] = ["EASY", "MEDIUM", "HARD"];
  const index = order.indexOf(current);

  if (streaks.streakStrong >= DIFFICULTY_STREAK && index < order.length - 1) {
    return order[index + 1];
  }
  if (streaks.streakWeak >= DIFFICULTY_STREAK && index > 0) {
    return order[index - 1];
  }
  return current;
}

export type NextAction =
  | { type: "FOLLOW_UP"; reason: string; topic: string }
  | { type: "PROBE_FUNDAMENTALS"; reason: string; topic: string }
  | { type: "NEW_TOPIC"; reason: string; avoidTopics: string[] }
  | { type: "DEEPEN"; reason: string; topic: string }
  | { type: "PROBE_CLAIM"; reason: string; claim: string }
  | { type: "FINISH"; reason: string };

/**
 * Chooses what the interviewer does next.
 *
 * Order matters — the guards are arranged so the terminating conditions are
 * checked before anything that could extend the interview.
 */
export function decideNextAction(args: {
  state: InterviewStateSnapshot;
  lastSignal: AnswerSignal | null;
  plannedQuestions: number;
  questionsAsked: number;
}): NextAction {
  const { state, lastSignal, plannedQuestions, questionsAsked } = args;

  // 1. Hard stop — the interview is over.
  if (questionsAsked >= plannedQuestions) {
    return { type: "FINISH", reason: "Planned question count reached." };
  }

  // 2. Opening question.
  if (!lastSignal) {
    return {
      type: "NEW_TOPIC",
      reason: "Opening question.",
      avoidTopics: [],
    };
  }

  const { score, missingPoints, topic } = lastSignal;

  // 3. Follow-up depth ceiling. Checked BEFORE any follow-up branch, so no
  //    path can produce an unbounded chain.
  const canFollowUp = state.followUpDepth < MAX_FOLLOW_UP_DEPTH;

  // 4. An essentially empty answer: drilling deeper teaches nothing. If the
  //    topic is already known to be weak, leave it entirely.
  if (score <= EMPTY_THRESHOLD) {
    if (state.currentDifficulty !== "EASY" && canFollowUp) {
      return {
        type: "PROBE_FUNDAMENTALS",
        reason:
          "The answer was essentially empty — check whether the fundamentals are there before moving on.",
        topic,
      };
    }
    return {
      type: "NEW_TOPIC",
      reason: "No signal on this topic; move on rather than labour it.",
      avoidTopics: state.coveredTopics,
    };
  }

  // 5. Partially correct with an identified gap — the highest-value follow-up.
  if (score < STRONG_THRESHOLD && missingPoints.length > 0 && canFollowUp) {
    return {
      type: "FOLLOW_UP",
      reason: `Answer scored ${score}/10 with ${missingPoints.length} identified gap(s); probe the specific gap.`,
      topic,
    };
  }

  // 6. Mastery demonstrated — go deeper on the same area while it is hot.
  if (
    score >= STRONG_THRESHOLD &&
    state.streakStrong >= DIFFICULTY_STREAK &&
    state.currentDifficulty === "HARD" &&
    canFollowUp
  ) {
    return {
      type: "DEEPEN",
      reason: "Consistently strong at the top difficulty; push into depth.",
      topic,
    };
  }

  // 7. An unprobed resume claim / JD requirement is waiting.
  if (state.pendingProbes.length > 0) {
    return {
      type: "PROBE_CLAIM",
      reason: "There is an unverified claim from the resume or job description.",
      claim: state.pendingProbes[0],
    };
  }

  // 8. Default — new ground, avoiding what is already covered.
  return {
    type: "NEW_TOPIC",
    reason:
      score >= STRONG_THRESHOLD
        ? "Strong answer; move to a new area and keep the bar high."
        : "Gap already probed or depth limit reached; change topic.",
    avoidTopics: state.coveredTopics,
  };
}

/** True when the chosen action produces a follow-up-style question. */
export function isFollowUpAction(action: NextAction): boolean {
  return (
    action.type === "FOLLOW_UP" ||
    action.type === "PROBE_FUNDAMENTALS" ||
    action.type === "DEEPEN"
  );
}

/** Applies the depth counter for the action about to be taken. */
export function advanceDepth(
  state: InterviewStateSnapshot,
  action: NextAction,
): InterviewStateSnapshot {
  return {
    ...state,
    followUpDepth: isFollowUpAction(action) ? state.followUpDepth + 1 : 0,
  };
}

/**
 * Human-readable instruction appended to the question prompt.
 * Keeping this beside the decision logic means the model's brief and the
 * engine's intent can never drift apart.
 */
export function actionInstruction(action: NextAction): string {
  switch (action.type) {
    case "FOLLOW_UP":
      return `The candidate's last answer was partially correct but left a specific gap. Ask ONE follow-up that targets exactly that gap on "${action.topic}". Do not open a new topic.`;
    case "PROBE_FUNDAMENTALS":
      return `The candidate could not answer on "${action.topic}". Ask ONE much simpler, foundational question on the same topic to find out whether the basics are there.`;
    case "DEEPEN":
      return `The candidate is performing strongly on "${action.topic}". Ask ONE harder question that goes deeper into trade-offs, edge cases or scale on this topic.`;
    case "PROBE_CLAIM":
      return `Ask ONE question grounded in this specific claim from the candidate's own resume or target job: "${action.claim}". Ask about how they actually did it, not about the technology in the abstract.`;
    case "NEW_TOPIC":
      return action.avoidTopics.length
        ? `Move to a NEW topic. Do not revisit: ${action.avoidTopics.join(", ")}.`
        : `Ask the opening question for this round.`;
    case "FINISH":
      return "";
  }
}

// --- helpers ---------------------------------------------------------------

function addUnique(list: string[], value: string): string[] {
  if (!value) return list;
  return list.includes(value) ? list : [...list, value];
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function round(value: number, digits = 1): number {
  const factor = Math.pow(10, digits);
  return Math.round(value * factor) / factor;
}
