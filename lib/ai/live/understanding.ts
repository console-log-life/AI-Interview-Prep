/**
 * Answer understanding — pure text analysis, no AI call.
 *
 * The honesty boundary matters more here than anywhere else in the feature.
 * These are *observable properties of a transcript*: did they give a reason,
 * did they name a number, did they say they don't know. They are NOT a
 * judgement of whether the answer was correct.
 *
 * `correctness` is therefore always "UNKNOWN" from this module. Nothing in a
 * transcript establishes whether "we sharded by user id" was the right call,
 * and a fluent wrong answer containing "because" would otherwise be scored as
 * strong. Correctness is left to the model that heard the answer in context and
 * to the existing post-interview evaluation engine.
 */

export type Correctness = "UNKNOWN";

/**
 * Rich signals about one finalized candidate turn.
 *
 * Each flag exists because it changes what a real interviewer would do next —
 * they are decision inputs, not a report card.
 */
export type AnswerUnderstanding = {
  /** Did they say anything with content in it? */
  answeredQuestion: boolean;
  /**
   * Did they address the question, as opposed to talking about something else?
   * Measured by lexical overlap with the question, so it is a weak signal and
   * treated as such.
   */
  directlyAnswered: boolean;
  /** They explained *why*, not only *what*. */
  reasoningPresent: boolean;
  /** A named example, a number, or a specific system. */
  concreteExamplePresent: boolean;
  /** Hedging or explicit "I don't know". */
  uncertainty: boolean;
  /** They contradicted themselves inside the same turn. */
  contradiction: boolean;
  /** A claim with no support: "it was faster", "it scaled well". */
  unsupportedClaim: boolean;
  technologyMentioned: string[];
  projectMentioned: boolean;
  tradeoffMentioned: boolean;
  scaleMentioned: boolean;
  performanceMentioned: boolean;
  /** They asked the interviewer something. */
  candidateAskedQuestion: boolean;
  /** They did not understand the question. */
  needsClarification: boolean;
  /** They asked for the question again. */
  repeatRequest: boolean;
  /** They trailed off, or the turn is too thin to stand as an answer. */
  incompleteAnswer: boolean;
  /** Always UNKNOWN — see the module comment. */
  correctness: Correctness;
  wordCount: number;
};

const TECH_LEXICON = [
  "postgresql", "postgres", "mysql", "mongodb", "redis", "sqlite", "dynamodb",
  "cassandra", "elasticsearch", "kafka", "rabbitmq", "sqs", "s3",
  "react", "angular", "vue", "svelte", "next.js", "nextjs", "node.js", "nodejs",
  "express", "django", "flask", "spring", "rails", "laravel", ".net",
  "typescript", "javascript", "python", "java", "golang", "rust",
  "docker", "kubernetes", "aws", "azure", "gcp", "terraform", "jenkins",
  "graphql", "grpc", "websocket", "oauth", "jwt", "rest",
  "git", "linux", "nginx", "prisma", "hibernate", "kotlin", "swift",
];

const REASONING = [
  "because", "since", "so that", "in order to", "the reason", "that way",
  "otherwise", "which means", "which meant", "due to", "as a result",
];

const TRADEOFF = [
  "trade-off", "tradeoff", "downside", "the cost", "at the cost",
  "in exchange", "compared to", "instead of", "the drawback", "we gave up",
  "the catch", "on the other hand",
];

const SCALE = [
  "scale", "scaling", "scalable", "throughput", "load", "traffic",
  "concurrent", "requests per second", "rps", "qps", "horizontally",
  "vertically", "shard", "partition", "replica",
];

const PERFORMANCE = [
  "performance", "latency", "faster", "slower", "speed", "optimis", "optimiz",
  "p95", "p99", "response time", "throughput", "bottleneck", "cache hit",
];

const UNCERTAINTY = [
  "i don't know", "i dont know", "not sure", "no idea", "never used",
  "never worked with", "can't remember", "cant remember", "i forget",
  "not familiar", "haven't done", "havent done", "i guess", "maybe",
  "i think maybe", "possibly", "i'm not certain", "im not certain",
];

/** Claims that assert an outcome without any supporting detail. */
const VAGUE_CLAIMS = [
  "it was faster", "it was better", "it worked well", "it was reliable",
  "it was scalable", "it improved performance", "it was efficient",
  "it was good", "it was fine", "it was easy", "it was more secure",
  "it handled it well", "it was robust",
];

const PROJECT = [
  "my project", "our project", "i built", "we built", "i made", "we made",
  "i developed", "we developed", "i created", "we created", "at my internship",
  "in my final year", "for my college", "at work", "in production",
];

const CLARIFICATION = [
  "i don't understand", "i dont understand", "what do you mean",
  "not sure what you", "can you explain what", "could you explain what",
  "do you mean", "in what sense", "clarify",
];

const REPEAT = [
  /\brepeat (that|the question|it)\b/i,
  /\b(can|could) you (please )?repeat\b/i,
  /\bsay (that|it) again\b/i,
  /\bcome again\b/i,
  /\bi (didn'?t|did not|couldn'?t|could not) (quite )?(hear|catch|get) (you|that|the question)\b/i,
  /\b(can|could) you (please )?rephrase\b/i,
  /\brephrase (that|the question)\b/i,
  /\bwhat was the question\b/i,
  /\bsorry,? what\b/i,
  /\bpardon\b/i,
  /\bone more time\b/i,
];

/** Above this, an utterance is an answer whatever phrases it contains. */
export const SHORT_UTTERANCE_WORDS = 12;
/** Below this, a turn is too thin to treat as an answer on its own. */
export const MIN_ANSWER_WORDS = 8;

/** Pairs that contradict each other inside one turn. */
const CONTRADICTION_PAIRS: Array<[RegExp, RegExp]> = [
  [/\bi (have )?never (used|worked with)\b/i, /\bi (used|built|implemented) (it|that)\b/i],
  [/\bit was (fast|quick)\b/i, /\bit was (slow|too slow)\b/i],
  [/\bwe did ?n[o']?t\b/i, /\bwe did\b.*\bthat\b/i],
];

export function understandAnswer(
  text: string,
  question?: string,
): AnswerUnderstanding {
  const trimmed = text.trim();
  const lower = trimmed.toLowerCase();
  const words = trimmed.split(/\s+/).filter(Boolean);
  const wordCount = words.length;

  const has = (list: string[]) => list.some((phrase) => lower.includes(phrase));

  const repeatRequest =
    wordCount <= SHORT_UTTERANCE_WORDS && REPEAT.some((r) => r.test(trimmed));

  const technologyMentioned = TECH_LEXICON.filter((tech) =>
    new RegExp(`\\b${escapeRegex(tech)}\\b`, "i").test(lower),
  );

  const concreteExamplePresent =
    /\b\d+([.,]\d+)?\s*(ms|s|%|k|m|gb|mb|kb|rps|qps|users|rows|requests|times|x)\b/i.test(lower) ||
    /\bfor example\b|\bfor instance\b|\bspecifically\b|\bin our case\b/i.test(lower);

  return {
    answeredQuestion: wordCount > 0 && !repeatRequest,
    directlyAnswered: overlapsQuestion(lower, question),
    reasoningPresent: has(REASONING),
    concreteExamplePresent,
    uncertainty: has(UNCERTAINTY),
    contradiction: CONTRADICTION_PAIRS.some(
      ([a, b]) => a.test(trimmed) && b.test(trimmed),
    ),
    // A vague outcome claim with nothing behind it is the single most useful
    // thing for an interviewer to notice — it is exactly where to push.
    unsupportedClaim: has(VAGUE_CLAIMS) && !has(REASONING) && !concreteExamplePresent,
    technologyMentioned,
    projectMentioned: has(PROJECT),
    tradeoffMentioned: has(TRADEOFF),
    scaleMentioned: has(SCALE),
    performanceMentioned: has(PERFORMANCE),
    candidateAskedQuestion: /\?\s*$/.test(trimmed) && !repeatRequest,
    needsClarification: has(CLARIFICATION),
    repeatRequest,
    incompleteAnswer:
      wordCount > 0 && wordCount < MIN_ANSWER_WORDS && !repeatRequest,
    correctness: "UNKNOWN",
    wordCount,
  };
}

/**
 * Weak check on whether the answer engaged with the question.
 *
 * Lexical overlap only, and treated as advisory: a correct answer can share
 * almost no vocabulary with the question. Used to notice obvious drift, never
 * to mark an answer wrong.
 */
function overlapsQuestion(lowerAnswer: string, question?: string): boolean {
  if (!question) return true;
  const keywords = question
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 4 && !STOPWORDS.has(word));

  if (keywords.length === 0) return true;
  return keywords.some((word) => lowerAnswer.includes(word));
}

const STOPWORDS = new Set([
  "would", "could", "should", "about", "there", "their", "which", "where",
  "these", "those", "being", "doing", "because", "through", "between",
  "explain", "describe", "tell",
]);

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * The interviewer's next intent, derived from the signals.
 *
 * Ordered by what a real interviewer would prioritise, and deliberately more
 * varied than "strong → probe deeper". A strong answer that already covered
 * trade-offs does not need another trade-off question; one that quoted a number
 * without saying why does.
 */
export const ANSWER_INTENTS = [
  "REPEAT_QUESTION",
  "CLARIFY_QUESTION",
  "ANSWER_CANDIDATE_QUESTION",
  "PRESS_INCOMPLETE",
  "CHALLENGE_UNSUPPORTED_CLAIM",
  "RESOLVE_CONTRADICTION",
  "ASK_FOR_REASONING",
  "ASK_FOR_EXAMPLE",
  "ASK_FOR_TRADEOFF",
  "ASK_ABOUT_SCALE",
  "PROBE_MENTIONED_TECHNOLOGY",
  "PROBE_PERSONAL_CONTRIBUTION",
  "SIMPLIFY",
  "SUFFICIENT",
] as const;

/**
 * Derived from the list above rather than written twice, so a new intent
 * cannot be added to the type while the runtime validator in
 * `parseEvidence` keeps rejecting it.
 */
export type AnswerIntent = (typeof ANSWER_INTENTS)[number];

export function deriveIntent(u: AnswerUnderstanding): AnswerIntent {
  // Conversational repairs come first — the candidate is not answering yet.
  if (u.repeatRequest) return "REPEAT_QUESTION";
  if (u.needsClarification) return "CLARIFY_QUESTION";
  if (u.candidateAskedQuestion) return "ANSWER_CANDIDATE_QUESTION";

  if (u.contradiction) return "RESOLVE_CONTRADICTION";

  /**
   * An explicit "I don't know" outranks brevity.
   *
   * Checked before the incompleteness rule because "I'm not sure" is short
   * *and* an admission, and pressing someone for more detail when they have
   * just told you they do not know it is the wrong move — it reads as not
   * having listened. Narrow the question instead.
   */
  if (u.uncertainty && !u.reasoningPresent) return "SIMPLIFY";

  if (u.incompleteAnswer) return "PRESS_INCOMPLETE";

  if (u.unsupportedClaim) return "CHALLENGE_UNSUPPORTED_CLAIM";
  if (!u.reasoningPresent) return "ASK_FOR_REASONING";

  // They reasoned but stayed abstract.
  if (!u.concreteExamplePresent) return "ASK_FOR_EXAMPLE";

  // They reasoned about a project without saying what *they* did.
  if (u.projectMentioned && !u.performanceMentioned && !u.tradeoffMentioned) {
    return "PROBE_PERSONAL_CONTRIBUTION";
  }

  // Reasoned, concrete, but never weighed the alternative.
  if (!u.tradeoffMentioned) return "ASK_FOR_TRADEOFF";

  // Weighed trade-offs but never considered growth.
  if (!u.scaleMentioned) return "ASK_ABOUT_SCALE";

  // Everything covered; the only thread left is something they raised.
  if (u.technologyMentioned.length > 0) return "PROBE_MENTIONED_TECHNOLOGY";

  return "SUFFICIENT";
}
