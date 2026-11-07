import { afterEach, describe, expect, it } from "vitest";

import { AI_UNAVAILABLE_MESSAGE, aiAvailable, getAIService, __setAIService } from "@/lib/ai";
import { ServiceUnavailableError } from "@/lib/api/errors";
import { handleRouteError } from "@/lib/api/response";
import { executionAvailable } from "@/lib/coding";
import { sttAvailable, ttsAvailable } from "@/lib/voice";
import { FakeAIService } from "@/tests/helpers/fake-ai";

/**
 * Rule 26/27 of the build brief: when an external service is unavailable the
 * product must say so clearly and must NEVER substitute fabricated output.
 *
 * The test environment has no API keys, which makes it the perfect place to
 * assert the unconfigured behaviour of every external dependency at once.
 */

afterEach(() => {
  __setAIService(null);
});

describe("with no credentials configured", () => {
  it("reports every external provider as unavailable", () => {
    expect(aiAvailable()).toBe(false);
    expect(executionAvailable()).toBe(false);
    expect(sttAvailable()).toBe(false);
    expect(ttsAvailable()).toBe(false);
  });

  it("throws a typed 503 for AI rather than returning invented content", () => {
    expect(() => getAIService()).toThrow(ServiceUnavailableError);
  });

  it("names the environment variable to set, not the missing value", () => {
    expect(AI_UNAVAILABLE_MESSAGE).toContain("ANTHROPIC_API_KEY");
    // A message that echoed a key would be a credential leak.
    expect(AI_UNAVAILABLE_MESSAGE).not.toMatch(/sk-ant-[A-Za-z0-9]/);
  });

  it("turns the unavailability into a 503 the UI can render", async () => {
    let response;
    try {
      getAIService();
    } catch (error) {
      response = handleRouteError(error);
    }

    expect(response?.status).toBe(503);
    const body = await response?.json();
    expect(body.ok).toBe(false);
    expect(body.error.message).toContain("ANTHROPIC_API_KEY");
  });
});

describe("with a provider injected", () => {
  it("becomes available and returns that provider", () => {
    const fake = new FakeAIService();
    __setAIService(fake);

    expect(getAIService()).toBe(fake);
    expect(getAIService().providerName).toBe("fake");
  });

  it("exercises every V2 capability without a network call", async () => {
    const fake = new FakeAIService();
    __setAIService(fake);
    const ai = getAIService();

    const claims = await ai.extractResumeClaims("Built a REST API in Node.js.");
    expect(Array.isArray(claims)).toBe(true);

    const roadmap = await ai.generateRoadmap({
      grounding: groundingStub(),
      horizonDays: 14,
      minutesPerDay: 60,
    });
    expect(roadmap.tasks.length).toBeGreaterThan(0);

    const reply = await ai.coach({
      grounding: groundingStub(),
      history: [],
      question: "What should I practise?",
    });
    expect(reply.answer.length).toBeGreaterThan(0);

    const questions = await ai.generateQuestions({
      category: "DSA",
      topic: "Graphs",
      difficulty: "MEDIUM",
      count: 2,
      types: ["MCQ"],
      targetRole: "Software Engineer",
      experienceLevel: "FRESHER",
      avoidTexts: [],
    });
    expect(questions.length).toBeGreaterThan(0);
  });
});

describe("code review never volunteers the answer", () => {
  it("withholds the optimised approach unless it was requested", async () => {
    const fake = new FakeAIService();
    __setAIService(fake);

    const withheld = await getAIService().reviewCode({
      problemTitle: "Two Sum",
      problemDescription: "Find two numbers adding to a target.",
      language: "PYTHON",
      code: "def solve(): pass",
      verdict: "ACCEPTED",
      passedTests: 5,
      totalTests: 5,
      includeOptimizedApproach: false,
    });

    expect(withheld.optimizedApproach ?? "").toBe("");

    const requested = await getAIService().reviewCode({
      problemTitle: "Two Sum",
      problemDescription: "Find two numbers adding to a target.",
      language: "PYTHON",
      code: "def solve(): pass",
      verdict: "ACCEPTED",
      passedTests: 5,
      totalTests: 5,
      includeOptimizedApproach: true,
    });

    expect((requested.optimizedApproach ?? "").length).toBeGreaterThan(0);
  });
});

function groundingStub() {
  return {
    targetRole: "Backend Engineer",
    experienceLevel: "FRESHER" as const,
    readiness: 40,
    confidenceLevel: "Low evidence",
    interviewsCompleted: 1,
    assessmentsCompleted: 2,
    problemsSolved: 3,
    streakDays: 2,
    skills: [],
    weakSkills: [{ label: "SQL joins", score: 35 }],
    strongSkills: [],
    repeatedMistakes: [],
    recentActivity: [],
    hasResume: false,
    targetJob: null,
    jobGaps: [],
  };
}
