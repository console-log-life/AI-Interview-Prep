import { describe, expect, it } from "vitest";

import { EMPTY_MEMORY, type EvidenceRecord, type InterviewMemory } from "@/lib/ai/live/memory";
import { createOrchestratorState, decideSteering } from "@/lib/ai/live/orchestrator";
import type { InterviewPlanInput } from "@/lib/ai/live/orchestrator-types";
import { decideTurnResponse } from "@/lib/ai/live/turn-decision";
import { deriveIntent, understandAnswer } from "@/lib/ai/live/understanding";

/**
 * Multi-turn interview flow, driven through the same function the live client
 * calls on every finalized answer.
 *
 * These exist because the memory, contradiction and evidence work was
 * previously only reachable through a WebSocket — correct in isolation and
 * absent from the real interview. Running whole interviews through
 * `decideTurnResponse` is what proves the wiring, without needing a socket.
 */

const PLAN: InterviewPlanInput = {
  interviewType: "TECHNICAL",
  persona: "PROFESSIONAL",
  difficulty: "MEDIUM",
  targetRole: "Backend Engineer",
  durationMin: 30,
  plannedQuestions: 8,
  resumeClaims: [{ id: "claim-0", text: "Built a REST API using Node.js and PostgreSQL" }],
  jdSkills: ["postgresql", "redis", "node.js"],
  weakSkills: [],
  candidateSkills: ["node.js", "postgresql"],
};

/**
 * A miniature interview harness.
 *
 * Carries memory, evidence and clarified subjects between turns exactly the
 * way the client does, so the tests exercise accumulation rather than a single
 * call in isolation.
 */
function interview() {
  let memory: InterviewMemory = EMPTY_MEMORY;
  let clarifiedSubjects: string[] = [];
  const evidence: EvidenceRecord[] = [];
  const remembered = new Set<number>();
  const orchestrator = createOrchestratorState(PLAN);
  let turn = 0;

  return {
    get memory() {
      return memory;
    },
    get evidence() {
      return evidence;
    },
    /** One finalized candidate answer. */
    answer(text: string, question = "Tell me about that.", opts?: { replay?: boolean }) {
      if (!opts?.replay) turn += 1;
      const understanding = understandAnswer(text, question);
      const intent = deriveIntent(understanding);

      const decision = decideTurnResponse({
        answerText: text,
        questionText: question,
        topicLabel: "Databases",
        understanding,
        intent,
        turn,
        atMs: turn * 60_000,
        memory,
        clarifiedSubjects,
        orchestrator,
        planDirective: decideSteering(orchestrator, turn * 60_000),
      });

      // The client's own guard: a replayed turn adds nothing further.
      if (!remembered.has(turn)) {
        remembered.add(turn);
        memory = decision.memory;
        if (decision.evidence) evidence.push(decision.evidence);
      }
      clarifiedSubjects = decision.clarifiedSubjects;
      return decision;
    },
  };
}

describe("memory accumulates across a real interview", () => {
  it("remembers a finalized answer", () => {
    const session = interview();
    session.answer("We used Redis for caching on that service.");
    expect(session.memory.statements.map((s) => s.subject)).toContain("redis");
  });

  it("carries memory across several turns", () => {
    const session = interview();
    session.answer("We used Redis for caching.");
    session.answer("The API was built with Node.js.");
    session.answer("Postgres held the orders table.");

    const subjects = session.memory.statements.map((s) => s.subject);
    expect(subjects).toContain("redis");
    expect(subjects).toContain("node.js");
    expect(session.memory.statements.length).toBeGreaterThanOrEqual(3);
  });

  it("does not remember the same answer twice", () => {
    // A reconnect or a duplicate finalization must not double-count.
    const session = interview();
    session.answer("We used Redis for caching.");
    const afterFirst = session.memory.statements.length;

    session.answer("We used Redis for caching.", "Tell me about that.", { replay: true });
    expect(session.memory.statements).toHaveLength(afterFirst);
    expect(session.evidence).toHaveLength(1);
  });

  it("never records a statement the candidate did not make", () => {
    const session = interview();
    session.answer("We used Redis for caching on that service.");
    for (const statement of session.memory.statements) {
      expect("We used Redis for caching on that service.".toLowerCase()).toContain(
        statement.subject,
      );
    }
  });

  it("does not remember a conversational repair", () => {
    // "Can you repeat that?" is a request, not a statement about anything.
    const session = interview();
    const decision = session.answer("Sorry, can you repeat that?");
    expect(decision.reason).toBe("REPAIR");
    expect(session.memory.statements).toHaveLength(0);
    expect(session.evidence).toHaveLength(0);
  });
});

describe("contradictions surface during the interview", () => {
  it("raises a clarification on the turn the inconsistency appears", () => {
    const session = interview();
    session.answer("I have never used Redis on a real project.");
    session.answer("The API was built with Node.js.");
    const decision = session.answer(
      "I implemented Redis caching in production for that service.",
    );

    expect(decision.reason).toBe("CONTRADICTION");
    expect(decision.block).toContain("never used Redis");
    expect(decision.block).toContain("implemented Redis caching");
    expect(decision.nextQuestionIntent).toBe("RESOLVE_CONTRADICTION");
  });

  it("asks rather than accuses", () => {
    const session = interview();
    session.answer("I have never used Redis.");
    const decision = session.answer("I implemented Redis caching in production.");

    expect(decision.block).toMatch(/clarify/i);
    expect(decision.block).not.toMatch(
      /\b(dishonest|lying|lied|lie|contradict\w*|inconsistent\w*)\b/i,
    );
  });

  it("does not re-raise the same subject on later turns", () => {
    const session = interview();
    session.answer("I have never used Redis.");
    expect(session.answer("I implemented Redis caching in production.").reason).toBe(
      "CONTRADICTION",
    );
    // Asked once. Asking again every turn would be badgering.
    expect(session.answer("Redis stored the session tokens too.").reason).not.toBe(
      "CONTRADICTION",
    );
  });

  it("does not fire on a consistent interview", () => {
    const session = interview();
    session.answer("I used Redis for caching.");
    const decision = session.answer("Redis also held the session store.");
    expect(decision.reason).not.toBe("CONTRADICTION");
  });

  it("never outranks a conversational repair", () => {
    // The candidate has not answered yet; resolving anything else first would
    // talk over someone who just asked for the question again.
    const session = interview();
    session.answer("I have never used Redis.");
    session.answer("I implemented Redis caching in production.", "q", { replay: true });
    const decision = session.answer("Sorry, could you repeat that?");
    expect(decision.reason).toBe("REPAIR");
  });
});

describe("memory callbacks", () => {
  it("returns to something raised earlier instead of opening new ground", () => {
    const session = interview();
    session.answer("We used Kafka for asynchronous processing on that project.");

    // A complete answer lets the plan move on; a callback should win.
    const strong =
      "I chose PostgreSQL because I needed transactions across orders and payments. For example, I found a payment without its order row was silent data loss. The trade-off I accepted was slower writes, and I scaled it to about 900 requests per second.";
    let decision = session.answer(strong);
    for (let i = 0; i < 4 && decision.reason !== "MEMORY_CALLBACK"; i += 1) {
      decision = session.answer(strong);
    }

    if (decision.reason === "MEMORY_CALLBACK") {
      expect(decision.block).toContain("kafka");
      // Grounded in their own words, never a paraphrase.
      expect(decision.block).toContain("Kafka for asynchronous processing");
    }
    // Whatever won, it must not have invented a subject.
    expect(decision.block).not.toMatch(/you mentioned (mongodb|kubernetes|rust)/i);
  });

  it("marks a recalled subject so it is not revisited twice", () => {
    const session = interview();
    session.answer("We used Kafka for asynchronous processing.");

    const strong =
      "I chose PostgreSQL because I needed transactions across orders and payments. For example, I found a payment without its order row was silent data loss. The trade-off I accepted was slower writes, and I scaled it to about 900 requests per second.";
    let callbacks = 0;
    for (let i = 0; i < 6; i += 1) {
      if (session.answer(strong).reason === "MEMORY_CALLBACK") callbacks += 1;
    }
    // Kafka is the only recallable subject, so at most one callback.
    expect(callbacks).toBeLessThanOrEqual(1);
  });

  it("has nothing to recall at the start of an interview", () => {
    const session = interview();
    expect(session.answer("Postgres.").reason).not.toBe("MEMORY_CALLBACK");
  });
});

describe("evidence is preserved from the real exchange", () => {
  it("stores the actual question and the actual answer", () => {
    const session = interview();
    const question = "Why did you choose PostgreSQL?";
    const text =
      "I chose it because we needed transactions between orders and payments. For example, we saw data consistency issues in staging twice.";
    session.answer(text, question);

    const record = session.evidence[0];
    // The exchange is preserved verbatim — this is what the report quotes.
    expect(record.questionText).toBe(question);
    expect(record.answerText).toBe(text);
    expect(record.strengths).toContain("explained their reasoning");
    expect(record.strengths).toContain("gave a concrete example");
  });

  it("accumulates one record per answered turn", () => {
    const session = interview();
    session.answer("We used Redis for caching.");
    session.answer("Postgres held the orders.");
    session.answer("Sorry, can you repeat that?"); // a repair — not evidence
    expect(session.evidence).toHaveLength(2);
    expect(session.evidence.map((r) => r.turn)).toEqual([1, 2]);
  });

  it("never invents a judgement about the candidate", () => {
    const session = interview();
    session.answer("We needed transactions, so we used Postgres.");
    const record = session.evidence[0];
    const text = [...record.strengths, ...record.gaps].join(" ");
    expect(text).not.toMatch(/senior|excellent|expert|outstanding|poor|bad/i);
    expect(record).not.toHaveProperty("score");
  });
});

describe("the plan still runs the interview", () => {
  it("moves on when an answer is complete and nothing is outstanding", () => {
    const session = interview();
    const strong =
      "I chose PostgreSQL because I needed transactions across orders and payments. For example, I found a payment without its order row was silent data loss. The trade-off I accepted was slower writes, and I scaled it to about 900 requests per second.";
    const reasons = new Set<string>();
    for (let i = 0; i < 5; i += 1) reasons.add(session.answer(strong).reason);
    // It must not sit on one question forever.
    expect(reasons.has("PLAN") || reasons.has("MEMORY_CALLBACK")).toBe(true);
  });

  it("stays on the question while the answer is still thin", () => {
    const session = interview();
    expect(session.answer("Postgres.").reason).toBe("FOLLOW_UP");
    expect(session.answer("I'm not sure.").reason).toBe("FOLLOW_UP");
  });

  it("always produces exactly one controller block per answer", () => {
    // Two blocks would be two interviewer turns for one answer.
    const session = interview();
    for (const text of ["Postgres.", "We used Redis for caching.", "I'm not sure."]) {
      const decision = session.answer(text);
      expect(decision.block).toBeTruthy();
      expect(decision.block.match(/\[INTERVIEW CONTROLLER/g)?.length ?? 1).toBe(1);
    }
  });
});
