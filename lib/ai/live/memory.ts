import type { AnswerIntent, AnswerUnderstanding } from "@/lib/ai/live/understanding";

/**
 * What the interviewer remembers across turns.
 *
 * The orchestrator already tracks the *plan* — topics, coverage, difficulty.
 * What it could not do was remember what the candidate had actually said three
 * questions ago, which is the difference between an interviewer and a
 * questionnaire. "You mentioned Redis earlier — how did you handle
 * invalidation?" requires a ledger of claims; so does noticing that someone
 * said they had never used Redis and later described running it in production.
 *
 * Two hard rules, both enforced by construction:
 *
 * 1. **Nothing is remembered that was not said.** Every entry carries the
 *    candidate's own words, and callers quote from that rather than from a
 *    summary. There is no path here that can invent a prior statement.
 * 2. **A contradiction is a question, never an accusation.** The output is a
 *    request for clarification with both quotes attached, because the usual
 *    explanation is imprecise speech, not dishonesty.
 */

export type Stance =
  /** Claimed hands-on experience. */
  | "USED"
  /** Explicitly denied experience. */
  | "NOT_USED"
  /** Named it without claiming either way. */
  | "MENTIONED";

export type CandidateStatement = {
  /** 1-based answer number this came from. */
  turn: number;
  atMs: number;
  /** Lowercased technology or subject. */
  subject: string;
  stance: Stance;
  /** The candidate's own words. Never a paraphrase. */
  quote: string;
};

export type InterviewMemory = {
  statements: CandidateStatement[];
  /** Subjects already used as the hook for a callback question. */
  recalled: string[];
};

export const EMPTY_MEMORY: InterviewMemory = { statements: [], recalled: [] };

/** Negations that turn a mention into a denial, within a short window. */
const NEGATIONS = [
  "never used",
  "never worked with",
  "never touched",
  "not used",
  "not worked with",
  "haven't used",
  "havent used",
  "have not used",
  "hadn't used",
  "hadnt used",
  "no experience with",
  "not familiar with",
  "don't know",
  "dont know",
];

/** Verbs that make a mention a claim of hands-on work. */
const USAGE = [
  "used",
  "using",
  "built",
  "building",
  "implemented",
  "implementing",
  "deployed",
  "ran",
  "wrote",
  "designed",
  "worked with",
  "set up",
  "configured",
  "migrated",
];

/**
 * How much text around a mention is examined for stance.
 *
 * Wide enough to catch "I have never actually used Redis in anger", narrow
 * enough that a negation about something else two sentences away does not
 * attach itself to the wrong subject.
 */
const STANCE_WINDOW = 60;

/**
 * Records what a finalized answer said about each technology it named.
 *
 * Technologies come from the understanding layer, which recognises them from a
 * fixed lexicon — so this can only ever remember subjects the candidate
 * actually uttered.
 */
export function rememberAnswer(
  memory: InterviewMemory,
  answer: {
    text: string;
    turn: number;
    atMs: number;
    understanding: Pick<AnswerUnderstanding, "technologyMentioned">;
  },
): InterviewMemory {
  const haystack = ` ${answer.text.toLowerCase()} `;
  const additions: CandidateStatement[] = [];

  for (const subject of answer.understanding.technologyMentioned) {
    const index = haystack.indexOf(subject.toLowerCase());
    if (index === -1) continue;

    const window = haystack.slice(
      Math.max(0, index - STANCE_WINDOW),
      index + subject.length + STANCE_WINDOW,
    );

    // Denial wins over usage: "I built things but never used Redis" is a
    // denial about Redis, and treating it as usage would produce a false
    // contradiction later.
    const stance: Stance = NEGATIONS.some((phrase) => window.includes(phrase))
      ? "NOT_USED"
      : USAGE.some((verb) => window.includes(verb))
        ? "USED"
        : "MENTIONED";

    additions.push({
      turn: answer.turn,
      atMs: answer.atMs,
      subject: subject.toLowerCase(),
      stance,
      quote: sentenceAround(answer.text, subject),
    });
  }

  return { ...memory, statements: [...memory.statements, ...additions] };
}

export type Contradiction = {
  subject: string;
  earlier: CandidateStatement;
  later: CandidateStatement;
};

/**
 * Finds a subject the candidate first denied and later claimed, or vice versa.
 *
 * Only USED vs NOT_USED counts. A bare mention is not evidence of anything, and
 * treating it as one would flag ordinary conversation as inconsistency.
 */
export function findContradiction(memory: InterviewMemory): Contradiction | null {
  const bySubject = new Map<string, CandidateStatement[]>();
  for (const statement of memory.statements) {
    if (statement.stance === "MENTIONED") continue;
    const list = bySubject.get(statement.subject) ?? [];
    list.push(statement);
    bySubject.set(statement.subject, list);
  }

  for (const [subject, statements] of bySubject) {
    const used = statements.find((s) => s.stance === "USED");
    const notUsed = statements.find((s) => s.stance === "NOT_USED");
    if (!used || !notUsed) continue;
    // Different turns only — one sentence can legitimately contain both
    // ("I hadn't used Redis before, so I used it here for the first time").
    if (used.turn === notUsed.turn) continue;

    const [earlier, later] =
      used.turn < notUsed.turn ? [used, notUsed] : [notUsed, used];
    return { subject, earlier, later };
  }
  return null;
}

/**
 * Builds a neutral clarification instruction for a contradiction.
 *
 * Phrased as an interviewer noticing something that does not fit, which is what
 * a professional does. It quotes both statements so the model cannot invent
 * what was said.
 */
export function clarificationFor(contradiction: Contradiction): string {
  return [
    `The candidate has said two things about ${contradiction.subject} that do not fit together.`,
    `Earlier: "${contradiction.earlier.quote}"`,
    `Later: "${contradiction.later.quote}"`,
    "Ask them to clarify, neutrally. The usual explanation is imprecise wording, so treat it as something you may have misheard rather than something they got wrong. Do not accuse them of anything, do not characterise the two statements as a conflict, and do not move on until they have answered.",
  ].join("\n");
}

/**
 * Picks something the candidate raised earlier that is worth returning to.
 *
 * Prefers claimed experience over a bare mention — "you said you used Kafka"
 * is a stronger hook than "you mentioned Kafka" — and never returns a subject
 * already used as a callback, so the interviewer does not circle the same
 * detail twice.
 */
export function recallSubject(
  memory: InterviewMemory,
  options: { currentTurn: number; minTurnsAgo?: number } = { currentTurn: 0 },
): CandidateStatement | null {
  const minTurnsAgo = options.minTurnsAgo ?? 1;
  const candidates = memory.statements.filter(
    (statement) =>
      statement.stance === "USED" &&
      !memory.recalled.includes(statement.subject) &&
      options.currentTurn - statement.turn >= minTurnsAgo,
  );
  return candidates.length > 0 ? candidates[candidates.length - 1] : null;
}

export function markRecalled(
  memory: InterviewMemory,
  subject: string,
): InterviewMemory {
  return memory.recalled.includes(subject)
    ? memory
    : { ...memory, recalled: [...memory.recalled, subject] };
}

/** A callback instruction, quoting the candidate's own words. */
export function callbackFor(statement: CandidateStatement): string {
  return `The candidate mentioned ${statement.subject} earlier: "${statement.quote}". Return to it now and ask one specific question about how they actually used it. Reference that they raised it, so it is clear you were listening.`;
}

// ---------------------------------------------------------------------------
// Evidence
// ---------------------------------------------------------------------------

/**
 * One graded exchange, preserved for the final report.
 *
 * The report must be able to say *why* it reached a conclusion, and quote the
 * exchange that supports it. Without this the feedback layer has only scores,
 * and a score with no evidence behind it is indistinguishable from an opinion.
 */
export type EvidenceRecord = {
  turn: number;
  atMs: number;
  questionText: string;
  answerText: string;
  topicLabel: string | null;
  /** What the controller decided to do about this answer. */
  intent: AnswerIntent;
  wordCount: number;
  /** Observed positives — only what the understanding layer actually found. */
  strengths: string[];
  /** Observed gaps. */
  gaps: string[];
};

const STRENGTH_SIGNALS: Array<[keyof AnswerUnderstanding, string]> = [
  ["reasoningPresent", "explained their reasoning"],
  ["concreteExamplePresent", "gave a concrete example"],
  ["tradeoffMentioned", "acknowledged a trade-off"],
  ["scaleMentioned", "considered scale"],
  ["performanceMentioned", "referred to measured performance"],
  ["directlyAnswered", "answered the question directly"],
];

const GAP_SIGNALS: Array<[keyof AnswerUnderstanding, string]> = [
  ["incompleteAnswer", "answer was too brief to show reasoning"],
  ["unsupportedClaim", "claimed an outcome without evidence"],
  ["uncertainty", "expressed uncertainty"],
  ["contradiction", "said two things that did not fit together"],
  ["needsClarification", "did not understand the question"],
];

/**
 * Turns one exchange into an evidence record.
 *
 * Every entry traces to a boolean the understanding layer set from the text.
 * Nothing is inferred here, and there is deliberately no score — correctness
 * is `UNKNOWN` by design, and a number would imply the system had established
 * something it has not.
 */
export function recordEvidence(args: {
  turn: number;
  atMs: number;
  questionText: string;
  answerText: string;
  topicLabel: string | null;
  intent: AnswerIntent;
  understanding: AnswerUnderstanding;
}): EvidenceRecord {
  const strengths = STRENGTH_SIGNALS.filter(
    ([key]) => args.understanding[key] === true,
  ).map(([, label]) => label);

  const gaps = GAP_SIGNALS.filter(([key]) => args.understanding[key] === true).map(
    ([, label]) => label,
  );

  return {
    turn: args.turn,
    atMs: args.atMs,
    questionText: args.questionText,
    answerText: args.answerText,
    topicLabel: args.topicLabel,
    intent: args.intent,
    wordCount: args.understanding.wordCount,
    strengths,
    gaps,
  };
}

// ---------------------------------------------------------------------------

/** The sentence containing a subject, for quoting back. */
function sentenceAround(text: string, subject: string): string {
  const sentences = text.split(/(?<=[.!?])\s+/);
  const match = sentences.find((sentence) =>
    sentence.toLowerCase().includes(subject.toLowerCase()),
  );
  const chosen = (match ?? text).trim();
  const words = chosen.split(/\s+/);
  return words.length <= 24 ? chosen : `${words.slice(0, 24).join(" ")}…`;
}
