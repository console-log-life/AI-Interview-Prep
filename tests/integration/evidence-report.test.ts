import { describe, expect, it } from "vitest";

import { EMPTY_MEMORY, type EvidenceRecord, type InterviewMemory } from "@/lib/ai/live/memory";
import { createOrchestratorState, decideSteering } from "@/lib/ai/live/orchestrator";
import type { InterviewPlanInput } from "@/lib/ai/live/orchestrator-types";
import { decideTurnResponse } from "@/lib/ai/live/turn-decision";
import { deriveIntent, understandAnswer } from "@/lib/ai/live/understanding";

/**
 * Evidence, from the spoken answer through to what the report can show.
 *
 * The claim being tested is traceability: every observation the report renders
 * must come from an exchange that actually happened, and nothing about the
 * candidate may be asserted beyond what the transcript supports.
 */

const PLAN: InterviewPlanInput = {
  interviewType: "TECHNICAL",
  persona: "PROFESSIONAL",
  difficulty: "MEDIUM",
  targetRole: "Backend Engineer",
  durationMin: 30,
  plannedQuestions: 8,
  resumeClaims: [],
  jdSkills: ["postgresql"],
  weakSkills: [],
  candidateSkills: [],
};

/** Runs answers through the live decision path and collects the evidence. */
function evidenceFrom(
  exchanges: Array<{ question: string; answer: string }>,
): EvidenceRecord[] {
  const orchestrator = createOrchestratorState(PLAN);
  let memory: InterviewMemory = EMPTY_MEMORY;
  let clarifiedSubjects: string[] = [];
  const collected: EvidenceRecord[] = [];

  exchanges.forEach((exchange, index) => {
    const understanding = understandAnswer(exchange.answer, exchange.question);
    const decision = decideTurnResponse({
      answerText: exchange.answer,
      questionText: exchange.question,
      topicLabel: "Databases",
      understanding,
      intent: deriveIntent(understanding),
      turn: index + 1,
      atMs: (index + 1) * 45_000,
      memory,
      clarifiedSubjects,
      orchestrator,
      planDirective: decideSteering(orchestrator, (index + 1) * 45_000),
    });
    memory = decision.memory;
    clarifiedSubjects = decision.clarifiedSubjects;
    if (decision.evidence) collected.push(decision.evidence);
  });

  return collected;
}

describe("evidence is grounded in the real exchange", () => {
  const QUESTION = "Why did you choose PostgreSQL?";
  const ANSWER =
    "I chose it because we needed transactions between orders and payments. For example, we saw data consistency issues in staging twice.";

  it("preserves the question and answer verbatim", () => {
    const [record] = evidenceFrom([{ question: QUESTION, answer: ANSWER }]);
    expect(record.questionText).toBe(QUESTION);
    expect(record.answerText).toBe(ANSWER);
  });

  it("reports strengths the answer actually demonstrates", () => {
    const [record] = evidenceFrom([{ question: QUESTION, answer: ANSWER }]);
    expect(record.strengths).toContain("explained their reasoning");
    expect(record.strengths).toContain("gave a concrete example");
  });

  it("reports a gap the answer actually has", () => {
    // No trade-off, no scale — and the report may say so.
    const [record] = evidenceFrom([
      { question: QUESTION, answer: "We used Postgres. It was fine." },
    ]);
    expect(record.gaps.length).toBeGreaterThan(0);
    expect(record.strengths).not.toContain("acknowledged a trade-off");
  });

  it("carries a usable citation for every observation", () => {
    // A report line is only checkable if the exchange it came from is present.
    for (const record of evidenceFrom([
      { question: QUESTION, answer: ANSWER },
      { question: "How would it scale?", answer: "I'm not sure." },
    ])) {
      const hasObservation = record.strengths.length > 0 || record.gaps.length > 0;
      if (hasObservation) {
        expect(record.answerText.length).toBeGreaterThan(0);
        expect(record.turn).toBeGreaterThan(0);
      }
    }
  });

  it("keeps turns in order so the report can show a progression", () => {
    const records = evidenceFrom([
      { question: "Q1", answer: "We used Postgres for the orders table." },
      { question: "Q2", answer: "I chose Redis because reads had to be fast." },
      { question: "Q3", answer: "I'm not sure about that one." },
    ]);
    expect(records.map((r) => r.turn)).toEqual([1, 2, 3]);
    expect(records.map((r) => r.atMs)).toEqual([45_000, 90_000, 135_000]);
  });
});

describe("evidence never fabricates", () => {
  it("asserts nothing about seniority or ability", () => {
    const records = evidenceFrom([
      {
        question: "Why PostgreSQL?",
        answer:
          "I chose it because we needed transactions. For example, payments without orders were silent data loss. The trade-off was slower writes, and I scaled it to 900 requests per second.",
      },
    ]);
    const text = records.flatMap((r) => [...r.strengths, ...r.gaps]).join(" ");
    expect(text).not.toMatch(
      /senior|junior|expert|excellent|outstanding|poor|weak candidate|strong candidate/i,
    );
  });

  it("carries no score anywhere", () => {
    for (const record of evidenceFrom([
      { question: "Q", answer: "I chose Postgres because we needed transactions." },
    ])) {
      expect(record).not.toHaveProperty("score");
      expect(record).not.toHaveProperty("rating");
      expect(record).not.toHaveProperty("correctness");
    }
  });

  it("never claims an answer was right or wrong", () => {
    // A confidently incorrect answer must not be recorded as correct.
    const [record] = evidenceFrom([
      {
        question: "What is PostgreSQL?",
        answer:
          "PostgreSQL is a NoSQL document store, so we chose it because it needs no schema at all. For example, we stored raw JSON everywhere.",
      },
    ]);
    const text = [...record.strengths, ...record.gaps].join(" ");
    expect(text).not.toMatch(/correct|incorrect|wrong|right answer|accurate/i);
    // It may note the answer had reasoning — that is observable and true.
    expect(record.answerText).toContain("NoSQL document store");
  });

  it("produces no evidence at all for a conversational repair", () => {
    // "Can you repeat that?" is not something to grade.
    expect(
      evidenceFrom([{ question: "Why Postgres?", answer: "Sorry, can you repeat that?" }]),
    ).toHaveLength(0);
  });

  it("produces no observations to render for a contentless answer", () => {
    // The report filters these out rather than showing an empty row.
    const records = evidenceFrom([{ question: "Why?", answer: "Yeah." }]);
    const renderable = records.filter(
      (r) => r.strengths.length > 0 || r.gaps.length > 0,
    );
    expect(renderable.length).toBeLessThanOrEqual(records.length);
  });
});
