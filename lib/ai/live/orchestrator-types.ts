import type { Difficulty, InterviewType, InterviewerPersona } from "@prisma/client";

/**
 * Types for the interview orchestrator.
 *
 * The orchestrator is the interview *controller*; Gemini Live remains the
 * conversational intelligence. Nothing here knows about WebSockets, React or
 * the SDK, so the whole control layer is testable without a browser.
 */

export type InterviewPhase =
  | "INTRO"
  | "BACKGROUND"
  | "RESUME_DEEP_DIVE"
  | "TECHNICAL"
  | "BEHAVIORAL"
  | "CODING"
  | "SYSTEM_DESIGN"
  | "CLOSING"
  | "COMPLETED";

export type TopicCoverage =
  | "NOT_STARTED"
  | "PARTIAL"
  | "COVERED"
  | "STRONG"
  | "WEAK";

export type TopicPriority = "HIGH" | "MEDIUM" | "LOW";

export type PlannedTopic = {
  /** Stable id so coverage survives rewording. */
  id: string;
  label: string;
  phase: InterviewPhase;
  priority: TopicPriority;
  coverage: TopicCoverage;
  /** Substantive exchanges spent here. */
  exchanges: number;
  /** Follow-ups asked on this topic in a row. */
  followUps: number;
  /** Where the topic came from, for grounding checks. */
  source: "ROLE" | "RESUME" | "JD" | "WEAK_SKILL" | "TYPE";
};

export type ResumeClaimState = {
  id: string;
  text: string;
  status: "NOT_DISCUSSED" | "DISCUSSED" | "CHALLENGED";
};

export type JdSkillState = {
  label: string;
  priority: TopicPriority;
  coverage: TopicCoverage;
};

/**
 * What we can honestly infer about an answer from its transcript alone.
 *
 * This is a *structural* read, not a grade. The orchestrator uses it to decide
 * interview shape — follow up, move on, drop difficulty — while the real
 * judgement of correctness stays with the model that actually heard the
 * answer, and with the existing evaluation engine after the interview.
 * Nothing here is presented to the candidate as a score.
 */
export type AnswerStrength = "EMPTY" | "WEAK" | "ADEQUATE" | "STRONG";

/**
 * What a candidate utterance actually *is*.
 *
 * Not every finalized turn is an answer. "Sorry, could you repeat that?" is a
 * request; "mhm" is a backchannel. Treating either as an answer advances the
 * interview on nothing — the classic failure where an interviewer bot marches
 * through its plan while the candidate is still asking what the question was.
 */
export type UtteranceKind = "SUBSTANTIVE" | "REPEAT_REQUEST" | "BACKCHANNEL";

export type AnswerSignal = {
  strength: AnswerStrength;
  wordCount: number;
  /** Technologies/nouns the candidate named, for contextual follow-ups. */
  mentionedTechnologies: string[];
  /** They explained *why*, not just *what*. */
  hasJustification: boolean;
  /** They gave a concrete example or number. */
  hasConcreteDetail: boolean;
  /** Explicit admission of not knowing. */
  admitsUncertainty: boolean;
};

export type OrchestratorState = {
  phase: InterviewPhase;
  /**
   * Who is conducting the interview.
   *
   * Held on the state rather than read from the plan at each decision so the
   * reducer stays a pure function of its own state, and so a test can set a
   * persona without building a whole plan.
   */
  persona: InterviewerPersona;
  difficulty: Difficulty;
  plan: PlannedTopic[];
  currentTopicId: string | null;
  /** Normalised text of every question asked, for repetition checks. */
  askedQuestions: string[];
  questionCount: number;
  answeredQuestions: number;
  /** Consecutive follow-ups on the current topic. */
  followUpsOnTopic: number;
  exchangesSinceTransition: number;
  /** Rolling record used for difficulty moves — needs evidence, not one answer. */
  recentStrengths: AnswerStrength[];
  strongTopicIds: string[];
  weakTopicIds: string[];
  resumeClaims: ResumeClaimState[];
  jdSkills: JdSkillState[];
  /** Technologies the candidate raised that have not been probed yet. */
  openThreads: string[];
  startedAtMs: number | null;
  durationMs: number;
  lastAnswer: AnswerSignal | null;
  /** What the most recent finalized candidate turn actually was. */
  lastUtterance: UtteranceKind | null;
  closingRequested: boolean;
  /**
   * A directive issued but not yet reflected in the model's behaviour.
   *
   * Steering is advisory: `sendClientContent` gives the model context, it
   * cannot compel it. Committing a topic change the moment the directive is
   * sent means the controller believes an area was covered when the model
   * actually ignored it and carried on elsewhere.
   */
  pendingDirective: {
    reason: SteeringDirective["reason"];
    topicId: string | null;
    topicLabel: string | null;
    issuedAtMs: number;
    /** Times it has been re-sent after going unacknowledged. */
    retries: number;
  } | null;
  /** Directives the model demonstrably did not act on. */
  ignoredDirectives: number;
  /** Development-facing controller trail. Never rendered to the candidate. */
  log: ControllerLogEntry[];
};

/**
 * One line of the controller trail.
 *
 * Exists to answer "why did it ask that?" during development. Contains the
 * directive reason and the dialogue, but is never surfaced in the candidate's
 * UI — the interviewer's reasoning is not part of the interview.
 */
export type ControllerLogEntry = {
  atMs: number;
  phase: InterviewPhase;
  topicLabel: string | null;
  directiveReason: SteeringDirective["reason"] | null;
  question: string | null;
  answer: string | null;
  answerStrength: AnswerStrength | null;
  utterance: UtteranceKind | null;
  difficulty: Difficulty;
  note?: string;
};

/** Events the orchestrator reacts to. Only finalized dialogue reaches it. */
export type OrchestratorEvent =
  | { type: "INTERVIEW_STARTED"; atMs: number }
  | { type: "QUESTION_ASKED"; text: string; atMs: number }
  /** Only a FINALIZED candidate turn reaches the orchestrator. */
  | { type: "ANSWER_FINALIZED"; text: string; atMs: number }
  | { type: "INTERRUPTION" }
  | { type: "TICK"; atMs: number }
  | { type: "END_REQUESTED" };

/**
 * A controller instruction for the model.
 *
 * Deliberately describes intent, never exact wording — forcing a sentence is
 * what makes an interviewer sound robotic. The model picks the words.
 */
export type SteeringDirective = {
  /** Why this was emitted, for tests and the observability log. */
  reason:
    | "OPENING"
    | "FOLLOW_UP_REQUIRED"
    | "PROBE_DEEPER"
    | "SIMPLIFY"
    | "TOPIC_TRANSITION"
    | "PROBE_RESUME_CLAIM"
    | "PROBE_OPEN_THREAD"
    | "PHASE_CHANGE"
    | "TIME_WARNING"
    | "REPEAT_QUESTION"
    | "CLOSE_INTERVIEW";
  /** The controller-context block sent via sendClientContent. */
  text: string;
  /** Set when the directive moves the interview on. */
  nextPhase?: InterviewPhase;
  nextTopicId?: string | null;
};

export type InterviewPlanInput = {
  interviewType: InterviewType;
  persona: InterviewerPersona;
  difficulty: Difficulty;
  targetRole: string;
  durationMin: number;
  plannedQuestions: number;
  /** Verified-unverified resume claims worth probing. */
  resumeClaims: Array<{ id: string; text: string }>;
  /** Required skills from the target JD, highest priority first. */
  jdSkills: string[];
  /** Measured weak skills from the ledger. */
  weakSkills: string[];
  /** Candidate's declared skills. */
  candidateSkills: string[];
};
