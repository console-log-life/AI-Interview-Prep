import { describe, expect, it } from "vitest";

import {
  computeReadinessScore,
  computeStreak,
  type ProgressTotals,
} from "@/lib/progress/service";

function totals(overrides: Partial<ProgressTotals> = {}): ProgressTotals {
  return {
    interviewAvg: 0,
    assessmentAvg: 0,
    codingAvg: 0,
    interviewsCompleted: 0,
    assessmentsCompleted: 0,
    problemsSolved: 0,
    questionsAnswered: 0,
    ...overrides,
  };
}

describe("computeReadinessScore", () => {
  it("is 0 for a brand-new account — no invented starting score", () => {
    expect(computeReadinessScore(totals())).toBe(0);
  });

  it("scales a single lucky result down instead of showing a high score", () => {
    // One perfect interview should NOT read as "100% ready".
    const score = computeReadinessScore(
      totals({ interviewAvg: 100, interviewsCompleted: 1 }),
    );
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(40);
  });

  it("approaches the weighted average once there is enough evidence", () => {
    const score = computeReadinessScore(
      totals({
        interviewAvg: 80,
        assessmentAvg: 80,
        codingAvg: 80,
        interviewsCompleted: 5,
        assessmentsCompleted: 5,
        problemsSolved: 10,
      }),
    );
    expect(score).toBeGreaterThanOrEqual(78);
    expect(score).toBeLessThanOrEqual(80);
  });

  it("ignores pillars the user has never attempted", () => {
    // Only interviews attempted: the score should reflect interviews, not be
    // dragged to a third of it by two empty pillars.
    const score = computeReadinessScore(
      totals({ interviewAvg: 90, interviewsCompleted: 6 }),
    );
    expect(score).toBeGreaterThan(60);
  });

  it("weights interviews above assessments above coding", () => {
    const strongInterviews = computeReadinessScore(
      totals({
        interviewAvg: 100,
        assessmentAvg: 0,
        codingAvg: 0,
        interviewsCompleted: 5,
        assessmentsCompleted: 5,
        problemsSolved: 10,
      }),
    );
    const strongCoding = computeReadinessScore(
      totals({
        interviewAvg: 0,
        assessmentAvg: 0,
        codingAvg: 100,
        interviewsCompleted: 5,
        assessmentsCompleted: 5,
        problemsSolved: 10,
      }),
    );
    expect(strongInterviews).toBeGreaterThan(strongCoding);
  });

  it("never exceeds 100", () => {
    const score = computeReadinessScore(
      totals({
        interviewAvg: 100,
        assessmentAvg: 100,
        codingAvg: 100,
        interviewsCompleted: 50,
        assessmentsCompleted: 50,
        problemsSolved: 100,
      }),
    );
    expect(score).toBeLessThanOrEqual(100);
  });
});

describe("computeStreak", () => {
  const today = new Date("2026-03-15T10:00:00Z");
  const day = (offset: number) =>
    new Date(Date.UTC(2026, 2, 15 - offset));

  it("is 0 with no activity", () => {
    expect(computeStreak([], today)).toBe(0);
  });

  it("counts a single day of activity today", () => {
    expect(computeStreak([day(0)], today)).toBe(1);
  });

  it("counts consecutive days ending today", () => {
    expect(computeStreak([day(0), day(1), day(2)], today)).toBe(3);
  });

  it("still counts a streak that ends yesterday", () => {
    // Practising yesterday but not yet today should not read as a broken
    // streak — the user still has today to keep it alive.
    expect(computeStreak([day(1), day(2), day(3)], today)).toBe(3);
  });

  it("resets when the most recent activity is older than yesterday", () => {
    expect(computeStreak([day(3), day(4), day(5)], today)).toBe(0);
  });

  it("stops at the first gap", () => {
    // today, yesterday, then a gap at day 2.
    expect(computeStreak([day(0), day(1), day(3), day(4)], today)).toBe(2);
  });

  it("de-duplicates multiple activities on the same day", () => {
    const sameDay = [
      new Date("2026-03-15T08:00:00Z"),
      new Date("2026-03-15T18:00:00Z"),
      new Date("2026-03-14T09:00:00Z"),
    ];
    expect(computeStreak(sameDay, today)).toBe(2);
  });

  it("is order-independent", () => {
    const shuffled = [day(2), day(0), day(1)];
    expect(computeStreak(shuffled, today)).toBe(3);
  });
});
