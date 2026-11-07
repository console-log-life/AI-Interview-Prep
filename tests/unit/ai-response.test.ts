import { describe, expect, it } from "vitest";

import {
  evaluationResponseSchema,
  questionResponseSchema,
  recommendationsResponseSchema,
  reportResponseSchema,
} from "@/lib/ai/schemas";
import { jobDescriptionAnalysisSchema } from "@/lib/validation/job-description";
import { resumeAnalysisSchema } from "@/lib/validation/resume";

/**
 * AI responses are untrusted input.
 *
 * These tests pin the trust boundary: a provider that returns the wrong shape,
 * out-of-range scores, or a hostile payload must be rejected (or clamped)
 * before anything reaches the database.
 */
describe("AI response validation", () => {
  describe("interview question", () => {
    it("accepts a well-formed question", () => {
      const result = questionResponseSchema.safeParse({
        question: "Walk me through how a hash map handles collisions.",
        topic: "Hashing",
        isFollowUp: false,
        rationale: "Probes a fundamental the candidate claims on their resume.",
      });
      expect(result.success).toBe(true);
    });

    it("rejects an empty question rather than showing a blank turn", () => {
      const result = questionResponseSchema.safeParse({
        question: "",
        topic: "Hashing",
        isFollowUp: false,
        rationale: "",
      });
      expect(result.success).toBe(false);
    });

    it("rejects a missing topic", () => {
      const result = questionResponseSchema.safeParse({
        question: "Tell me about yourself.",
        isFollowUp: false,
        rationale: "",
      });
      expect(result.success).toBe(false);
    });

    it("defaults a missing rationale rather than failing the turn", () => {
      const result = questionResponseSchema.safeParse({
        question: "Tell me about yourself.",
        topic: "Introduction",
        isFollowUp: false,
      });
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.rationale).toBe("");
    });
  });

  describe("answer evaluation", () => {
    const valid = {
      score: 7,
      correctness: 8,
      relevance: 9,
      clarity: 6,
      technicalDepth: 7,
      completeness: 6,
      structure: 5,
      strengths: ["Correctly identified the trade-off"],
      missingPoints: ["Did not mention the worst case"],
      feedback: "Solid, but shallow on complexity.",
      improvedAnswer: "A restructured version of the same answer.",
    };

    it("accepts a well-formed evaluation", () => {
      expect(evaluationResponseSchema.safeParse(valid).success).toBe(true);
    });

    it("rejects a score above the 0-10 range", () => {
      const result = evaluationResponseSchema.safeParse({ ...valid, score: 11 });
      expect(result.success).toBe(false);
    });

    it("rejects a negative score", () => {
      const result = evaluationResponseSchema.safeParse({ ...valid, score: -3 });
      expect(result.success).toBe(false);
    });

    it("coerces a numeric string score, which some providers emit", () => {
      const result = evaluationResponseSchema.safeParse({ ...valid, score: "7" });
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.score).toBe(7);
    });

    it("defaults missing arrays instead of writing undefined to the DB", () => {
      const result = evaluationResponseSchema.safeParse({
        ...valid,
        strengths: undefined,
        missingPoints: undefined,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.strengths).toEqual([]);
        expect(result.data.missingPoints).toEqual([]);
      }
    });

    it("rejects a completely wrong shape", () => {
      expect(evaluationResponseSchema.safeParse("looks good to me").success).toBe(
        false,
      );
      expect(evaluationResponseSchema.safeParse(null).success).toBe(false);
      expect(evaluationResponseSchema.safeParse([]).success).toBe(false);
    });
  });

  describe("interview report", () => {
    const valid = {
      overallScore: 72,
      technicalScore: 70,
      communicationScore: 80,
      problemSolvingScore: 68,
      behavioralScore: 75,
      structureScore: 65,
      summary: "A competent performance with gaps in complexity analysis.",
      strengths: ["Clear communication"],
      weaknesses: ["Shallow on time complexity"],
      repeatedMistakes: [],
      recommendations: ["Practise Big-O analysis"],
      suggestedTopics: ["Time complexity"],
    };

    it("accepts a well-formed report", () => {
      expect(reportResponseSchema.safeParse(valid).success).toBe(true);
    });

    it("rejects a category score above 100", () => {
      const result = reportResponseSchema.safeParse({
        ...valid,
        technicalScore: 140,
      });
      expect(result.success).toBe(false);
    });

    it("accepts an empty repeatedMistakes list", () => {
      const result = reportResponseSchema.safeParse({
        ...valid,
        repeatedMistakes: [],
      });
      expect(result.success).toBe(true);
    });
  });

  describe("resume analysis", () => {
    it("fills in every field for a minimal response", () => {
      const result = resumeAnalysisSchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.skills).toEqual([]);
        expect(result.data.education).toEqual([]);
        expect(result.data.yearsExperience).toBe(0);
        expect(result.data.fullName).toBe("");
      }
    });

    it("rejects an impossible years-of-experience value", () => {
      const result = resumeAnalysisSchema.safeParse({ yearsExperience: 250 });
      expect(result.success).toBe(false);
    });

    it("rejects a negative years-of-experience value", () => {
      const result = resumeAnalysisSchema.safeParse({ yearsExperience: -1 });
      expect(result.success).toBe(false);
    });

    it("normalises a partial education entry rather than dropping it", () => {
      const result = resumeAnalysisSchema.safeParse({
        education: [{ degree: "B.Tech" }],
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.education[0]).toEqual({
          degree: "B.Tech",
          institution: "",
          year: "",
          score: "",
        });
      }
    });
  });

  describe("job description analysis", () => {
    it("accepts a minimal response with defaults", () => {
      const result = jobDescriptionAnalysisSchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.matchScore).toBe(0);
        expect(result.data.skillMatch).toEqual([]);
      }
    });

    it("rejects a match score outside 0-100", () => {
      expect(
        jobDescriptionAnalysisSchema.safeParse({ matchScore: 150 }).success,
      ).toBe(false);
    });

    it("rejects an unknown skill level", () => {
      const result = jobDescriptionAnalysisSchema.safeParse({
        skillMatch: [{ skill: "Go", level: "EXCELLENT", score: 90, note: "" }],
      });
      expect(result.success).toBe(false);
    });

    it("accepts every documented skill level", () => {
      for (const level of ["STRONG", "MEDIUM", "WEAK", "MISSING"]) {
        const result = jobDescriptionAnalysisSchema.safeParse({
          skillMatch: [{ skill: "Go", level, score: 50, note: "" }],
        });
        expect(result.success).toBe(true);
      }
    });
  });

  describe("recommendations", () => {
    it("accepts a well-formed list", () => {
      const result = recommendationsResponseSchema.safeParse({
        recommendations: [
          {
            title: "Drill SQL joins",
            reason: "Your SQL average is 42% across 3 attempts.",
            topic: "SQL joins",
            kind: "ASSESSMENT",
            priority: "HIGH",
          },
        ],
      });
      expect(result.success).toBe(true);
    });

    it("rejects an unknown recommendation kind", () => {
      const result = recommendationsResponseSchema.safeParse({
        recommendations: [
          {
            title: "Do something",
            reason: "Because",
            topic: "X",
            kind: "MEDITATE",
            priority: "HIGH",
          },
        ],
      });
      expect(result.success).toBe(false);
    });

    it("defaults to an empty list when the key is missing", () => {
      const result = recommendationsResponseSchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.recommendations).toEqual([]);
    });
  });
});
