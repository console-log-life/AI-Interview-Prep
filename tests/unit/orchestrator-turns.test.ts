import { describe, expect, it } from "vitest";

import {
  MAX_DIRECTIVE_RETRIES,
  REPEAT_REQUEST_MAX_WORDS,
  acknowledgeDirective,
  applyDirective,
  classifyUtterance,
  createOrchestratorState,
  decideSteering,
  orchestratorReducer,
} from "@/lib/ai/live/orchestrator";
import type {
  InterviewPlanInput,
  OrchestratorState,
} from "@/lib/ai/live/orchestrator-types";

/**
 * Conversational-boundary behaviour.
 *
 * These cover the failure modes that only appear in a real spoken interview:
 * an interview that marches on because somebody said "mhm", a question re-asked
 * as though the request to repeat it were an answer, and a controller that
 * believes a topic is covered because it *asked* for it rather than because
 * the model complied.
 */

function planInput(overrides: Partial<InterviewPlanInput> = {}): InterviewPlanInput {
  return {
    interviewType: "TECHNICAL",
    persona: "PROFESSIONAL",
    difficulty: "MEDIUM",
    targetRole: "Backend Engineer",
    durationMin: 30,
    plannedQuestions: 8,
    resumeClaims: [],
    jdSkills: [],
    weakSkills: [],
    candidateSkills: [],
    ...overrides,
  };
}

function baseState(overrides: Partial<OrchestratorState> = {}): OrchestratorState {
  const base = createOrchestratorState(planInput());
  return {
    ...base,
    startedAtMs: 0,
    questionCount: 3,
    currentTopicId: base.plan[0].id,
    ...overrides,
  };
}

const REAL_ANSWER =
  "We added a B-tree index on the user_id column because the lookup was doing a sequential scan over roughly two million rows on every request, and that took the query from about 800ms down to 4ms at p95. The trade-off is that every insert and update now has to maintain the index as well, so the write path got measurably slower, and we decided that was worth it because this table is read far more often than it is written.";

// --- 7. repeat / rephrase ---------------------------------------------------

describe("repeat requests are recognised", () => {
  it.each([
    "Repeat the question",
    "Can you repeat that?",
    "Could you repeat that please",
    "Say that again",
    "Sorry, I didn't hear you",
    "I didn't catch that",
    "Could you rephrase?",
    "Can you rephrase the question",
    "What was the question?",
    "Sorry, what?",
    "Pardon?",
    "One more time",
  ])("classifies %p as a repeat request", (utterance) => {
    expect(classifyUtterance(utterance)).toBe("REPEAT_REQUEST");
  });

  it("does not mistake a technical answer that uses the word 'repeat'", () => {
    // The false positive that would silently re-ask an answered question.
    const answer =
      "I had to repeat the request on failure, so I added exponential backoff with a jitter to avoid a thundering herd against the upstream service.";
    expect(classifyUtterance(answer)).toBe("SUBSTANTIVE");
  });

  it("only treats short utterances as repeat requests", () => {
    const long = `${"word ".repeat(REPEAT_REQUEST_MAX_WORDS + 2)} can you repeat`;
    expect(classifyUtterance(long)).toBe("SUBSTANTIVE");
  });
});

describe("a repeat request changes nothing about interview progress", () => {
  function afterRepeat(state = baseState()) {
    return orchestratorReducer(state, {
      type: "ANSWER_FINALIZED",
      text: "Sorry, could you repeat that?",
      atMs: 5_000,
    });
  }

  it("is not counted as an answer", () => {
    expect(afterRepeat().answeredQuestions).toBe(0);
  });

  it("does not advance topic coverage", () => {
    const before = baseState();
    expect(afterRepeat(before).plan).toEqual(before.plan);
  });

  it("does not change the current topic", () => {
    const before = baseState();
    expect(afterRepeat(before).currentTopicId).toBe(before.currentTopicId);
  });

  it("does not increase the follow-up count", () => {
    const before = baseState({ followUpsOnTopic: 1 });
    expect(afterRepeat(before).followUpsOnTopic).toBe(1);
  });

  it("does not affect difficulty evidence", () => {
    const before = baseState();
    expect(afterRepeat(before).recentStrengths).toEqual(before.recentStrengths);
  });

  it("emits a REPEAT_QUESTION directive", () => {
    const directive = decideSteering(afterRepeat(), 60_000);
    expect(directive?.reason).toBe("REPEAT_QUESTION");
  });

  it("asks the model to rephrase without adding a new question", () => {
    const text = decideSteering(afterRepeat(), 60_000)!.text;
    expect(text).toMatch(/repeat|rephrase/i);
    expect(text).toMatch(/different, simpler words|simpler words/i);
    expect(text).toMatch(/do not move to a new topic/i);
    expect(text).toMatch(/do not add a new question/i);
  });

  it("leaves every counter untouched when the directive is applied", () => {
    const state = afterRepeat();
    const applied = applyDirective(state, decideSteering(state, 60_000)!);

    expect(applied.currentTopicId).toBe(state.currentTopicId);
    expect(applied.followUpsOnTopic).toBe(state.followUpsOnTopic);
    expect(applied.phase).toBe(state.phase);
    expect(applied.answeredQuestions).toBe(state.answeredQuestions);
  });

  it("clears the flag so it does not repeat forever", () => {
    const state = afterRepeat();
    const applied = applyDirective(state, decideSteering(state, 60_000)!);
    expect(decideSteering(applied, 60_000)?.reason).not.toBe("REPEAT_QUESTION");
  });

  it("outranks a pending follow-up obligation", () => {
    // Even mid-probe, "I didn't hear you" must be answered first.
    const state = orchestratorReducer(
      baseState({ followUpsOnTopic: 0 }),
      { type: "ANSWER_FINALIZED", text: "I didn't hear you", atMs: 1 },
    );
    expect(decideSteering(state, 60_000)?.reason).toBe("REPEAT_QUESTION");
  });
});

// --- 8. backchannel and "I don't know" --------------------------------------

describe("backchannels do not advance the interview", () => {
  it.each(["yes", "Okay", "hmm", "mhm", "right", "sure", "got it", "thanks"])(
    "classifies %p as backchannel",
    (utterance) => {
      expect(classifyUtterance(utterance)).toBe("BACKCHANNEL");
    },
  );

  it.each(["yes", "okay", "hmm"])("does not count %p as an answer", (utterance) => {
    const after = orchestratorReducer(baseState(), {
      type: "ANSWER_FINALIZED",
      text: utterance,
      atMs: 1,
    });
    expect(after.answeredQuestions).toBe(0);
    expect(after.recentStrengths).toHaveLength(0);
  });

  it("does not advance coverage on a backchannel", () => {
    const before = baseState();
    const after = orchestratorReducer(before, {
      type: "ANSWER_FINALIZED",
      text: "okay",
      atMs: 1,
    });
    expect(after.plan).toEqual(before.plan);
  });

  it("treats 'yes' inside a real sentence as an answer", () => {
    expect(
      classifyUtterance("Yes, because the index makes the lookup logarithmic instead of linear."),
    ).toBe("SUBSTANTIVE");
  });
});

describe("'I don't know' is a real answer, not noise", () => {
  it("is classified substantive", () => {
    // It is an admission with information in it, and must reach the
    // orchestrator so the interview can simplify rather than plough on.
    expect(classifyUtterance("I don't know")).toBe("SUBSTANTIVE");
  });

  it("counts as an answered question", () => {
    const after = orchestratorReducer(baseState(), {
      type: "ANSWER_FINALIZED",
      text: "I don't know, I've never used that.",
      atMs: 1,
    });
    expect(after.answeredQuestions).toBe(1);
  });

  it("triggers simplification rather than a topic jump", () => {
    const after = orchestratorReducer(baseState(), {
      type: "ANSWER_FINALIZED",
      text: "I don't know, I've never used that.",
      atMs: 1,
    });
    expect(decideSteering(after, 60_000)?.reason).toBe("SIMPLIFY");
  });
});

// --- 3. interruption --------------------------------------------------------

describe("interruption never finalizes an answer", () => {
  it("does not count as an answered question", () => {
    const after = orchestratorReducer(baseState(), { type: "INTERRUPTION" });
    expect(after.answeredQuestions).toBe(0);
  });

  it("leaves coverage, difficulty and threads untouched", () => {
    const before = baseState();
    const after = orchestratorReducer(before, { type: "INTERRUPTION" });
    expect(after.plan).toEqual(before.plan);
    expect(after.difficulty).toBe(before.difficulty);
    expect(after.openThreads).toEqual(before.openThreads);
  });

  it("does not consume a follow-up allowance", () => {
    const before = baseState({ followUpsOnTopic: 1 });
    expect(orchestratorReducer(before, { type: "INTERRUPTION" }).followUpsOnTopic).toBe(1);
  });
});

// --- 5. directive acknowledgement ------------------------------------------

describe("the controller does not assume a directive was obeyed", () => {
  function withPending(topicLabel: string, topicId: string) {
    return baseState({
      pendingDirective: {
        reason: "TOPIC_TRANSITION",
        topicId,
        topicLabel,
        issuedAtMs: 0,
        retries: 0,
      },
    });
  }

  it("commits the topic when the model's question reflects the directive", () => {
    const state = withPending("Databases", "databases");
    const after = acknowledgeDirective(state, "Let's talk about databases — how would you index this table?");

    expect(after.currentTopicId).toBe("databases");
    expect(after.pendingDirective).toBeNull();
    expect(after.ignoredDirectives).toBe(0);
  });

  it("does NOT commit the topic when the model ignored the directive", () => {
    const before = withPending("Databases", "databases");
    const after = acknowledgeDirective(before, "So tell me about your favourite programming language.");

    // The controller must keep believing the old topic is current, or coverage
    // accrues against an area that was never discussed.
    expect(after.currentTopicId).toBe(before.currentTopicId);
    expect(after.ignoredDirectives).toBe(1);
  });

  it("retries an ignored directive, then gives up", () => {
    let state = withPending("Databases", "databases");
    for (let i = 0; i <= MAX_DIRECTIVE_RETRIES; i += 1) {
      state = acknowledgeDirective(state, "Something entirely unrelated about hobbies");
    }
    expect(state.pendingDirective).toBeNull();
    expect(state.ignoredDirectives).toBeGreaterThan(MAX_DIRECTIVE_RETRIES);
  });

  it("does not require confirmation for a directive that moves nothing", () => {
    const state = baseState({
      pendingDirective: {
        reason: "PROBE_DEEPER",
        topicId: null,
        topicLabel: null,
        issuedAtMs: 0,
        retries: 0,
      },
    });
    expect(acknowledgeDirective(state, "Any question at all").pendingDirective).toBeNull();
  });

  it("defers the topic change when the directive is issued", () => {
    const state = baseState();
    const target = state.plan[3];
    const applied = applyDirective(state, {
      reason: "TOPIC_TRANSITION",
      text: "x",
      nextTopicId: target.id,
    });

    // Issued, not committed.
    expect(applied.currentTopicId).toBe(state.currentTopicId);
    expect(applied.pendingDirective?.topicId).toBe(target.id);
  });

  it("commits only once the question arrives through the reducer", () => {
    const state = baseState();
    const target = state.plan.find((t) => t.label === "Databases") ?? state.plan[3];
    const issued = applyDirective(state, {
      reason: "TOPIC_TRANSITION",
      text: "x",
      nextTopicId: target.id,
    });

    const after = orchestratorReducer(issued, {
      type: "QUESTION_ASKED",
      text: `Tell me about ${target.label}`,
      atMs: 10,
    });
    expect(after.currentTopicId).toBe(target.id);
  });
});

// --- 6. controller log ------------------------------------------------------

describe("controller log", () => {
  it("starts empty", () => {
    expect(createOrchestratorState(planInput()).log).toEqual([]);
  });

  it("records an answer with its strength and topic", () => {
    const after = orchestratorReducer(baseState(), {
      type: "ANSWER_FINALIZED",
      text: REAL_ANSWER,
      atMs: 12_000,
    });

    const entry = after.log.at(-1)!;
    expect(entry.atMs).toBe(12_000);
    expect(entry.answerStrength).toBe("STRONG");
    expect(entry.utterance).toBe("SUBSTANTIVE");
    expect(entry.topicLabel).toBeTruthy();
    expect(entry.difficulty).toBeTruthy();
  });

  it("records a question with the phase it was asked in", () => {
    const after = orchestratorReducer(baseState(), {
      type: "QUESTION_ASKED",
      text: "How does indexing work?",
      atMs: 3_000,
    });
    const entry = after.log.at(-1)!;
    expect(entry.question).toContain("indexing");
    expect(entry.phase).toBeTruthy();
  });

  it("explains why a repeat request changed nothing", () => {
    const after = orchestratorReducer(baseState(), {
      type: "ANSWER_FINALIZED",
      text: "Can you repeat that?",
      atMs: 1,
    });
    expect(after.log.at(-1)?.note).toMatch(/repeat requested/i);
  });

  it("flags a directive the model did not follow", () => {
    const state = baseState({
      pendingDirective: {
        reason: "TOPIC_TRANSITION",
        topicId: "databases",
        topicLabel: "Databases",
        issuedAtMs: 0,
        retries: 0,
      },
    });
    const after = orchestratorReducer(state, {
      type: "QUESTION_ASKED",
      text: "Tell me about your hobbies",
      atMs: 1,
    });
    expect(after.log.at(-1)?.note).toMatch(/not reflected/i);
  });

  it("truncates very long text so the log cannot balloon", () => {
    const after = orchestratorReducer(baseState(), {
      type: "ANSWER_FINALIZED",
      text: "x".repeat(5000),
      atMs: 1,
    });
    expect((after.log.at(-1)?.answer ?? "").length).toBeLessThanOrEqual(300);
  });

  it("is bounded in length over a long interview", () => {
    let state = baseState();
    for (let i = 0; i < 400; i += 1) {
      state = orchestratorReducer(state, {
        type: "QUESTION_ASKED",
        text: `Question number ${i}`,
        atMs: i,
      });
    }
    expect(state.log.length).toBeLessThanOrEqual(200);
  });

  it("never contains the controller instruction text itself", () => {
    // The log carries the reason and the dialogue; the internal instruction
    // stays out of it so it cannot be rendered near the candidate.
    // A shallow answer guarantees a follow-up directive exists to log.
    const state = orchestratorReducer(baseState(), {
      type: "ANSWER_FINALIZED",
      text: "We used PostgreSQL for storage and Redis for the session cache in that project.",
      atMs: 1,
    });
    const directive = decideSteering(state, 60_000);
    expect(directive).not.toBeNull();
    const after = orchestratorReducer(applyDirective(state, directive!), {
      type: "QUESTION_ASKED",
      text: "A question",
      atMs: 1,
    });
    for (const entry of after.log) {
      expect(JSON.stringify(entry)).not.toContain("INTERVIEW CONTROLLER");
    }
  });
});

// --- 4. conversational boundary ordering ------------------------------------

describe("steering happens at the right boundary", () => {
  it("a finalized answer produces a decision before the next question", () => {
    // question → answer → decision → next question
    let state = baseState({ questionCount: 1, currentTopicId: baseState().plan[0].id });

    state = orchestratorReducer(state, {
      type: "QUESTION_ASKED",
      text: "How does database indexing work?",
      atMs: 1_000,
    });
    state = orchestratorReducer(state, {
      type: "ANSWER_FINALIZED",
      // Long enough to be substantive, but states what was done without ever
      // saying why — the case that must draw a probe rather than a move-on.
      text: "We put an index on the user table and we also added one on the orders table, and then we deployed that change to production the same week.",
      atMs: 8_000,
    });

    const directive = decideSteering(state, 9_000);
    expect(directive).not.toBeNull();
    // Claim without reasoning → probe it rather than moving on.
    expect(["FOLLOW_UP_REQUIRED", "PROBE_OPEN_THREAD"]).toContain(directive!.reason);
  });

  it("produces no decision from a question alone", () => {
    const state = orchestratorReducer(
      baseState({ questionCount: 1, lastAnswer: null, currentTopicId: baseState().plan[0].id }),
      { type: "QUESTION_ASKED", text: "How does indexing work?", atMs: 1_000 },
    );
    // Nothing has been answered, so there is nothing to react to; the only
    // reason to speak would be a transition the plan does not yet warrant.
    const directive = decideSteering(state, 2_000);
    expect(directive?.reason).not.toBe("FOLLOW_UP_REQUIRED");
    expect(directive?.reason).not.toBe("PROBE_DEEPER");
  });
});
