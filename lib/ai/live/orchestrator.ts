import type { Difficulty, InterviewType } from "@prisma/client";

import { followUpBudgetFor } from "@/lib/ai/live/config";
import type {
  AnswerSignal,
  ControllerLogEntry,
  AnswerStrength,
  InterviewPhase,
  InterviewPlanInput,
  OrchestratorEvent,
  OrchestratorState,
  PlannedTopic,
  SteeringDirective,
  TopicCoverage,
  UtteranceKind,
} from "@/lib/ai/live/orchestrator-types";

/**
 * Interview orchestrator — pure, deterministic, no I/O.
 *
 * Gemini Live is a fluent conversationalist but an unreliable interviewer: left
 * alone it drifts between topics, re-asks what it already covered, praises
 * everything, and never decides the interview is over. This module supplies the
 * structure it lacks — phase, coverage, follow-up obligation, difficulty and
 * closing — and hands the model short context blocks at meaningful boundaries.
 *
 * The division of labour matters: the orchestrator decides *what should happen
 * next*; the model decides *how to say it*. Prescribing exact sentences is what
 * makes an AI interviewer sound robotic, so directives describe intent only.
 */

// --- tunables ---------------------------------------------------------------

/**
 * Default follow-ups on one topic before the interview must move on.
 *
 * Retained as the fallback for a state built without a persona; the live value
 * comes from `followUpBudgetFor(state.persona)`, which is what makes a tough
 * interviewer actually tougher rather than just differently worded.
 */
export const MAX_FOLLOW_UPS_PER_TOPIC = 2;

/** This interview's follow-up budget. */
function followUpLimit(state: Pick<OrchestratorState, "persona">): number {
  return state.persona
    ? followUpBudgetFor(state.persona)
    : MAX_FOLLOW_UPS_PER_TOPIC;
}
/** Substantive exchanges after which a topic is considered explored. */
export const EXCHANGES_TO_COVER = 2;
/** Consecutive same-direction answers before difficulty shifts. */
export const DIFFICULTY_EVIDENCE = 2;
/** Answers shorter than this are treated as non-substantive. */
export const MIN_SUBSTANTIVE_WORDS = 12;
/** Fraction of the interview after which no new topic may be opened. */
export const NO_NEW_TOPIC_AFTER = 0.85;
/** Fraction after which the interview must be closing. */
export const CLOSE_AFTER = 0.93;
/** Above this length an utterance is an answer, whatever words it contains. */
export const REPEAT_REQUEST_MAX_WORDS = 12;
/** Re-sends of an unacknowledged directive before the controller gives up. */
export const MAX_DIRECTIVE_RETRIES = 1;
/** Controller log entries retained in memory. */
export const LOG_LIMIT = 200;

// --- answer analysis --------------------------------------------------------

/**
 * Technologies worth noticing when the candidate names them.
 *
 * Used to generate contextual follow-ups ("you mentioned PostgreSQL — why?")
 * and to track threads the interview opened but never pulled on. Deliberately
 * a finite list: guessing at arbitrary proper nouns produces follow-ups about
 * the candidate's home town.
 */
const TECH_LEXICON = [
  "postgresql", "postgres", "mysql", "mongodb", "redis", "sqlite", "dynamodb",
  "cassandra", "elasticsearch", "kafka", "rabbitmq", "sqs",
  "react", "angular", "vue", "svelte", "next.js", "nextjs", "node.js", "nodejs",
  "express", "django", "flask", "spring", "rails", "laravel", ".net",
  "typescript", "javascript", "python", "java", "go", "golang", "rust", "c++",
  "docker", "kubernetes", "aws", "azure", "gcp", "terraform", "jenkins",
  "graphql", "rest", "grpc", "websocket", "oauth", "jwt",
  "git", "linux", "nginx", "prisma", "sequelize", "hibernate",
  "index", "indexing", "sharding", "replication", "caching", "microservices",
  "monolith", "load balancer", "cdn", "queue", "transaction", "acid",
];

/** Phrases that signal the candidate explained *why*, not merely *what*. */
const JUSTIFICATION_MARKERS = [
  "because", "since", "so that", "in order to", "the reason",
  "trade-off", "tradeoff", "otherwise", "which means", "that way",
  "the downside", "the benefit", "compared to", "instead of",
];

/** Explicit admissions of not knowing. */
const UNCERTAINTY_MARKERS = [
  "i don't know", "i dont know", "not sure", "no idea", "never used",
  "never worked with", "can't remember", "cant remember", "i forget",
  "not familiar", "haven't done", "havent done",
];

/**
 * Ways a candidate asks for the question again.
 *
 * Kept explicit rather than inferred, because the cost of getting it wrong is
 * asymmetric: mistaking "could you repeat that?" for an answer advances the
 * interview past a question the candidate never heard.
 */
const REPEAT_REQUEST_PATTERNS = [
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
  /\bcould you say that\b/i,
];

/**
 * Acknowledgements that carry no content.
 *
 * These are conversational noise — the candidate clearing the floor, not
 * answering. Counting them as answers is how an interview marches through its
 * plan on the strength of somebody saying "mhm".
 */
const BACKCHANNEL_PATTERNS = [
  /^(yes|yeah|yep|yup|no|nope|ok|okay|sure|right|mhm|hmm|uh huh|uh-huh|got it|i see|alright|understood|fine|correct)[.!,]?$/i,
  /^(one (sec|second|moment)|hold on|give me a (sec|second|moment)|let me think)[.!,]?$/i,
  /^(thank you|thanks|cheers)[.!,]?$/i,
];

/**
 * Decides what a finalized candidate turn actually is.
 *
 * Note the ordering: a repeat request is checked before the backchannel list,
 * because "sorry, what?" is a request for the question rather than filler.
 * An explicit "I don't know" is deliberately NOT a backchannel — it is a real
 * answer that should trigger a simpler follow-up.
 */
export function classifyUtterance(text: string): UtteranceKind {
  const trimmed = text.trim();
  if (!trimmed) return "BACKCHANNEL";

  const wordCount = trimmed.split(/\s+/).filter(Boolean).length;

  // Length guard before pattern matching. A real repeat request is short —
  // "sorry, could you repeat that?" — whereas a substantive answer might well
  // contain the word "repeat" ("I had to repeat it on every iteration"), and
  // treating that as a request would silently re-ask a question the candidate
  // just answered.
  if (
    wordCount <= REPEAT_REQUEST_MAX_WORDS &&
    REPEAT_REQUEST_PATTERNS.some((pattern) => pattern.test(trimmed))
  ) {
    return "REPEAT_REQUEST";
  }

  // Only very short turns can be pure backchannel; a long turn containing
  // "okay" somewhere is an answer.
  if (wordCount <= 4 && BACKCHANNEL_PATTERNS.some((p) => p.test(trimmed))) {
    return "BACKCHANNEL";
  }

  return "SUBSTANTIVE";
}

/**
 * Reads structure out of a finalized answer.
 *
 * Everything measured here is genuinely present in the text: length, named
 * technologies, causal connectives, concrete detail, explicit uncertainty.
 * There is deliberately no "confidence" or "nervousness" signal — nothing in a
 * transcript supports those claims, and inventing them would be exactly the
 * fabricated metric this product refuses to ship.
 */
export function analyzeAnswer(text: string): AnswerSignal {
  const trimmed = text.trim();
  const lower = trimmed.toLowerCase();
  const words = trimmed.split(/\s+/).filter(Boolean);
  const wordCount = words.length;

  const mentionedTechnologies = TECH_LEXICON.filter((tech) =>
    new RegExp(`\\b${escapeRegex(tech)}\\b`, "i").test(lower),
  );

  const hasJustification = JUSTIFICATION_MARKERS.some((marker) =>
    lower.includes(marker),
  );
  const admitsUncertainty = UNCERTAINTY_MARKERS.some((marker) =>
    lower.includes(marker),
  );
  // A number, or a named example, is the difference between "we scaled it"
  // and "we took p95 from 2.1s to 60ms".
  const hasConcreteDetail =
    /\b\d+([.,]\d+)?\s*(ms|s|%|k|m|gb|mb|rps|qps|users|rows|times)\b/i.test(lower) ||
    /\bfor example\b|\bfor instance\b|\bin my project\b|\bwe had\b/i.test(lower);

  let strength: AnswerStrength;
  if (wordCount === 0) {
    strength = "EMPTY";
  } else if (admitsUncertainty && wordCount < 40) {
    strength = "WEAK";
  } else if (wordCount < MIN_SUBSTANTIVE_WORDS) {
    strength = "WEAK";
  } else if (hasJustification && (hasConcreteDetail || mentionedTechnologies.length > 0) && wordCount >= 45) {
    strength = "STRONG";
  } else {
    strength = "ADEQUATE";
  }

  return {
    strength,
    wordCount,
    mentionedTechnologies,
    hasJustification,
    hasConcreteDetail,
    admitsUncertainty,
  };
}

// --- planning ---------------------------------------------------------------

/**
 * Builds the topic plan.
 *
 * Coverage, not a script. The orchestrator decides which areas must be visited
 * and in what phase; the model invents the actual questions, so two interviews
 * on the same plan do not sound identical.
 *
 * Ordering is by priority so a short interview still spends its time on what
 * the job actually requires.
 */
export function buildPlan(input: InterviewPlanInput): PlannedTopic[] {
  const topics: PlannedTopic[] = [];
  const seen = new Set<string>();

  const add = (
    label: string,
    phase: InterviewPhase,
    priority: PlannedTopic["priority"],
    source: PlannedTopic["source"],
  ) => {
    const id = slug(label);
    if (!id || seen.has(id)) return;
    seen.add(id);
    topics.push({
      id,
      label,
      phase,
      priority,
      coverage: "NOT_STARTED",
      exchanges: 0,
      followUps: 0,
      source,
    });
  };

  // Every interview opens the same way; the content differs, not the shape.
  add("Introduction", "INTRO", "HIGH", "TYPE");
  add("Background and experience", "BACKGROUND", "HIGH", "ROLE");

  // Resume claims come next: they are the most specific thing known about
  // this candidate, and probing them is what makes the interview theirs.
  for (const claim of input.resumeClaims.slice(0, 3)) {
    add(claim.text.slice(0, 80), "RESUME_DEEP_DIVE", "HIGH", "RESUME");
  }

  // JD requirements outrank generic role topics — this is the job they want.
  for (const [index, skill] of input.jdSkills.slice(0, 6).entries()) {
    add(skill, technicalPhaseFor(input.interviewType), index < 3 ? "HIGH" : "MEDIUM", "JD");
  }

  // Measured weak skills: more useful to probe than what they already do well.
  for (const skill of input.weakSkills.slice(0, 3)) {
    add(skill, technicalPhaseFor(input.interviewType), "MEDIUM", "WEAK_SKILL");
  }

  // Round-type staples, so a sparse profile still yields a real interview.
  for (const label of staplesFor(input.interviewType)) {
    add(label, technicalPhaseFor(input.interviewType), "MEDIUM", "TYPE");
  }

  // Candidate's own declared skills as filler, lowest priority.
  for (const skill of input.candidateSkills.slice(0, 3)) {
    add(skill, technicalPhaseFor(input.interviewType), "LOW", "ROLE");
  }

  if (input.interviewType !== "CODING") {
    add("Teamwork and collaboration", "BEHAVIORAL", "MEDIUM", "TYPE");
  }
  if (input.interviewType === "MIXED" || input.interviewType === "BEHAVIORAL" || input.interviewType === "HR") {
    add("Handling conflict or failure", "BEHAVIORAL", "MEDIUM", "TYPE");
  }

  return topics;
}

function technicalPhaseFor(type: InterviewType): InterviewPhase {
  switch (type) {
    case "CODING":
      return "CODING";
    case "SYSTEM_DESIGN":
      return "SYSTEM_DESIGN";
    case "BEHAVIORAL":
    case "HR":
      return "BEHAVIORAL";
    default:
      return "TECHNICAL";
  }
}

function staplesFor(type: InterviewType): string[] {
  switch (type) {
    case "HR":
      return ["Motivation and role fit", "Availability and expectations"];
    case "BEHAVIORAL":
      return ["Ownership of a difficult project", "Working with ambiguity"];
    case "CODING":
      return ["Problem decomposition", "Complexity analysis", "Edge cases"];
    case "SYSTEM_DESIGN":
      return ["Requirements and constraints", "Data modelling", "Scaling and failure modes"];
    case "TECHNICAL":
      return ["Data structures", "Databases", "APIs and services"];
    default:
      return ["Core fundamentals", "Databases", "Problem solving"];
  }
}

export function createOrchestratorState(
  input: InterviewPlanInput,
): OrchestratorState {
  return {
    phase: "INTRO",
    persona: input.persona,
    difficulty: input.difficulty,
    plan: buildPlan(input),
    currentTopicId: null,
    askedQuestions: [],
    questionCount: 0,
    answeredQuestions: 0,
    followUpsOnTopic: 0,
    exchangesSinceTransition: 0,
    recentStrengths: [],
    strongTopicIds: [],
    weakTopicIds: [],
    resumeClaims: input.resumeClaims.map((claim) => ({
      id: claim.id,
      text: claim.text,
      status: "NOT_DISCUSSED" as const,
    })),
    jdSkills: input.jdSkills.map((label, index) => ({
      label,
      priority: index < 3 ? ("HIGH" as const) : ("MEDIUM" as const),
      coverage: "NOT_STARTED" as const,
    })),
    openThreads: [],
    startedAtMs: null,
    durationMs: input.durationMin * 60_000,
    lastAnswer: null,
    lastUtterance: null,
    closingRequested: false,
    pendingDirective: null,
    ignoredDirectives: 0,
    log: [],
  };
}

/** Appends to the controller trail, bounded so a long interview cannot grow it without limit. */
function withLog(
  state: OrchestratorState,
  entry: Omit<ControllerLogEntry, "phase" | "difficulty">,
): OrchestratorState {
  const log = [
    ...state.log,
    { ...entry, phase: state.phase, difficulty: state.difficulty },
  ].slice(-LOG_LIMIT);
  return { ...state, log };
}

// --- reducer ----------------------------------------------------------------

export function orchestratorReducer(
  state: OrchestratorState,
  event: OrchestratorEvent,
): OrchestratorState {
  if (state.phase === "COMPLETED" && event.type !== "END_REQUESTED") return state;

  switch (event.type) {
    case "INTERVIEW_STARTED":
      return { ...state, startedAtMs: event.atMs, phase: "INTRO" };

    case "QUESTION_ASKED": {
      const normalized = normalizeQuestion(event.text);
      if (!normalized) return state;

      const acknowledged = acknowledgeDirective(state, event.text);

      return withLog(
        {
          ...acknowledged,
          askedQuestions: [...state.askedQuestions, normalized],
          questionCount: state.questionCount + 1,
        },
        {
          atMs: event.atMs,
          topicLabel: topicLabel(state, state.currentTopicId),
          directiveReason: state.pendingDirective?.reason ?? null,
          question: event.text.slice(0, 300),
          answer: null,
          answerStrength: null,
          utterance: null,
          note:
            acknowledged.ignoredDirectives > state.ignoredDirectives
              ? "directive not reflected in the question the model asked"
              : undefined,
        },
      );
    }

    case "ANSWER_FINALIZED": {
      const kind = classifyUtterance(event.text);

      // A request to hear the question again is not an answer. Nothing about
      // the interview's progress may change because of it.
      if (kind === "REPEAT_REQUEST" || kind === "BACKCHANNEL") {
        return withLog(
          { ...state, lastUtterance: kind },
          {
            atMs: event.atMs,
            topicLabel: topicLabel(state, state.currentTopicId),
            directiveReason: null,
            question: null,
            answer: event.text.slice(0, 300),
            answerStrength: null,
            utterance: kind,
            note:
              kind === "REPEAT_REQUEST"
                ? "repeat requested — topic, coverage and follow-up count unchanged"
                : "backchannel — not counted as an answer",
          },
        );
      }

      return applyAnswer(state, event.text, event.atMs);
    }

    case "INTERRUPTION":
      // An interruption is not an answer. Counting it would let a candidate
      // clearing their throat advance the interview.
      return state;

    case "TICK":
      return state;

    case "END_REQUESTED":
      return { ...state, phase: "COMPLETED", closingRequested: true };

    default: {
      const exhaustive: never = event;
      return exhaustive;
    }
  }
}

function applyAnswer(
  state: OrchestratorState,
  text: string,
  atMs: number,
): OrchestratorState {
  const signal = analyzeAnswer(text);

  // Non-substantive noise must not advance coverage or count as an answer.
  if (signal.strength === "EMPTY") {
    return { ...state, lastAnswer: signal, lastUtterance: "BACKCHANNEL" };
  }

  const recentStrengths = [...state.recentStrengths, signal.strength].slice(-4);
  const topicId = state.currentTopicId;

  const plan = state.plan.map((topic) => {
    if (topic.id !== topicId) return topic;
    const exchanges = topic.exchanges + 1;
    return { ...topic, exchanges, coverage: nextCoverage(topic, signal, exchanges) };
  });

  // Threads the candidate opened that we have not asked about yet.
  const openThreads = mergeThreads(state.openThreads, signal.mentionedTechnologies, state.askedQuestions);

  const current = plan.find((topic) => topic.id === topicId);
  const strongTopicIds =
    current && current.coverage === "STRONG" && !state.strongTopicIds.includes(current.id)
      ? [...state.strongTopicIds, current.id]
      : state.strongTopicIds;
  const weakTopicIds =
    current && current.coverage === "WEAK" && !state.weakTopicIds.includes(current.id)
      ? [...state.weakTopicIds, current.id]
      : state.weakTopicIds;

  return withLog(
    {
    ...state,
    plan,
    lastAnswer: signal,
    lastUtterance: "SUBSTANTIVE",
    recentStrengths,
    answeredQuestions: state.answeredQuestions + 1,
    exchangesSinceTransition: state.exchangesSinceTransition + 1,
    openThreads,
    strongTopicIds,
    weakTopicIds,
    difficulty: nextDifficulty(state.difficulty, recentStrengths),
    resumeClaims: markClaimDiscussed(state.resumeClaims, topicId),
    jdSkills: updateJdCoverage(state.jdSkills, current),
    },
    {
      atMs,
      topicLabel: topicLabel(state, topicId),
      directiveReason: null,
      question: null,
      answer: text.slice(0, 300),
      answerStrength: signal.strength,
      utterance: "SUBSTANTIVE",
    },
  );
}

function topicLabel(state: OrchestratorState, topicId: string | null): string | null {
  return state.plan.find((topic) => topic.id === topicId)?.label ?? null;
}

/**
 * Checks whether the model actually acted on the last directive.
 *
 * Steering is advisory — `sendClientContent` supplies context, it cannot
 * compel. If the controller committed a topic change the instant it sent one,
 * a model that ignored the directive would leave the controller convinced an
 * area was being covered while the conversation went elsewhere, and that
 * false belief then propagates into coverage and the final report.
 *
 * The check is deliberately loose: if any distinctive word from the target
 * topic appears in the question the model actually asked, the directive is
 * treated as followed. A stricter test would reject legitimate rewordings.
 */
export function acknowledgeDirective(
  state: OrchestratorState,
  questionText: string,
): OrchestratorState {
  const pending = state.pendingDirective;
  if (!pending) return state;

  // Directives that do not move the interview need no confirmation.
  if (!pending.topicId || !pending.topicLabel) {
    return { ...state, pendingDirective: null };
  }

  const asked = normalizeQuestion(questionText);
  const keywords = normalizeQuestion(pending.topicLabel)
    .split(" ")
    .filter((word) => word.length > 3);

  const followed =
    keywords.length === 0 || keywords.some((word) => asked.includes(word));

  if (followed) {
    return {
      ...state,
      currentTopicId: pending.topicId,
      pendingDirective: null,
    };
  }

  // Not followed. Leave `currentTopicId` where it was, so coverage continues
  // to accrue against the topic actually being discussed rather than the one
  // the controller wanted.
  return {
    ...state,
    ignoredDirectives: state.ignoredDirectives + 1,
    pendingDirective:
      pending.retries < MAX_DIRECTIVE_RETRIES
        ? { ...pending, retries: pending.retries + 1 }
        : null,
  };
}

function nextCoverage(
  topic: PlannedTopic,
  signal: AnswerSignal,
  exchanges: number,
): TopicCoverage {
  // A topic is never "covered" on one question — that is the whole point of
  // requiring demonstrated understanding rather than a box tick.
  if (signal.strength === "WEAK") {
    return exchanges >= EXCHANGES_TO_COVER ? "WEAK" : "PARTIAL";
  }
  if (signal.strength === "STRONG" && exchanges >= EXCHANGES_TO_COVER) {
    return "STRONG";
  }
  if (exchanges >= EXCHANGES_TO_COVER) return "COVERED";
  return "PARTIAL";
}

/**
 * Difficulty moves on evidence, never on a single answer.
 *
 * Two consecutive strong answers raise it; two weak ones lower it. Anything
 * more reactive makes the interview oscillate, which reads as the interviewer
 * having no idea what it is doing.
 */
export function nextDifficulty(
  current: Difficulty,
  recent: AnswerStrength[],
): Difficulty {
  const ladder: Difficulty[] = ["EASY", "MEDIUM", "HARD"];
  const index = ladder.indexOf(current);
  const window = recent.slice(-DIFFICULTY_EVIDENCE);
  if (window.length < DIFFICULTY_EVIDENCE) return current;

  if (window.every((s) => s === "STRONG") && index < ladder.length - 1) {
    return ladder[index + 1];
  }
  if (window.every((s) => s === "WEAK" || s === "EMPTY") && index > 0) {
    return ladder[index - 1];
  }
  return current;
}

function mergeThreads(
  existing: string[],
  mentioned: string[],
  askedQuestions: string[],
): string[] {
  const asked = askedQuestions.join(" ");
  const merged = new Set(existing);
  for (const tech of mentioned) {
    // Already asked about it — not an open thread.
    if (asked.includes(tech.toLowerCase())) continue;
    merged.add(tech);
  }
  return [...merged].slice(0, 8);
}

function markClaimDiscussed(
  claims: OrchestratorState["resumeClaims"],
  topicId: string | null,
): OrchestratorState["resumeClaims"] {
  if (!topicId) return claims;
  return claims.map((claim) =>
    slug(claim.text.slice(0, 80)) === topicId && claim.status === "NOT_DISCUSSED"
      ? { ...claim, status: "DISCUSSED" as const }
      : claim,
  );
}

/**
 * JD coverage mirrors the topic's own coverage — the answer signal is already
 * folded into that by `nextCoverage`, so re-reading it here would be a second
 * source of truth for the same fact.
 */
function updateJdCoverage(
  skills: OrchestratorState["jdSkills"],
  current: PlannedTopic | undefined,
): OrchestratorState["jdSkills"] {
  if (!current || current.source !== "JD") return skills;
  return skills.map((skill) =>
    slug(skill.label) === current.id
      ? { ...skill, coverage: current.coverage === "NOT_STARTED" ? "PARTIAL" : current.coverage }
      : skill,
  );
}

// --- steering ---------------------------------------------------------------

/**
 * Decides what the interviewer should do next.
 *
 * Returns null when nothing needs saying — steering on every event would flood
 * the session with controller text and slow the conversation down.
 */
export function decideSteering(
  state: OrchestratorState,
  nowMs: number,
): SteeringDirective | null {
  // Explicit null check, not truthiness: 0 is a legitimate start timestamp on
  // any relative clock, and treating it as "not started" would freeze elapsed
  // time at zero so the interview could never reach its closing phase.
  const elapsed = state.startedAtMs !== null ? nowMs - state.startedAtMs : 0;
  const progress = state.durationMs > 0 ? elapsed / state.durationMs : 0;

  // 1. Opening.
  if (state.questionCount === 0) {
    return {
      reason: "OPENING",
      text: controllerBlock({
        phase: "INTRO",
        instruction:
          "Greet the candidate briefly, confirm they can hear you, say roughly how long the interview will take and what it will cover, then ask them to introduce themselves. Keep the whole opening under about 40 spoken words.",
      }),
      nextPhase: "INTRO",
    };
  }

  // 2. Time is up — closing outranks everything else.
  if (progress >= CLOSE_AFTER || state.closingRequested) {
    return {
      reason: "CLOSE_INTERVIEW",
      text: controllerBlock({
        phase: "CLOSING",
        instruction:
          "Begin the closing now. Do not start a new topic or ask another technical question. Let the candidate finish anything they are saying, thank them for their time, tell them the interview is complete, and stop. Do not give scores, feedback or a verdict.",
      }),
      nextPhase: "CLOSING",
    };
  }

  // 2b. The candidate asked to hear the question again. This outranks every
  //     progress decision: re-ask, change nothing.
  if (state.lastUtterance === "REPEAT_REQUEST") {
    return {
      reason: "REPEAT_QUESTION",
      text: controllerBlock({
        phase: state.phase,
        topic: topicLabel(state, state.currentTopicId) ?? undefined,
        instruction:
          "The candidate asked you to repeat or rephrase the question. Say the same question again in different, simpler words. Do not treat their request as an answer, do not move to a new topic, and do not add a new question on top of it.",
      }),
    };
  }

  const current = state.plan.find((topic) => topic.id === state.currentTopicId);
  const answer = state.lastAnswer;

  // 3. Follow-up obligations, driven by the last answer.
  if (answer && current && state.followUpsOnTopic < followUpLimit(state)) {
    if (answer.strength === "WEAK" || answer.admitsUncertainty) {
      return {
        reason: "SIMPLIFY",
        text: controllerBlock({
          phase: state.phase,
          topic: current.label,
          performance: "STRUGGLING",
          instruction:
            "The candidate struggled with that. Do not move on and do not move to an unrelated topic. Acknowledge it briefly without praise or sympathy, then ask one simpler, more foundational question on the same topic to find out what they do know.",
        }),
      };
    }

    if (answer.strength === "STRONG") {
      return {
        reason: "PROBE_DEEPER",
        text: controllerBlock({
          phase: state.phase,
          topic: current.label,
          performance: "STRONG",
          instruction:
            "That was a strong answer. Do not praise it at length and do not move on yet. Push one level deeper on the same topic: ask about a trade-off, an edge case, how it behaves at higher scale, or an implementation detail they glossed over.",
        }),
      };
    }

    if (!answer.hasJustification && answer.wordCount >= MIN_SUBSTANTIVE_WORDS) {
      return {
        reason: "FOLLOW_UP_REQUIRED",
        text: controllerBlock({
          phase: state.phase,
          topic: current.label,
          performance: "CLAIM_WITHOUT_REASONING",
          instruction:
            "The candidate stated what they did but not why. Probe the reasoning: ask for the concrete technical justification and what they traded away. Stay on this topic.",
        }),
      };
    }
  }

  // 4. A thread the candidate opened themselves — the most natural follow-up
  //    there is, and the thing that makes the interview feel like listening.
  if (
    answer &&
    state.openThreads.length > 0 &&
    state.followUpsOnTopic < followUpLimit(state)
  ) {
    const thread = state.openThreads[0];
    return {
      reason: "PROBE_OPEN_THREAD",
      text: controllerBlock({
        phase: state.phase,
        topic: current?.label,
        instruction: `The candidate mentioned "${thread}" but was not asked about it. Ask one question about that specific choice — why it, and what the alternative would have cost them.`,
      }),
    };
  }

  // 5. Move on. Pick the next topic by priority, honouring the time budget.
  const next = selectNextTopic(state, progress);

  if (!next) {
    return {
      reason: "CLOSE_INTERVIEW",
      text: controllerBlock({
        phase: "CLOSING",
        instruction:
          "All planned areas have been covered. Ask whether the candidate has any questions, then thank them and close the interview. Do not give scores or feedback.",
      }),
      nextPhase: "CLOSING",
    };
  }

  if (next.id !== state.currentTopicId) {
    const claim = state.resumeClaims.find(
      (c) => slug(c.text.slice(0, 80)) === next.id && c.status === "NOT_DISCUSSED",
    );

    if (claim) {
      return {
        reason: "PROBE_RESUME_CLAIM",
        text: controllerBlock({
          phase: next.phase,
          topic: next.label,
          instruction: `Move to this claim from the candidate's own resume: "${claim.text}". Ask how they actually did it — the specific decisions and their part in it. Do not invent any detail they did not state.`,
        }),
        nextPhase: next.phase,
        nextTopicId: next.id,
      };
    }

    return {
      reason: next.phase !== state.phase ? "PHASE_CHANGE" : "TOPIC_TRANSITION",
      text: controllerBlock({
        phase: next.phase,
        topic: next.label,
        difficulty: state.difficulty,
        instruction: `The previous area is sufficiently covered. Transition naturally — acknowledge the shift in a few words rather than announcing it mechanically — and begin exploring "${next.label}" at ${state.difficulty.toLowerCase()} difficulty. Ask one question.`,
      }),
      nextPhase: next.phase,
      nextTopicId: next.id,
    };
  }

  return null;
}

/**
 * Chooses the next topic.
 *
 * Priority order, but with a hard rule near the end of the interview: no new
 * topic is opened in the last stretch, because starting a system-design
 * question with ninety seconds left wastes both people's time.
 */
export function selectNextTopic(
  state: OrchestratorState,
  progress: number,
): PlannedTopic | null {
  const unfinished = state.plan.filter(
    (topic) => topic.coverage === "NOT_STARTED" || topic.coverage === "PARTIAL",
  );

  if (progress >= NO_NEW_TOPIC_AFTER) {
    // Only continue something already open.
    const partial = unfinished.filter((topic) => topic.coverage === "PARTIAL");
    return partial[0] ?? null;
  }

  const rank: Record<PlannedTopic["priority"], number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };
  const phaseRank: Record<InterviewPhase, number> = {
    INTRO: 0,
    BACKGROUND: 1,
    RESUME_DEEP_DIVE: 2,
    TECHNICAL: 3,
    CODING: 3,
    SYSTEM_DESIGN: 3,
    BEHAVIORAL: 4,
    CLOSING: 5,
    COMPLETED: 6,
  };

  return (
    [...unfinished].sort(
      (a, b) =>
        phaseRank[a.phase] - phaseRank[b.phase] ||
        rank[a.priority] - rank[b.priority],
    )[0] ?? null
  );
}

/**
 * Whether a question repeats one already asked.
 *
 * Exact-normalised match plus a token-overlap check, because the model
 * rephrases rather than repeating verbatim — "explain indexing" and "can you
 * explain how indexing works" are the same question to a candidate.
 */
export function isRepeatQuestion(
  question: string,
  asked: string[],
  threshold = 0.7,
): boolean {
  const normalized = normalizeQuestion(question);
  if (!normalized) return false;
  if (asked.includes(normalized)) return true;

  const tokens = contentTokens(normalized);
  if (tokens.size === 0) return false;

  return asked.some((previous) => {
    const previousTokens = contentTokens(previous);
    if (previousTokens.size === 0) return false;
    let shared = 0;
    for (const token of tokens) if (previousTokens.has(token)) shared += 1;
    return shared / Math.min(tokens.size, previousTokens.size) >= threshold;
  });
}

/**
 * Question words that carry no subject matter.
 *
 * Without stripping these, "what is X" and "why do Y" share `what`/`is`-class
 * tokens and drift toward each other, while two genuinely different questions
 * about the same topic can clear the threshold on filler alone.
 */
const STOP_WORDS = new Set([
  "what", "why", "how", "when", "where", "which", "does", "did", "do", "the",
  "that", "this", "these", "those", "you", "your", "would", "could", "should",
  "can", "tell", "about", "explain", "describe", "please", "and", "for", "with",
  "use", "used", "using", "uses", "there", "then", "than",
]);

/**
 * Content tokens, crudely stemmed.
 *
 * The reason this exists: "What is database indexing?" and "Why do databases
 * use indexes?" are the same question to a candidate, but as raw tokens they
 * share nothing — `database`/`databases` and `indexing`/`indexes` are distinct
 * strings. Folding the common English suffixes collapses them onto the same
 * stem, which is what makes semantic duplication detectable without a model.
 *
 * Deliberately crude. A real stemmer would be more accurate and would also be
 * a dependency and a source of surprises; the failure mode here is only ever a
 * missed or spurious duplicate, and the threshold absorbs both.
 */
function contentTokens(normalized: string): Set<string> {
  const tokens = new Set<string>();
  for (const raw of normalized.split(" ")) {
    if (raw.length <= 3 || STOP_WORDS.has(raw)) continue;
    tokens.add(stem(raw));
  }
  return tokens;
}

function stem(word: string): string {
  let base = word;

  for (const suffix of ["ing", "ies", "ed", "s"]) {
    if (base.length - suffix.length >= 4 && base.endsWith(suffix)) {
      // "ies" → "y" keeps queries/query together.
      base = suffix === "ies" ? `${base.slice(0, -3)}y` : base.slice(0, -suffix.length);
      break;
    }
  }

  /**
   * Trim a trailing "e" last, and unconditionally.
   *
   * Without this the stem is asymmetric and the whole thing fails on exactly
   * the pairs it exists for: "queues" loses its "s" to give "queue", while a
   * bare "queue" keeps it, so the two never match. Folding the final "e" makes
   * both "queu", and likewise "databases"/"database" → "databas" and
   * "indexes"/"indexing" → "index".
   */
  return base.length > 3 && base.endsWith("e") ? base.slice(0, -1) : base;
}

/** Applies a directive's phase/topic move to the state. */
export function applyDirective(
  state: OrchestratorState,
  directive: SteeringDirective,
): OrchestratorState {
  const movedTopic =
    directive.nextTopicId !== undefined &&
    directive.nextTopicId !== state.currentTopicId;

  // A repeat leaves every progress counter exactly where it was.
  if (directive.reason === "REPEAT_QUESTION") {
    return { ...state, lastUtterance: null };
  }

  return {
    ...state,
    phase: directive.nextPhase ?? state.phase,
    // The topic is NOT committed here. It becomes current only once the
    // model's next question shows it actually followed the directive —
    // see `acknowledgeDirective`.
    pendingDirective: movedTopic
      ? {
          reason: directive.reason,
          topicId: directive.nextTopicId ?? null,
          topicLabel:
            state.plan.find((t) => t.id === directive.nextTopicId)?.label ?? null,
          issuedAtMs: 0,
          retries: 0,
        }
      : state.pendingDirective,
    currentTopicId: state.currentTopicId,
    // A follow-up increments the counter; a transition resets it.
    followUpsOnTopic: isFollowUp(directive.reason)
      ? state.followUpsOnTopic + 1
      : 0,
    exchangesSinceTransition: movedTopic ? 0 : state.exchangesSinceTransition,
    openThreads:
      directive.reason === "PROBE_OPEN_THREAD"
        ? state.openThreads.slice(1)
        : state.openThreads,
    closingRequested:
      directive.reason === "CLOSE_INTERVIEW" ? true : state.closingRequested,
    lastUtterance: null,
  };
}

function isFollowUp(reason: SteeringDirective["reason"]): boolean {
  return (
    reason === "FOLLOW_UP_REQUIRED" ||
    reason === "PROBE_DEEPER" ||
    reason === "SIMPLIFY" ||
    reason === "PROBE_OPEN_THREAD"
  );
}

/**
 * Renders a controller block.
 *
 * Sent to the model as conversation context, never spoken. It states intent
 * and constraints; it never dictates a sentence, because prescribed wording is
 * what makes an interviewer sound like a form being read aloud.
 */
export function controllerBlock(args: {
  phase: InterviewPhase;
  topic?: string;
  difficulty?: Difficulty;
  performance?: string;
  instruction: string;
}): string {
  const lines = [
    "[INTERVIEW CONTROLLER — internal guidance, do not read aloud or mention]",
    `Phase: ${args.phase}`,
  ];
  if (args.topic) lines.push(`Topic: ${args.topic}`);
  if (args.difficulty) lines.push(`Difficulty: ${args.difficulty}`);
  if (args.performance) lines.push(`Last answer: ${args.performance}`);
  lines.push(`Instruction: ${args.instruction}`);
  lines.push(
    "Speak naturally in your own words. Ask one question, then stop and listen.",
  );
  return lines.join("\n");
}

// --- helpers ----------------------------------------------------------------

export function normalizeQuestion(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function slug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
