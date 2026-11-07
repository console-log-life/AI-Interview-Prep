import { describe, expect, it } from "vitest";

import {
  MAX_FOLLOW_UP_DEPTH,
  actionInstruction,
  advanceDepth,
  applyAnswer,
  createInitialState,
  decideNextAction,
  isFollowUpAction,
  nextDifficulty,
  type AnswerSignal,
  type InterviewStateSnapshot,
} from "@/lib/interview/adaptive";

/**
 * The adaptive engine is the highest-risk piece of V2: it decides how long an
 * interview runs and what it asks. These tests exist to prove it terminates,
 * that difficulty never moves on a single answer, and that follow-ups cannot
 * chain forever.
 */

function signal(overrides: Partial<AnswerSignal> = {}): AnswerSignal {
  return {
    score: 6,
    missingPoints: [],
    topic: "Indexing",
    wasFollowUp: false,
    ...overrides,
  };
}

describe("applyAnswer", () => {
  it("moves the skill estimate more on the first answer than on later ones", () => {
    const fresh = createInitialState();
    const first = applyAnswer(fresh, signal({ score: 10 }));

    // alpha 0.6 on turn 0: 50 * 0.4 + 100 * 0.6 = 80
    expect(first.skillEstimate).toBe(80);

    // alpha 0.35 afterwards: 80 * 0.65 + 100 * 0.35 = 87
    const second = applyAnswer(first, signal({ score: 10 }));
    expect(second.skillEstimate).toBe(87);
  });

  it("counts strong and weak streaks separately and resets them", () => {
    let state = createInitialState();
    state = applyAnswer(state, signal({ score: 9 }));
    state = applyAnswer(state, signal({ score: 9 }));
    expect(state.streakStrong).toBe(2);
    expect(state.streakWeak).toBe(0);

    state = applyAnswer(state, signal({ score: 2 }));
    expect(state.streakStrong).toBe(0);
    expect(state.streakWeak).toBe(1);
  });

  it("records a topic as mastered only on a strong answer", () => {
    let state = createInitialState();
    state = applyAnswer(state, signal({ score: 7, topic: "Graphs" }));
    expect(state.masteredTopics).not.toContain("Graphs");

    state = applyAnswer(state, signal({ score: 9, topic: "Graphs" }));
    expect(state.masteredTopics).toContain("Graphs");
  });

  it("clears a struggling topic once it is answered strongly", () => {
    let state = createInitialState();
    state = applyAnswer(state, signal({ score: 2, topic: "Deadlocks" }));
    expect(state.strugglingTopics).toContain("Deadlocks");

    state = applyAnswer(state, signal({ score: 9, topic: "Deadlocks" }));
    expect(state.strugglingTopics).not.toContain("Deadlocks");
  });

  it("resets follow-up depth when the answered question was not a follow-up", () => {
    const state: InterviewStateSnapshot = {
      ...createInitialState(),
      followUpDepth: 2,
    };
    expect(applyAnswer(state, signal({ wasFollowUp: false })).followUpDepth).toBe(0);
    expect(applyAnswer(state, signal({ wasFollowUp: true })).followUpDepth).toBe(2);
  });

  it("retires the exact probe the question came from", () => {
    const state = createInitialState({
      pendingProbes: [
        "Built a payment service handling 2k rps",
        "Job requirement: Kubernetes",
      ],
    });

    const next = applyAnswer(
      state,
      signal({
        topic: "Payments",
        probedClaim: "Built a payment service handling 2k rps",
      }),
    );

    expect(next.pendingProbes).toEqual(["Job requirement: Kubernetes"]);
  });

  it("does not empty the probe queue on a one or two character topic", () => {
    // A topic like "OS" would substring-match almost anything.
    const state = createInitialState({
      pendingProbes: ["Built an OSS logging library", "Job requirement: Redis"],
    });

    const next = applyAnswer(state, signal({ topic: "OS" }));
    expect(next.pendingProbes).toHaveLength(2);
  });

  it("caps confidence at 1 however many turns are taken", () => {
    let state = createInitialState();
    for (let index = 0; index < 20; index += 1) {
      state = applyAnswer(state, signal());
    }
    expect(state.confidence).toBe(1);
  });
});

describe("nextDifficulty", () => {
  it("requires a streak, not a single answer", () => {
    expect(
      nextDifficulty("MEDIUM", { streakStrong: 1, streakWeak: 0 }),
    ).toBe("MEDIUM");
    expect(
      nextDifficulty("MEDIUM", { streakStrong: 2, streakWeak: 0 }),
    ).toBe("HARD");
  });

  it("never moves past the ends of the ladder", () => {
    expect(nextDifficulty("HARD", { streakStrong: 9, streakWeak: 0 })).toBe("HARD");
    expect(nextDifficulty("EASY", { streakStrong: 0, streakWeak: 9 })).toBe("EASY");
  });
});

describe("decideNextAction", () => {
  const base = {
    plannedQuestions: 8,
    questionsAsked: 2,
  };

  it("finishes as soon as the planned question count is reached", () => {
    const action = decideNextAction({
      ...base,
      state: createInitialState(),
      lastSignal: signal(),
      questionsAsked: 8,
    });
    expect(action.type).toBe("FINISH");
  });

  it("finishes even when the count is exceeded", () => {
    const action = decideNextAction({
      ...base,
      state: createInitialState(),
      lastSignal: signal(),
      questionsAsked: 99,
    });
    expect(action.type).toBe("FINISH");
  });

  it("opens with a new topic when there is no prior answer", () => {
    const action = decideNextAction({
      ...base,
      state: createInitialState(),
      lastSignal: null,
      questionsAsked: 0,
    });
    expect(action.type).toBe("NEW_TOPIC");
  });

  it("probes fundamentals after an essentially empty answer", () => {
    const action = decideNextAction({
      ...base,
      state: createInitialState({ currentDifficulty: "MEDIUM" }),
      lastSignal: signal({ score: 1 }),
    });
    expect(action.type).toBe("PROBE_FUNDAMENTALS");
  });

  it("moves on instead of labouring an empty answer at EASY", () => {
    const action = decideNextAction({
      ...base,
      state: createInitialState({ currentDifficulty: "EASY" }),
      lastSignal: signal({ score: 1 }),
    });
    expect(action.type).toBe("NEW_TOPIC");
  });

  it("follows up on a partially correct answer with an identified gap", () => {
    const action = decideNextAction({
      ...base,
      state: createInitialState(),
      lastSignal: signal({ score: 5, missingPoints: ["No mention of locking"] }),
    });
    expect(action.type).toBe("FOLLOW_UP");
  });

  it("does not follow up when no gap was identified", () => {
    const action = decideNextAction({
      ...base,
      state: createInitialState(),
      lastSignal: signal({ score: 5, missingPoints: [] }),
    });
    expect(action.type).not.toBe("FOLLOW_UP");
  });

  it("deepens when consistently strong at the top difficulty", () => {
    const action = decideNextAction({
      ...base,
      state: createInitialState({
        currentDifficulty: "HARD",
        streakStrong: 3,
      }),
      lastSignal: signal({ score: 9 }),
    });
    expect(action.type).toBe("DEEPEN");
  });

  it("probes an unverified resume claim before opening new ground", () => {
    const action = decideNextAction({
      ...base,
      state: createInitialState({
        pendingProbes: ["Built a REST API in Node.js"],
      }),
      lastSignal: signal({ score: 9 }),
    });
    expect(action.type).toBe("PROBE_CLAIM");
    if (action.type === "PROBE_CLAIM") {
      expect(action.claim).toBe("Built a REST API in Node.js");
    }
  });

  it("passes the covered topics along so a new question avoids them", () => {
    const action = decideNextAction({
      ...base,
      state: createInitialState({ coveredTopics: ["Indexing", "Joins"] }),
      lastSignal: signal({ score: 9 }),
    });
    expect(action.type).toBe("NEW_TOPIC");
    if (action.type === "NEW_TOPIC") {
      expect(action.avoidTopics).toEqual(["Indexing", "Joins"]);
    }
  });

  it("stops following up once the depth ceiling is hit", () => {
    const action = decideNextAction({
      ...base,
      state: createInitialState({ followUpDepth: MAX_FOLLOW_UP_DEPTH }),
      lastSignal: signal({ score: 5, missingPoints: ["Missing detail"] }),
    });
    expect(action.type).toBe("NEW_TOPIC");
  });
});

describe("follow-up chains always terminate", () => {
  /**
   * The property that matters: twenty consecutive weak answers with identified
   * gaps — the exact input that would make a naive "always follow up" rule loop
   * forever — must never exceed the depth ceiling, and must reach FINISH.
   */
  it("survives twenty consecutive weak answers without unbounded follow-ups", () => {
    let state = createInitialState();
    let questionsAsked = 1;
    let lastWasFollowUp = false;
    const plannedQuestions = 20;
    const depths: number[] = [];
    const actions: string[] = [];

    for (let turn = 0; turn < 20; turn += 1) {
      const lastSignal = signal({
        score: 3,
        missingPoints: ["Did not explain the trade-off"],
        topic: `Topic ${turn % 4}`,
        wasFollowUp: lastWasFollowUp,
      });

      state = applyAnswer(state, lastSignal);

      const action = decideNextAction({
        state,
        lastSignal,
        plannedQuestions,
        questionsAsked,
      });

      actions.push(action.type);
      if (action.type === "FINISH") break;

      lastWasFollowUp = isFollowUpAction(action);
      state = advanceDepth(state, action);
      depths.push(state.followUpDepth);
      questionsAsked += 1;
    }

    expect(Math.max(...depths)).toBeLessThanOrEqual(MAX_FOLLOW_UP_DEPTH);
    expect(actions).toContain("FINISH");
    expect(questionsAsked).toBeLessThanOrEqual(plannedQuestions);
  });

  it("never lets consecutive follow-ups exceed the ceiling", () => {
    let state = createInitialState();
    let consecutive = 0;
    let maxConsecutive = 0;

    for (let turn = 0; turn < 30; turn += 1) {
      const wasFollowUp = consecutive > 0;
      const lastSignal = signal({
        score: 4,
        missingPoints: ["gap"],
        wasFollowUp,
      });

      state = applyAnswer(state, lastSignal);
      const action = decideNextAction({
        state,
        lastSignal,
        plannedQuestions: 100,
        questionsAsked: turn + 1,
      });

      if (isFollowUpAction(action)) {
        consecutive += 1;
        maxConsecutive = Math.max(maxConsecutive, consecutive);
      } else {
        consecutive = 0;
      }
      state = advanceDepth(state, action);
    }

    expect(maxConsecutive).toBeLessThanOrEqual(MAX_FOLLOW_UP_DEPTH);
  });
});

describe("advanceDepth", () => {
  it("increments only for follow-up style actions", () => {
    const state = createInitialState({ followUpDepth: 1 });

    expect(
      advanceDepth(state, { type: "FOLLOW_UP", reason: "", topic: "x" })
        .followUpDepth,
    ).toBe(2);
    expect(
      advanceDepth(state, { type: "NEW_TOPIC", reason: "", avoidTopics: [] })
        .followUpDepth,
    ).toBe(0);
    expect(
      advanceDepth(state, { type: "PROBE_CLAIM", reason: "", claim: "x" })
        .followUpDepth,
    ).toBe(0);
  });
});

describe("actionInstruction", () => {
  it("gives the model a directive naming the topic for every branch", () => {
    expect(
      actionInstruction({ type: "FOLLOW_UP", reason: "", topic: "Joins" }),
    ).toContain("Joins");
    expect(
      actionInstruction({
        type: "PROBE_FUNDAMENTALS",
        reason: "",
        topic: "Paging",
      }),
    ).toContain("Paging");
    expect(
      actionInstruction({ type: "PROBE_CLAIM", reason: "", claim: "Built X" }),
    ).toContain("Built X");
    expect(
      actionInstruction({
        type: "NEW_TOPIC",
        reason: "",
        avoidTopics: ["Trees"],
      }),
    ).toContain("Trees");
  });

  it("returns nothing for FINISH — there is no question to ask", () => {
    expect(actionInstruction({ type: "FINISH", reason: "" })).toBe("");
  });
});
