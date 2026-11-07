import {
  instructionFor,
  isConversationalRepair,
  staysOnTopic,
} from "@/lib/ai/live/intent-directives";
import {
  callbackFor,
  clarificationFor,
  findContradiction,
  markRecalled,
  recallSubject,
  recordEvidence,
  rememberAnswer,
  type EvidenceRecord,
  type InterviewMemory,
} from "@/lib/ai/live/memory";
import { controllerBlock } from "@/lib/ai/live/orchestrator";
import type {
  OrchestratorState,
  SteeringDirective,
} from "@/lib/ai/live/orchestrator-types";
import type { AnswerIntent, AnswerUnderstanding } from "@/lib/ai/live/understanding";

/**
 * What the interviewer does with a finalized answer.
 *
 * Extracted from the live client so the whole decision — memory, contradiction
 * handling, evidence, the choice between following up and moving on — can be
 * driven end to end in a test without a socket. The client keeps the effects
 * (sending, tracing, mutating orchestrator state); everything that decides
 * *what should happen* lives here and is pure.
 *
 * That split matters because these behaviours were previously only reachable
 * through a live WebSocket, which meant they could be correct in isolation and
 * silently absent from the real interview.
 */

/**
 * Directive reasons that open ground the candidate has not been on.
 *
 * Only these are outranked by a memory callback. A resume probe or a close is
 * higher-value than revisiting a detail, and interrupting either to say "you
 * mentioned Redis earlier" would be worse interviewing, not better.
 */
const OPENS_NEW_TOPIC: ReadonlySet<SteeringDirective["reason"]> = new Set([
  "TOPIC_TRANSITION",
  "PHASE_CHANGE",
]);

export type TurnDecisionInput = {
  /** The complete, finalized answer. Never a partial transcript. */
  answerText: string;
  questionText: string;
  topicLabel: string | null;
  understanding: AnswerUnderstanding;
  intent: AnswerIntent;
  /** 1-based index of this answer. The identity used to prevent re-processing. */
  turn: number;
  atMs: number;
  memory: InterviewMemory;
  /** Subjects already clarified, so the same one is not re-queried forever. */
  clarifiedSubjects: string[];
  orchestrator: OrchestratorState;
  /** The plan's own next move, when the answer allows the interview to progress. */
  planDirective: SteeringDirective | null;
};

export type TurnDecision = {
  /** The controller block to steer with. */
  block: string;
  memory: InterviewMemory;
  /** Null for a conversational repair — a repair is not an answer. */
  evidence: EvidenceRecord | null;
  clarifiedSubjects: string[];
  /** What the next question will be, so the room can label a follow-up. */
  nextQuestionIntent: AnswerIntent | "NEW_TOPIC";
  /** Terms the directive pointed at, for the follow-through check. */
  subjectTerms: string[];
  /** Set when the plan's directive should be applied to orchestrator state. */
  applyDirective: SteeringDirective | null;
  /** Which rule won, for the dev trace. */
  reason:
    | "REPAIR"
    | "CONTRADICTION"
    | "FOLLOW_UP"
    | "MEMORY_CALLBACK"
    | "PLAN";
};

/**
 * Decides the response to one finalized answer.
 *
 * Priority is fixed and deliberate:
 *
 *   1. conversational repair — they have not answered yet
 *   2. contradiction clarification — resolve it before building on it
 *   3-7. the intent follow-up (direct / weak / reasoning / example)
 *   8. the plan's own progression
 *   9. memory callback, in place of opening brand-new ground
 *   10. new topic
 *
 * A callback never pre-empts a clarification: asking "you mentioned Redis
 * earlier" while an unresolved inconsistency sits on the table is the sort of
 * thing that makes an interviewer feel like it is not listening.
 */
export function decideTurnResponse(input: TurnDecisionInput): TurnDecision {
  const repair = isConversationalRepair(input.intent);

  // --- memory + evidence -------------------------------------------------
  // A repair is a request, not a statement: nothing to remember, and nothing
  // that could support a conclusion in the report.
  const memory = repair
    ? input.memory
    : rememberAnswer(input.memory, {
        text: input.answerText,
        turn: input.turn,
        atMs: input.atMs,
        understanding: input.understanding,
      });

  const evidence = repair
    ? null
    : recordEvidence({
        turn: input.turn,
        atMs: input.atMs,
        questionText: input.questionText,
        answerText: input.answerText,
        topicLabel: input.topicLabel,
        intent: input.intent,
        understanding: input.understanding,
      });

  const instruction = instructionFor({
    intent: input.intent,
    understanding: input.understanding,
    answerText: input.answerText,
    questionText: input.questionText,
    topicLabel: input.topicLabel,
  });

  const wrap = (text: string) =>
    controllerBlock({
      phase: input.orchestrator.phase,
      topic: input.topicLabel ?? undefined,
      difficulty: input.orchestrator.difficulty,
      instruction: text,
    });

  // --- 1. repair ----------------------------------------------------------
  if (repair) {
    return {
      block: wrap(instruction),
      memory,
      evidence,
      clarifiedSubjects: input.clarifiedSubjects,
      nextQuestionIntent: input.intent,
      subjectTerms: [],
      applyDirective: null,
      reason: "REPAIR",
    };
  }

  // --- 2. contradiction ---------------------------------------------------
  const contradiction = findContradiction(memory);
  if (contradiction && !input.clarifiedSubjects.includes(contradiction.subject)) {
    return {
      block: wrap(clarificationFor(contradiction)),
      memory,
      evidence,
      clarifiedSubjects: [...input.clarifiedSubjects, contradiction.subject],
      nextQuestionIntent: "RESOLVE_CONTRADICTION",
      subjectTerms: [contradiction.subject],
      applyDirective: null,
      reason: "CONTRADICTION",
    };
  }

  /**
   * Technologies named in this answer that have not been probed yet.
   *
   * `understandAnswer` is stateless — it sees one answer, so it returns
   * PROBE_MENTIONED_TECHNOLOGY for *any* answer naming a technology, forever.
   * Left alone that is a livelock: a candidate who keeps saying "Postgres"
   * can never let the plan advance, and the interview sits on one topic for
   * its whole duration. The recall ledger is what supplies the missing
   * cross-turn state.
   */
  const unprobed = input.understanding.technologyMentioned.filter(
    (technology) => !memory.recalled.includes(technology.toLowerCase()),
  );
  const technologyThreadExhausted =
    input.intent === "PROBE_MENTIONED_TECHNOLOGY" && unprobed.length === 0;

  // --- 3-7. the answer still needs work ----------------------------------
  if (staysOnTopic(input.intent) && !technologyThreadExhausted) {
    // Probing a technology consumes it, so the next turn moves to the next
    // one rather than asking about the same thing again.
    const probed =
      input.intent === "PROBE_MENTIONED_TECHNOLOGY" && unprobed[0]
        ? markRecalled(memory, unprobed[0].toLowerCase())
        : memory;

    return {
      block: wrap(instruction),
      memory: probed,
      evidence,
      clarifiedSubjects: input.clarifiedSubjects,
      nextQuestionIntent: input.intent,
      subjectTerms: [
        ...input.understanding.technologyMentioned,
        input.topicLabel ?? "",
      ].filter(Boolean),
      applyDirective: null,
      reason: "FOLLOW_UP",
    };
  }

  // --- 9. a callback, rather than opening new ground ----------------------
  const wouldOpenNewTopic =
    input.planDirective !== null && OPENS_NEW_TOPIC.has(input.planDirective.reason);

  if (wouldOpenNewTopic) {
    const recalled = recallSubject(memory, { currentTurn: input.turn });
    if (recalled) {
      return {
        block: wrap(callbackFor(recalled)),
        memory: markRecalled(memory, recalled.subject),
        evidence,
        clarifiedSubjects: input.clarifiedSubjects,
        nextQuestionIntent: "PROBE_MENTIONED_TECHNOLOGY",
        subjectTerms: [recalled.subject],
        // The plan does not move: this question revisits, it does not progress.
        applyDirective: null,
        reason: "MEMORY_CALLBACK",
      };
    }
  }

  // --- 8/10. the plan ------------------------------------------------------
  if (input.planDirective) {
    return {
      block: input.planDirective.text,
      memory,
      evidence,
      clarifiedSubjects: input.clarifiedSubjects,
      nextQuestionIntent: "NEW_TOPIC",
      subjectTerms: [],
      applyDirective: input.planDirective,
      reason: "PLAN",
    };
  }

  // Nothing left to move to; keep the intent instruction rather than silence.
  return {
    block: wrap(instruction),
    memory,
    evidence,
    clarifiedSubjects: input.clarifiedSubjects,
    nextQuestionIntent: input.intent,
    subjectTerms: [],
    applyDirective: null,
    reason: "FOLLOW_UP",
  };
}
