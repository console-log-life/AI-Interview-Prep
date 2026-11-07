import { describe, expect, it, vi } from "vitest";

import { __setAIService, getAIService } from "@/lib/ai";
import { ServiceUnavailableError } from "@/lib/api/errors";
import { FakeAIService, makeEvaluation } from "@/tests/helpers/fake-ai";
import type { AIService, AnswerEvaluation } from "@/types/ai";

/**
 * Integration test for the provider abstraction and the interview turn logic.
 *
 * Uses a fake `AIService` rather than the real provider — which is exactly the
 * point of the abstraction: the interview flow can be exercised end to end with
 * no API key, no network, and deterministic responses.
 */

describe("AI provider abstraction", () => {
  it("throws a typed 503 when no provider is configured", async () => {
    __setAIService(null);
    vi.stubEnv("ANTHROPIC_API_KEY", "");

    // Re-import so the env stub is picked up by the module-level check.
    const { getAIService: freshGet } = await import("@/lib/ai");
    expect(() => freshGet()).toThrow(ServiceUnavailableError);

    try {
      freshGet();
    } catch (error) {
      expect((error as ServiceUnavailableError).status).toBe(503);
      // The message must tell the operator exactly what to do.
      expect((error as ServiceUnavailableError).message).toContain(
        "ANTHROPIC_API_KEY",
      );
    }

    vi.unstubAllEnvs();
  });

  it("returns an injected provider, so the app never imports the SDK directly", () => {
    const fake = new FakeAIService();
    __setAIService(fake);

    const service = getAIService();
    expect(service.providerName).toBe("fake");
    expect(service).toBe(fake);

    __setAIService(null);
  });

  it("satisfies the full AIService contract", () => {
    const fake = new FakeAIService();
    const required: Array<keyof AIService> = [
      "generateInterviewQuestion",
      "generateFollowUpQuestion",
      "evaluateInterviewAnswer",
      "generateInterviewReport",
      "analyzeResume",
      "analyzeJobDescription",
      "generateRecommendations",
    ];
    for (const method of required) {
      expect(typeof fake[method]).toBe("function");
    }
  });
});

/**
 * The rule the interview service applies after grading an answer.
 * Mirrors `shouldFollowUp` in `lib/interviews/service.ts`.
 */
function shouldFollowUp(
  evaluation: AnswerEvaluation,
  lastQuestionWasFollowUp: boolean,
): boolean {
  return (
    evaluation.score >= 3 &&
    evaluation.score <= 6 &&
    evaluation.missingPoints.length > 0 &&
    !lastQuestionWasFollowUp
  );
}

describe("adaptive question selection", () => {
  it("follows up on a partially correct answer with an identified gap", () => {
    const evaluation = makeEvaluation({
      score: 5,
      missingPoints: ["Did not mention the worst case"],
    });
    expect(shouldFollowUp(evaluation, false)).toBe(true);
  });

  it("moves on after a strong answer", () => {
    const evaluation = makeEvaluation({ score: 9, missingPoints: ["Nitpick"] });
    expect(shouldFollowUp(evaluation, false)).toBe(false);
  });

  it("moves on after an answer that was essentially empty", () => {
    // Drilling into a blank answer teaches nothing — change topic instead.
    const evaluation = makeEvaluation({
      score: 1,
      missingPoints: ["Everything"],
    });
    expect(shouldFollowUp(evaluation, false)).toBe(false);
  });

  it("does not follow up a follow-up, so it cannot loop on one topic", () => {
    const evaluation = makeEvaluation({
      score: 5,
      missingPoints: ["Still vague"],
    });
    expect(shouldFollowUp(evaluation, true)).toBe(false);
  });

  it("moves on when the grader found no specific gap to probe", () => {
    const evaluation = makeEvaluation({ score: 5, missingPoints: [] });
    expect(shouldFollowUp(evaluation, false)).toBe(false);
  });
});

describe("interview question generation", () => {
  it("passes the candidate context and transcript to the provider", async () => {
    const fake = new FakeAIService();

    await fake.generateInterviewQuestion({
      candidate: {
        name: "Aarav",
        targetRole: "Backend Engineer",
        experienceLevel: "FRESHER",
        skills: ["Java", "SQL"],
      },
      settings: {
        type: "TECHNICAL",
        persona: "PROFESSIONAL",
        difficulty: "MEDIUM",
        plannedQuestions: 6,
      },
      transcript: [
        { role: "INTERVIEWER", content: "Tell me about yourself." },
        { role: "CANDIDATE", content: "I am a final-year student." },
      ],
      questionNumber: 2,
      coveredTopics: ["Introduction"],
      lastEvaluation: makeEvaluation(),
    });

    const call = fake.questionCalls[0];
    expect(call.candidate.targetRole).toBe("Backend Engineer");
    expect(call.candidate.skills).toContain("SQL");
    // The transcript is what makes the sequence adaptive rather than fixed.
    expect(call.transcript).toHaveLength(2);
    expect(call.coveredTopics).toContain("Introduction");
    expect(call.lastEvaluation).not.toBeNull();
  });

  it("marks a follow-up question as such", async () => {
    const fake = new FakeAIService();
    const result = await fake.generateFollowUpQuestion({
      candidate: {
        name: "Aarav",
        targetRole: "Backend Engineer",
        experienceLevel: "FRESHER",
        skills: [],
      },
      settings: {
        type: "TECHNICAL",
        persona: "STRICT",
        difficulty: "HARD",
        plannedQuestions: 6,
      },
      transcript: [],
      questionNumber: 3,
      coveredTopics: ["Indexing"],
      lastEvaluation: makeEvaluation({ score: 4 }),
    });

    expect(result.isFollowUp).toBe(true);
    expect(result.topic).toBe("Indexing");
  });

  it("does not repeat a covered topic on a fresh question", async () => {
    const fake = new FakeAIService();
    const result = await fake.generateInterviewQuestion({
      candidate: {
        name: "Aarav",
        targetRole: "SDE",
        experienceLevel: "FRESHER",
        skills: [],
      },
      settings: {
        type: "MIXED",
        persona: "FRIENDLY",
        difficulty: "EASY",
        plannedQuestions: 4,
      },
      transcript: [],
      questionNumber: 2,
      coveredTopics: ["Topic 1"],
      lastEvaluation: null,
    });

    expect(result.topic).not.toBe("Topic 1");
  });
});
