import { describe, expect, it } from "vitest";

import {
  DIFFICULTY_EVIDENCE,
  EXCHANGES_TO_COVER,
  MAX_FOLLOW_UPS_PER_TOPIC,
  NO_NEW_TOPIC_AFTER,
  analyzeAnswer,
  applyDirective,
  buildPlan,
  controllerBlock,
  createOrchestratorState,
  decideSteering,
  isRepeatQuestion,
  nextDifficulty,
  normalizeQuestion,
  orchestratorReducer,
  selectNextTopic,
} from "@/lib/ai/live/orchestrator";
import type {
  InterviewPlanInput,
  OrchestratorState,
} from "@/lib/ai/live/orchestrator-types";

/**
 * The interview orchestrator.
 *
 * This is where "behaves like a real interview" is actually decided, so it is
 * tested as logic rather than left to a prompt and hoped for. No Gemini calls.
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

function stateWith(overrides: Partial<OrchestratorState> = {}): OrchestratorState {
  return { ...createOrchestratorState(planInput()), startedAtMs: 0, ...overrides };
}

const STRONG_ANSWER =
  "We chose PostgreSQL because we needed real transactions across the orders and payments tables, and eventual consistency would have let us take money without recording the order. The trade-off was that horizontal scaling is harder than with Mongo, so we added read replicas for the reporting queries. For example, that took p95 from about 400ms down to 60ms.";

const WEAK_ANSWER = "I don't know, I've never really used that.";
const SHALLOW_ANSWER = "We used PostgreSQL for the database and it worked well for us.";

// --- answer analysis --------------------------------------------------------

describe("analyzeAnswer", () => {
  it("rates a justified, concrete answer as strong", () => {
    const signal = analyzeAnswer(STRONG_ANSWER);
    expect(signal.strength).toBe("STRONG");
    expect(signal.hasJustification).toBe(true);
    expect(signal.hasConcreteDetail).toBe(true);
  });

  it("rates an explicit admission of ignorance as weak", () => {
    const signal = analyzeAnswer(WEAK_ANSWER);
    expect(signal.strength).toBe("WEAK");
    expect(signal.admitsUncertainty).toBe(true);
  });

  it("rates a very short answer as weak", () => {
    expect(analyzeAnswer("Yes, indexes.").strength).toBe("WEAK");
  });

  it("treats nothing as EMPTY rather than weak", () => {
    expect(analyzeAnswer("   ").strength).toBe("EMPTY");
  });

  it("extracts technologies the candidate named", () => {
    const signal = analyzeAnswer("I used React on the front end with a Node.js API and Redis for caching.");
    expect(signal.mentionedTechnologies).toEqual(
      expect.arrayContaining(["react", "redis"]),
    );
  });

  it("does not claim a technology that was not mentioned", () => {
    const signal = analyzeAnswer("I built a small website for my college.");
    expect(signal.mentionedTechnologies).toHaveLength(0);
  });

  it("detects reasoning versus mere description", () => {
    expect(analyzeAnswer(SHALLOW_ANSWER).hasJustification).toBe(false);
    expect(analyzeAnswer(STRONG_ANSWER).hasJustification).toBe(true);
  });

  it("reports no confidence or emotion signal at all", () => {
    // Nothing in a transcript supports those claims; inventing them is the
    // fabricated metric this product refuses to ship.
    const signal = analyzeAnswer(STRONG_ANSWER);
    expect(signal).not.toHaveProperty("confidence");
    expect(signal).not.toHaveProperty("nervousness");
  });
});

// --- planning ---------------------------------------------------------------

describe("buildPlan", () => {
  it("always opens with introduction and background", () => {
    const plan = buildPlan(planInput());
    expect(plan[0].phase).toBe("INTRO");
    expect(plan[1].phase).toBe("BACKGROUND");
  });

  it("includes resume claims as high-priority topics", () => {
    const plan = buildPlan(
      planInput({ resumeClaims: [{ id: "c1", text: "Built a Node.js payments API" }] }),
    );
    const claim = plan.find((topic) => topic.source === "RESUME");
    expect(claim).toBeDefined();
    expect(claim?.priority).toBe("HIGH");
    expect(claim?.phase).toBe("RESUME_DEEP_DIVE");
  });

  it("prioritises the first JD skills highest", () => {
    const plan = buildPlan(planInput({ jdSkills: ["React", "Node.js", "SQL", "AWS", "Docker"] }));
    const jd = plan.filter((topic) => topic.source === "JD");
    expect(jd.slice(0, 3).every((topic) => topic.priority === "HIGH")).toBe(true);
    expect(jd[3].priority).toBe("MEDIUM");
  });

  it("includes measured weak skills so the interview probes them", () => {
    const plan = buildPlan(planInput({ weakSkills: ["SQL joins"] }));
    expect(plan.some((topic) => topic.source === "WEAK_SKILL")).toBe(true);
  });

  it("never duplicates a topic that appears in two sources", () => {
    const plan = buildPlan(
      planInput({ jdSkills: ["Databases"], weakSkills: ["Databases"], candidateSkills: ["Databases"] }),
    );
    const ids = plan.map((topic) => topic.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("routes a system-design round to the system-design phase", () => {
    const plan = buildPlan(planInput({ interviewType: "SYSTEM_DESIGN", jdSkills: ["Scaling"] }));
    expect(plan.some((topic) => topic.phase === "SYSTEM_DESIGN")).toBe(true);
  });

  it("adds behavioural topics outside a pure coding round", () => {
    expect(buildPlan(planInput({ interviewType: "MIXED" })).some((t) => t.phase === "BEHAVIORAL")).toBe(true);
    expect(buildPlan(planInput({ interviewType: "CODING" })).some((t) => t.phase === "BEHAVIORAL")).toBe(false);
  });

  it("produces a usable plan with no resume, JD or skills", () => {
    const plan = buildPlan(planInput());
    expect(plan.length).toBeGreaterThan(3);
    expect(plan.every((topic) => topic.coverage === "NOT_STARTED")).toBe(true);
  });
});

// --- coverage ---------------------------------------------------------------

describe("topic coverage", () => {
  function answerOnTopic(state: OrchestratorState, text: string, times = 1) {
    let next = state;
    for (let i = 0; i < times; i += 1) {
      next = orchestratorReducer(next, { type: "ANSWER_FINALIZED", text, atMs: 1000 });
    }
    return next;
  }

  it("does not mark a topic covered after a single answer", () => {
    // One question is not evidence of understanding.
    const base = stateWith({ currentTopicId: stateWith().plan[0].id });
    const after = answerOnTopic(base, STRONG_ANSWER, 1);
    const topic = after.plan.find((t) => t.id === base.currentTopicId);
    expect(topic?.coverage).toBe("PARTIAL");
  });

  it("marks a topic strong after repeated strong answers", () => {
    const base = stateWith({ currentTopicId: stateWith().plan[0].id });
    const after = answerOnTopic(base, STRONG_ANSWER, EXCHANGES_TO_COVER);
    const topic = after.plan.find((t) => t.id === base.currentTopicId);
    expect(topic?.coverage).toBe("STRONG");
  });

  it("marks a topic weak after repeated weak answers", () => {
    const base = stateWith({ currentTopicId: stateWith().plan[0].id });
    const after = answerOnTopic(base, WEAK_ANSWER, EXCHANGES_TO_COVER);
    const topic = after.plan.find((t) => t.id === base.currentTopicId);
    expect(topic?.coverage).toBe("WEAK");
    expect(after.weakTopicIds).toContain(base.currentTopicId);
  });

  it("ignores an empty answer entirely", () => {
    const base = stateWith({ currentTopicId: stateWith().plan[0].id });
    const after = answerOnTopic(base, "   ");
    expect(after.answeredQuestions).toBe(0);
  });
});

// --- follow-up engine -------------------------------------------------------

describe("follow-up engine", () => {
  function withTopic(overrides: Partial<OrchestratorState> = {}) {
    const base = createOrchestratorState(planInput());
    return {
      ...base,
      startedAtMs: 0,
      currentTopicId: base.plan[2]?.id ?? base.plan[0].id,
      questionCount: 2,
      ...overrides,
    };
  }

  it("requires a follow-up when a claim has no reasoning", () => {
    const state = { ...withTopic(), lastAnswer: analyzeAnswer(SHALLOW_ANSWER) };
    const directive = decideSteering(state, 60_000);
    expect(directive?.reason).toBe("FOLLOW_UP_REQUIRED");
    expect(directive?.text).toMatch(/reasoning|why|justification/i);
  });

  it("probes deeper after a strong answer instead of moving on", () => {
    const state = { ...withTopic(), lastAnswer: analyzeAnswer(STRONG_ANSWER) };
    const directive = decideSteering(state, 60_000);
    expect(directive?.reason).toBe("PROBE_DEEPER");
    expect(directive?.text).toMatch(/trade-off|edge case|deeper|scale/i);
  });

  it("simplifies after a weak answer rather than jumping topic", () => {
    const state = { ...withTopic(), lastAnswer: analyzeAnswer(WEAK_ANSWER) };
    const directive = decideSteering(state, 60_000);
    expect(directive?.reason).toBe("SIMPLIFY");
    expect(directive?.text).toMatch(/simpler|foundational/i);
  });

  it("does not praise or sympathise when simplifying", () => {
    const state = { ...withTopic(), lastAnswer: analyzeAnswer(WEAK_ANSWER) };
    const directive = decideSteering(state, 60_000);
    expect(directive?.text).toMatch(/without praise/i);
  });

  it("stops following up once the per-topic limit is reached", () => {
    const state = {
      ...withTopic({ followUpsOnTopic: MAX_FOLLOW_UPS_PER_TOPIC }),
      lastAnswer: analyzeAnswer(SHALLOW_ANSWER),
    };
    const directive = decideSteering(state, 60_000);
    expect(directive?.reason).not.toBe("FOLLOW_UP_REQUIRED");
    expect(directive?.reason).not.toBe("PROBE_DEEPER");
  });

  it("counts follow-ups and resets them on a transition", () => {
    const base = withTopic();
    const followUp = applyDirective(base, {
      reason: "PROBE_DEEPER",
      text: "x",
    });
    expect(followUp.followUpsOnTopic).toBe(1);

    const moved = applyDirective(followUp, {
      reason: "TOPIC_TRANSITION",
      text: "x",
      nextTopicId: "other-topic",
    });
    expect(moved.followUpsOnTopic).toBe(0);
  });
});

// --- contextual follow-up ---------------------------------------------------

/**
 * Persona as pressure, not just tone.
 *
 * Tone lived in the prompt and timing in `silenceDurationMs`, but the
 * controller used one global follow-up budget for every persona — so a warm
 * recruiter and a tough senior engineer dug into the same weak answer exactly
 * as many times. The persona was a label on identical behaviour.
 *
 * What is pinned here is that the budget differs *and* that PROFESSIONAL still
 * behaves exactly as it did before the persona reached the controller.
 */
describe("persona sets how hard one topic is pressed", () => {
  function pressing(persona: InterviewPlanInput["persona"], followUpsOnTopic: number) {
    const base = createOrchestratorState(planInput({ persona }));
    return decideSteering(
      {
        ...base,
        startedAtMs: 0,
        currentTopicId: base.plan[2]?.id ?? base.plan[0].id,
        questionCount: 2,
        followUpsOnTopic,
        lastAnswer: analyzeAnswer(WEAK_ANSWER),
      },
      60_000,
    );
  }

  /** A follow-up directive, as opposed to moving the interview on. */
  function isFollowUp(reason: string | undefined): boolean {
    return reason === "SIMPLIFY" || reason === "FOLLOW_UP_REQUIRED";
  }

  it("carries the persona onto the state", () => {
    expect(createOrchestratorState(planInput({ persona: "STRICT" })).persona).toBe(
      "STRICT",
    );
  });

  it("presses a weak answer once as FRIENDLY, then moves on", () => {
    expect(isFollowUp(pressing("FRIENDLY", 0)?.reason)).toBe(true);
    // Budget of one: a warm recruiter screen does not cross-examine.
    expect(isFollowUp(pressing("FRIENDLY", 1)?.reason)).toBe(false);
  });

  it("keeps the previous behaviour for PROFESSIONAL", () => {
    // The regression that matters: PROFESSIONAL was the old global default of
    // 2, and an existing demo must behave identically.
    expect(isFollowUp(pressing("PROFESSIONAL", 0)?.reason)).toBe(true);
    expect(isFollowUp(pressing("PROFESSIONAL", 1)?.reason)).toBe(true);
    expect(isFollowUp(pressing("PROFESSIONAL", 2)?.reason)).toBe(false);
  });

  it("presses further as STRICT than as PROFESSIONAL", () => {
    expect(isFollowUp(pressing("STRICT", 2)?.reason)).toBe(true);
    expect(isFollowUp(pressing("STRICT", 3)?.reason)).toBe(false);
  });

  it("presses as hard under STRESS as under STRICT, and no harder", () => {
    // Deliberately equal: a fourth consecutive probe stops testing the
    // candidate and starts testing their patience.
    expect(isFollowUp(pressing("STRESS", 2)?.reason)).toBe(true);
    expect(isFollowUp(pressing("STRESS", 3)?.reason)).toBe(false);
  });

  it("orders the personas friendly < professional < strict", () => {
    const budget = (persona: InterviewPlanInput["persona"]) => {
      let spent = 0;
      while (spent < 10 && isFollowUp(pressing(persona, spent)?.reason)) spent += 1;
      return spent;
    };

    expect(budget("FRIENDLY")).toBeLessThan(budget("PROFESSIONAL"));
    expect(budget("PROFESSIONAL")).toBeLessThan(budget("STRICT"));
  });

  it("spends the budget only when an answer leaves something open", () => {
    // A budget, not a quota: a sufficient answer must not be followed up just
    // because the persona is allowed to.
    const base = createOrchestratorState(planInput({ persona: "STRICT" }));
    const directive = decideSteering(
      {
        ...base,
        startedAtMs: 0,
        currentTopicId: base.plan[2]?.id ?? base.plan[0].id,
        questionCount: 2,
        followUpsOnTopic: 0,
        lastAnswer: null,
      },
      60_000,
    );
    expect(isFollowUp(directive?.reason)).toBe(false);
  });
});

describe("contextual follow-up from the candidate's own words", () => {
  it("opens a thread when the candidate names an unprobed technology", () => {
    const base = createOrchestratorState(planInput());
    const after = orchestratorReducer(
      { ...base, startedAtMs: 0, currentTopicId: base.plan[0].id },
      { type: "ANSWER_FINALIZED", text: "I built the API in Node.js and used Redis for sessions.", atMs: 1000 },
    );
    expect(after.openThreads).toEqual(expect.arrayContaining(["redis"]));
  });

  it("steers a question at that specific technology", () => {
    const base = createOrchestratorState(planInput());
    const state: OrchestratorState = {
      ...base,
      startedAtMs: 0,
      questionCount: 3,
      currentTopicId: base.plan[0].id,
      openThreads: ["postgresql"],
      // Adequate and justified: the weak/strong/no-reasoning branches all
      // correctly decline, leaving the open thread as the natural next move.
      lastAnswer: analyzeAnswer(
        "We ran it on a managed instance because the team had no ops capacity, which kept us focused on the product.",
      ),
      followUpsOnTopic: 0,
    };
    const directive = decideSteering(state, 60_000);
    expect(directive?.reason).toBe("PROBE_OPEN_THREAD");
    expect(directive?.text).toContain("postgresql");
  });

  it("does not open a thread for something already asked about", () => {
    const base = createOrchestratorState(planInput());
    const after = orchestratorReducer(
      {
        ...base,
        startedAtMs: 0,
        currentTopicId: base.plan[0].id,
        askedQuestions: [normalizeQuestion("Tell me why you picked redis for that")],
      },
      { type: "ANSWER_FINALIZED", text: "We used Redis because it was fast enough for us.", atMs: 1000 },
    );
    expect(after.openThreads).not.toContain("redis");
  });

  it("consumes a thread once it has been steered at", () => {
    const state = stateWith({ openThreads: ["redis", "kafka"] });
    const after = applyDirective(state, { reason: "PROBE_OPEN_THREAD", text: "x" });
    expect(after.openThreads).toEqual(["kafka"]);
  });
});

// --- difficulty -------------------------------------------------------------

describe("adaptive difficulty", () => {
  it("does not move on a single answer", () => {
    expect(nextDifficulty("MEDIUM", ["STRONG"])).toBe("MEDIUM");
    expect(nextDifficulty("MEDIUM", ["WEAK"])).toBe("MEDIUM");
  });

  it("raises difficulty after consecutive strong answers", () => {
    expect(nextDifficulty("MEDIUM", Array(DIFFICULTY_EVIDENCE).fill("STRONG"))).toBe("HARD");
  });

  it("lowers difficulty after consecutive weak answers", () => {
    expect(nextDifficulty("HARD", Array(DIFFICULTY_EVIDENCE).fill("WEAK"))).toBe("MEDIUM");
  });

  it("does not oscillate on mixed evidence", () => {
    expect(nextDifficulty("MEDIUM", ["STRONG", "WEAK"])).toBe("MEDIUM");
    expect(nextDifficulty("MEDIUM", ["WEAK", "ADEQUATE"])).toBe("MEDIUM");
  });

  it("never moves past the ends of the ladder", () => {
    expect(nextDifficulty("HARD", ["STRONG", "STRONG", "STRONG"])).toBe("HARD");
    expect(nextDifficulty("EASY", ["WEAK", "WEAK", "WEAK"])).toBe("EASY");
  });
});

// --- resume grounding -------------------------------------------------------

describe("resume grounding", () => {
  const claims = [{ id: "c1", text: "Built a scalable Node.js API for order processing" }];

  it("steers at an undiscussed resume claim using its own wording", () => {
    const base = createOrchestratorState(planInput({ resumeClaims: claims }));
    const claimTopic = base.plan.find((topic) => topic.source === "RESUME");
    const state: OrchestratorState = {
      ...base,
      startedAtMs: 0,
      questionCount: 2,
      currentTopicId: base.plan[0].id,
      plan: base.plan.map((t) =>
        t.phase === "INTRO" || t.phase === "BACKGROUND"
          ? { ...t, coverage: "COVERED" as const }
          : t,
      ),
      lastAnswer: analyzeAnswer(STRONG_ANSWER),
      followUpsOnTopic: MAX_FOLLOW_UPS_PER_TOPIC,
    };

    const directive = decideSteering(state, 60_000);
    expect(directive?.reason).toBe("PROBE_RESUME_CLAIM");
    expect(directive?.text).toContain("Node.js API");
    expect(directive?.nextTopicId).toBe(claimTopic?.id);
  });

  it("instructs the model not to invent resume detail", () => {
    const base = createOrchestratorState(planInput({ resumeClaims: claims }));
    const state: OrchestratorState = {
      ...base,
      startedAtMs: 0,
      questionCount: 2,
      currentTopicId: base.plan[0].id,
      plan: base.plan.map((t) =>
        t.phase === "INTRO" || t.phase === "BACKGROUND"
          ? { ...t, coverage: "COVERED" as const }
          : t,
      ),
      lastAnswer: analyzeAnswer(STRONG_ANSWER),
      followUpsOnTopic: MAX_FOLLOW_UPS_PER_TOPIC,
    };
    expect(decideSteering(state, 60_000)?.text).toMatch(/do not invent/i);
  });

  it("marks a claim discussed once answered, so it is not re-asked", () => {
    const base = createOrchestratorState(planInput({ resumeClaims: claims }));
    const claimTopic = base.plan.find((topic) => topic.source === "RESUME")!;
    const after = orchestratorReducer(
      { ...base, startedAtMs: 0, currentTopicId: claimTopic.id },
      { type: "ANSWER_FINALIZED", text: STRONG_ANSWER, atMs: 1000 },
    );
    expect(after.resumeClaims[0].status).toBe("DISCUSSED");
  });

  it("has no resume claims when the candidate has no resume", () => {
    expect(createOrchestratorState(planInput()).resumeClaims).toEqual([]);
  });
});

// --- JD grounding -----------------------------------------------------------

describe("JD grounding", () => {
  it("tracks required skills with priority", () => {
    const state = createOrchestratorState(planInput({ jdSkills: ["React", "Node.js", "SQL", "AWS"] }));
    expect(state.jdSkills[0]).toMatchObject({ label: "React", priority: "HIGH", coverage: "NOT_STARTED" });
    expect(state.jdSkills[3].priority).toBe("MEDIUM");
  });

  it("selects a high-priority JD skill before a low-priority filler topic", () => {
    const state = createOrchestratorState(
      planInput({ jdSkills: ["Kubernetes"], candidateSkills: ["Photoshop"] }),
    );
    // Intro/background come first by phase; among technical topics the JD wins.
    const technical = state.plan.filter((t) => t.phase === "TECHNICAL");
    expect(technical[0].source).toBe("JD");
  });

  it("advances JD coverage when its topic is answered", () => {
    const base = createOrchestratorState(planInput({ jdSkills: ["Kubernetes"] }));
    const jdTopic = base.plan.find((t) => t.source === "JD")!;
    const after = orchestratorReducer(
      { ...base, startedAtMs: 0, currentTopicId: jdTopic.id },
      { type: "ANSWER_FINALIZED", text: STRONG_ANSWER, atMs: 1000 },
    );
    expect(after.jdSkills[0].coverage).not.toBe("NOT_STARTED");
  });
});

// --- repetition -------------------------------------------------------------

describe("repetition prevention", () => {
  it("detects an exact repeat", () => {
    const asked = [normalizeQuestion("Explain how database indexing works")];
    expect(isRepeatQuestion("Explain how database indexing works?", asked)).toBe(true);
  });

  it("detects a reworded repeat", () => {
    const asked = [normalizeQuestion("Can you explain how database indexing works")];
    expect(isRepeatQuestion("Explain database indexing works please", asked)).toBe(true);
  });

  it("does not flag a genuinely different question", () => {
    const asked = [normalizeQuestion("Explain how database indexing works")];
    expect(isRepeatQuestion("Tell me about a time you disagreed with a colleague", asked)).toBe(false);
  });

  it("records every asked question for later comparison", () => {
    const after = orchestratorReducer(stateWith(), {
      type: "QUESTION_ASKED",
      text: "What is a hash table?",
      atMs: 1,
    });
    expect(after.askedQuestions).toHaveLength(1);
    expect(after.questionCount).toBe(1);
  });

  it("ignores an empty question", () => {
    const after = orchestratorReducer(stateWith(), { type: "QUESTION_ASKED", text: "  ", atMs: 1 });
    expect(after.askedQuestions).toHaveLength(0);
  });
});

// --- time management --------------------------------------------------------

describe("time-aware orchestration", () => {
  it("opens no new topic in the final stretch", () => {
    const state = stateWith();
    const late = selectNextTopic(state, NO_NEW_TOPIC_AFTER + 0.05);
    // Nothing is PARTIAL yet, so there is nothing safe to continue.
    expect(late).toBeNull();
  });

  it("still continues a topic already in progress near the end", () => {
    const base = createOrchestratorState(planInput());
    const state = {
      ...base,
      plan: base.plan.map((t, i) => (i === 2 ? { ...t, coverage: "PARTIAL" as const } : t)),
    };
    expect(selectNextTopic(state, 0.9)?.coverage).toBe("PARTIAL");
  });

  it("closes the interview once the time budget is nearly spent", () => {
    const state = stateWith({ questionCount: 5, durationMs: 60_000 });
    const directive = decideSteering(state, 59_000);
    expect(directive?.reason).toBe("CLOSE_INTERVIEW");
    expect(directive?.nextPhase).toBe("CLOSING");
  });

  it("tells the model not to cut the candidate off mid-answer", () => {
    const state = stateWith({ questionCount: 5, durationMs: 60_000 });
    expect(decideSteering(state, 59_000)?.text).toMatch(/finish anything they are saying/i);
  });

  it("closes when every planned topic is exhausted", () => {
    const base = createOrchestratorState(planInput());
    const state: OrchestratorState = {
      ...base,
      startedAtMs: 0,
      questionCount: 9,
      plan: base.plan.map((t) => ({ ...t, coverage: "COVERED" as const })),
      lastAnswer: null,
    };
    expect(decideSteering(state, 10_000)?.reason).toBe("CLOSE_INTERVIEW");
  });
});

// --- opening and closing ----------------------------------------------------

describe("opening", () => {
  it("emits an opening directive before any question", () => {
    const directive = decideSteering(stateWith(), 0);
    expect(directive?.reason).toBe("OPENING");
  });

  it("asks for greeting, audio check, framing and an introduction", () => {
    const text = decideSteering(stateWith(), 0)!.text;
    expect(text).toMatch(/greet/i);
    expect(text).toMatch(/hear you/i);
    expect(text).toMatch(/introduce themselves/i);
  });
});

describe("closing", () => {
  it("forbids scores or a verdict during the interview", () => {
    const state = stateWith({ questionCount: 5, durationMs: 60_000 });
    const text = decideSteering(state, 59_000)!.text;
    expect(text).toMatch(/do not give scores/i);
  });

  it("marks the interview completed when the candidate ends it", () => {
    const after = orchestratorReducer(stateWith(), { type: "END_REQUESTED" });
    expect(after.phase).toBe("COMPLETED");
    expect(after.closingRequested).toBe(true);
  });

  it("ignores further events once completed", () => {
    const completed = orchestratorReducer(stateWith(), { type: "END_REQUESTED" });
    const after = orchestratorReducer(completed, {
      type: "ANSWER_FINALIZED",
      text: STRONG_ANSWER,
      atMs: 1,
    });
    expect(after.answeredQuestions).toBe(0);
  });
});

// --- interruption -----------------------------------------------------------

describe("interruption", () => {
  it("does not count an interruption as an answer", () => {
    const after = orchestratorReducer(stateWith(), { type: "INTERRUPTION" });
    expect(after.answeredQuestions).toBe(0);
    expect(after.exchangesSinceTransition).toBe(0);
  });

  it("leaves coverage untouched", () => {
    const base = stateWith({ currentTopicId: stateWith().plan[0].id });
    const after = orchestratorReducer(base, { type: "INTERRUPTION" });
    expect(after.plan).toEqual(base.plan);
  });
});

// --- controller block -------------------------------------------------------

describe("controller block", () => {
  it("marks itself internal so it is never read aloud", () => {
    const block = controllerBlock({ phase: "TECHNICAL", instruction: "Ask about indexing." });
    expect(block).toMatch(/do not read aloud/i);
  });

  it("describes intent rather than dictating a sentence", () => {
    // Prescribed wording is what makes an interviewer sound robotic.
    const state = { ...stateWith({ questionCount: 2, currentTopicId: stateWith().plan[0].id }), lastAnswer: analyzeAnswer(STRONG_ANSWER) };
    const text = decideSteering(state, 60_000)!.text;
    expect(text).toMatch(/speak naturally in your own words/i);
    expect(text).not.toMatch(/say exactly|ask exactly/i);
  });

  it("includes the phase and topic it applies to", () => {
    const block = controllerBlock({ phase: "BEHAVIORAL", topic: "Teamwork", instruction: "Probe it." });
    expect(block).toContain("Phase: BEHAVIORAL");
    expect(block).toContain("Topic: Teamwork");
  });
});

// --- end-to-end shape -------------------------------------------------------

describe("a full interview progresses and terminates", () => {
  it("moves through phases and reaches closing without repeating itself", () => {
    let state = createOrchestratorState(
      planInput({ durationMin: 10, jdSkills: ["Databases", "APIs"] }),
    );
    state = { ...state, startedAtMs: 0 };

    const reasons: string[] = [];
    let now = 0;

    for (let turn = 0; turn < 40; turn += 1) {
      const directive = decideSteering(state, now);
      if (!directive) {
        state = orchestratorReducer(state, {
          type: "ANSWER_FINALIZED",
          text: STRONG_ANSWER,
          atMs: now,
        });
        now += 20_000;
        continue;
      }

      reasons.push(directive.reason);
      state = applyDirective(state, directive);
      if (directive.reason === "CLOSE_INTERVIEW") break;

      state = orchestratorReducer(state, {
        type: "QUESTION_ASKED",
        text: `Question about ${state.currentTopicId} number ${turn}`,
        atMs: now,
      });
      state = orchestratorReducer(state, {
        type: "ANSWER_FINALIZED",
        text: STRONG_ANSWER,
        atMs: now,
      });
      now += 20_000;
    }

    expect(reasons[0]).toBe("OPENING");
    expect(reasons).toContain("CLOSE_INTERVIEW");
    // No question text was reused.
    expect(new Set(state.askedQuestions).size).toBe(state.askedQuestions.length);
  });

  it("a struggling candidate gets simplification, not escalation", () => {
    let state = createOrchestratorState(planInput({ difficulty: "HARD" }));
    state = { ...state, startedAtMs: 0, questionCount: 2, currentTopicId: state.plan[0].id };

    for (let i = 0; i < 3; i += 1) {
      state = orchestratorReducer(state, {
        type: "ANSWER_FINALIZED",
        text: WEAK_ANSWER,
        atMs: 1000 * i,
      });
    }

    expect(state.difficulty).not.toBe("HARD");
    expect(state.weakTopicIds.length).toBeGreaterThan(0);
  });
});
