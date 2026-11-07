import { describe, expect, it } from "vitest";

import {
  buildTopicBreakdown,
  gradeAnswer,
  isAttemptExpired,
  scoreAttempt,
  secondsRemaining,
  type ScorableQuestion,
} from "@/lib/assessments/scoring";

function mcq(overrides: Partial<ScorableQuestion> = {}): ScorableQuestion {
  return {
    id: "q1",
    type: "MCQ",
    points: 1,
    topic: "Arrays",
    difficulty: "EASY",
    correctOptionIds: ["a"],
    ...overrides,
  };
}

describe("gradeAnswer", () => {
  it("marks a correct single-choice answer", () => {
    const result = gradeAnswer(mcq(), {
      questionId: "q1",
      selectedOptions: ["a"],
    });
    expect(result).toMatchObject({ isCorrect: true, pointsAwarded: 1, answered: true });
  });

  it("marks a wrong single-choice answer", () => {
    const result = gradeAnswer(mcq(), {
      questionId: "q1",
      selectedOptions: ["b"],
    });
    expect(result).toMatchObject({ isCorrect: false, pointsAwarded: 0, answered: true });
  });

  it("treats a missing answer as unanswered and incorrect", () => {
    const result = gradeAnswer(mcq(), undefined);
    expect(result).toMatchObject({ isCorrect: false, pointsAwarded: 0, answered: false });
  });

  it("awards the question's own point value, not a flat 1", () => {
    const result = gradeAnswer(mcq({ points: 5 }), {
      questionId: "q1",
      selectedOptions: ["a"],
    });
    expect(result.pointsAwarded).toBe(5);
  });

  describe("multi-select", () => {
    const question = mcq({ type: "MULTI_SELECT", correctOptionIds: ["a", "c"] });

    it("accepts the exact correct set regardless of order", () => {
      const result = gradeAnswer(question, {
        questionId: "q1",
        selectedOptions: ["c", "a"],
      });
      expect(result.isCorrect).toBe(true);
    });

    it("rejects a partially correct set (no partial credit)", () => {
      const result = gradeAnswer(question, {
        questionId: "q1",
        selectedOptions: ["a"],
      });
      expect(result).toMatchObject({ isCorrect: false, pointsAwarded: 0 });
    });

    it("rejects selecting everything, so guessing is not rewarded", () => {
      const result = gradeAnswer(question, {
        questionId: "q1",
        selectedOptions: ["a", "b", "c", "d"],
      });
      expect(result.isCorrect).toBe(false);
    });
  });

  describe("open-ended questions", () => {
    const question = mcq({ type: "SHORT_ANSWER", correctOptionIds: [] });

    it("is not auto-graded, and reports isCorrect as null", () => {
      const result = gradeAnswer(question, {
        questionId: "q1",
        selectedOptions: [],
        textAnswer: "A thoughtful answer.",
      });
      expect(result.isCorrect).toBeNull();
      expect(result.answered).toBe(true);
      expect(result.pointsAwarded).toBe(0);
    });

    it("counts whitespace-only text as unanswered", () => {
      const result = gradeAnswer(question, {
        questionId: "q1",
        selectedOptions: [],
        textAnswer: "   \n  ",
      });
      expect(result.answered).toBe(false);
    });
  });
});

describe("scoreAttempt", () => {
  const questions: ScorableQuestion[] = [
    mcq({ id: "q1", topic: "Arrays", correctOptionIds: ["a"] }),
    mcq({ id: "q2", topic: "Arrays", correctOptionIds: ["b"] }),
    mcq({ id: "q3", topic: "Graphs", difficulty: "HARD", correctOptionIds: ["c"], points: 2 }),
  ];

  it("computes score, percentage and the answer tallies", () => {
    const result = scoreAttempt(questions, [
      { questionId: "q1", selectedOptions: ["a"] }, // correct   (1)
      { questionId: "q2", selectedOptions: ["z"] }, // incorrect (0)
      // q3 unanswered
    ]);

    expect(result.score).toBe(1);
    expect(result.maxScore).toBe(4);
    expect(result.percentage).toBe(25);
    expect(result.correctCount).toBe(1);
    expect(result.incorrectCount).toBe(1);
    expect(result.unansweredCount).toBe(1);
  });

  it("applies the assessment's own pass mark", () => {
    const answers = [
      { questionId: "q1", selectedOptions: ["a"] },
      { questionId: "q2", selectedOptions: ["b"] },
      { questionId: "q3", selectedOptions: ["c"] },
    ];
    expect(scoreAttempt(questions, answers, 100).passed).toBe(true);
    expect(scoreAttempt(questions, answers.slice(0, 2), 60).passed).toBe(false);
  });

  it("excludes open-ended questions from maxScore so the percentage stays honest", () => {
    const mixed: ScorableQuestion[] = [
      mcq({ id: "q1", correctOptionIds: ["a"] }),
      mcq({ id: "q2", type: "SHORT_ANSWER", correctOptionIds: [], points: 3 }),
    ];

    const result = scoreAttempt(mixed, [
      { questionId: "q1", selectedOptions: ["a"] },
      { questionId: "q2", selectedOptions: [], textAnswer: "An answer." },
    ]);

    // Only the MCQ counts, so answering it correctly is 100% — the ungraded
    // short answer must not drag the score down to 25%.
    expect(result.maxScore).toBe(1);
    expect(result.percentage).toBe(100);
  });

  it("returns zero rather than NaN when nothing is auto-gradable", () => {
    const openOnly: ScorableQuestion[] = [
      mcq({ id: "q1", type: "SHORT_ANSWER", correctOptionIds: [] }),
    ];
    const result = scoreAttempt(openOnly, []);
    expect(result.percentage).toBe(0);
    expect(result.maxScore).toBe(0);
    expect(result.passed).toBe(false);
  });

  it("handles an empty assessment without throwing", () => {
    const result = scoreAttempt([], []);
    expect(result.percentage).toBe(0);
    expect(result.graded).toHaveLength(0);
  });

  it("ignores answers for questions that are not in the assessment", () => {
    const result = scoreAttempt(questions, [
      { questionId: "q1", selectedOptions: ["a"] },
      { questionId: "not-in-this-assessment", selectedOptions: ["a"] },
    ]);
    expect(result.score).toBe(1);
    expect(result.graded).toHaveLength(3);
  });

  it("breaks results down by topic, weakest first", () => {
    const result = scoreAttempt(questions, [
      { questionId: "q1", selectedOptions: ["a"] },
      { questionId: "q2", selectedOptions: ["b"] },
      { questionId: "q3", selectedOptions: ["wrong"] },
    ]);

    expect(result.byTopic[0]).toMatchObject({ topic: "Graphs", percentage: 0 });
    expect(result.byTopic[1]).toMatchObject({
      topic: "Arrays",
      correct: 2,
      total: 2,
      percentage: 100,
    });
  });

  it("breaks results down by difficulty in EASY→HARD order", () => {
    const result = scoreAttempt(questions, [
      { questionId: "q1", selectedOptions: ["a"] },
    ]);
    expect(result.byDifficulty.map((entry) => entry.difficulty)).toEqual([
      "EASY",
      "HARD",
    ]);
  });
});

describe("buildTopicBreakdown", () => {
  it("reports 0% for a topic with no correct answers rather than omitting it", () => {
    const questions = [mcq({ id: "q1", topic: "Trees" })];
    const graded = [
      { questionId: "q1", isCorrect: false, pointsAwarded: 0, answered: true },
    ];
    expect(buildTopicBreakdown(questions, graded)).toEqual([
      { topic: "Trees", correct: 0, total: 1, percentage: 0 },
    ]);
  });
});

describe("attempt expiry", () => {
  const now = new Date("2026-01-01T12:00:00Z");

  it("is not expired before the deadline", () => {
    const expiresAt = new Date("2026-01-01T12:05:00Z");
    expect(isAttemptExpired(expiresAt, now)).toBe(false);
  });

  it("allows a small grace window for network latency", () => {
    // 3 s past the deadline is inside the 5 s grace window.
    const expiresAt = new Date("2026-01-01T11:59:57Z");
    expect(isAttemptExpired(expiresAt, now)).toBe(false);
  });

  it("is expired once the grace window has passed", () => {
    const expiresAt = new Date("2026-01-01T11:59:00Z");
    expect(isAttemptExpired(expiresAt, now)).toBe(true);
  });

  it("never reports negative time remaining", () => {
    const expiresAt = new Date("2026-01-01T11:00:00Z");
    expect(secondsRemaining(expiresAt, now)).toBe(0);
  });

  it("computes remaining seconds from the server deadline", () => {
    const expiresAt = new Date("2026-01-01T12:03:20Z");
    expect(secondsRemaining(expiresAt, now)).toBe(200);
  });
});
