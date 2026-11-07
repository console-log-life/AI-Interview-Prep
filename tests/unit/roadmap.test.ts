import { describe, expect, it } from "vitest";

import { ALLOWED_HORIZONS, buildDailyTasks } from "@/lib/roadmap/service";

/**
 * `buildDailyTasks` is deliberately AI-free: "Today's plan" has to work on a
 * deployment with no API key. These tests hold that property and check the
 * plan is actually derived from the user's measured weaknesses rather than
 * being a fixed list dressed up as personalisation.
 */

function args(overrides: Partial<Parameters<typeof buildDailyTasks>[0]> = {}) {
  return {
    weakSkills: [],
    repeatedMistakes: [],
    interviewsCompleted: 0,
    problemsSolved: 0,
    hasResume: false,
    ...overrides,
  };
}

describe("ALLOWED_HORIZONS", () => {
  it("offers the five documented horizons", () => {
    expect([...ALLOWED_HORIZONS]).toEqual([7, 14, 30, 60, 90]);
  });
});

describe("buildDailyTasks", () => {
  it("always produces a usable plan, even for a brand-new user", () => {
    const tasks = buildDailyTasks(args());
    expect(tasks.length).toBeGreaterThan(0);
    for (const task of tasks) {
      expect(task.title.length).toBeGreaterThan(3);
      expect(task.detail.length).toBeGreaterThan(3);
    }
  });

  it("targets the weakest measured skills first", () => {
    const tasks = buildDailyTasks(
      args({
        weakSkills: [
          { skillKey: "dbms.joins", label: "SQL joins", score: 34 },
          { skillKey: "dsa.dp", label: "Dynamic programming", score: 41 },
        ],
      }),
    );

    const titles = tasks.map((task) => task.title).join(" | ");
    expect(titles).toContain("SQL joins");
    expect(titles).toContain("Dynamic programming");
  });

  it("quotes the actual score in the reason, not a vague nudge", () => {
    const tasks = buildDailyTasks(
      args({
        weakSkills: [{ skillKey: "dbms.joins", label: "SQL joins", score: 34 }],
      }),
    );
    const skillTask = tasks.find((task) => task.title.includes("SQL joins"));
    expect(skillTask?.detail).toContain("34");
  });

  it("takes at most two skill drills so the day stays realistic", () => {
    const tasks = buildDailyTasks(
      args({
        weakSkills: [
          { skillKey: "a", label: "Alpha", score: 10 },
          { skillKey: "b", label: "Beta", score: 20 },
          { skillKey: "c", label: "Gamma", score: 30 },
          { skillKey: "d", label: "Delta", score: 40 },
        ],
      }),
    );
    const drills = tasks.filter(
      (task) => task.kind === "ASSESSMENT" && task.skillKey,
    );
    expect(drills.length).toBeLessThanOrEqual(2);
  });

  it("adds a review slot for the most frequent repeated mistake", () => {
    const tasks = buildDailyTasks(
      args({
        repeatedMistakes: [
          { label: "Misunderstanding SQL joins", concept: "sql-joins", frequency: 3 },
        ],
      }),
    );

    const review = tasks.find((task) => task.kind === "REVIEW");
    expect(review?.title).toContain("Misunderstanding SQL joins");
    expect(review?.detail).toContain("3");
  });

  it("always includes exactly one coding habit task", () => {
    const coding = buildDailyTasks(args()).filter(
      (task) => task.kind === "CODING",
    );
    expect(coding).toHaveLength(1);
  });

  it("suggests an easier start when nothing has been solved yet", () => {
    const first = buildDailyTasks(args({ problemsSolved: 0 })).find(
      (task) => task.kind === "CODING",
    );
    const later = buildDailyTasks(args({ problemsSolved: 25 })).find(
      (task) => task.kind === "CODING",
    );
    expect(first?.detail).not.toBe(later?.detail);
    expect(first?.detail.toLowerCase()).toContain("easy");
  });

  it("nudges a resume upload only while one is missing", () => {
    const without = buildDailyTasks(args({ hasResume: false }));
    const withResume = buildDailyTasks(args({ hasResume: true }));

    expect(without.some((task) => task.kind === "RESUME")).toBe(true);
    expect(withResume.some((task) => task.kind === "RESUME")).toBe(false);
  });

  it("wording of the interview task reflects whether one has been done", () => {
    const firstTime = buildDailyTasks(args({ interviewsCompleted: 0 })).find(
      (task) => task.kind === "INTERVIEW",
    );
    expect(firstTime?.title.toLowerCase()).toContain("first");
  });

  it("caps the day at six tasks however much is wrong", () => {
    const tasks = buildDailyTasks(
      args({
        weakSkills: [
          { skillKey: "a", label: "Alpha", score: 10 },
          { skillKey: "b", label: "Beta", score: 12 },
          { skillKey: "c", label: "Gamma", score: 14 },
        ],
        repeatedMistakes: [
          { label: "One", concept: "one", frequency: 5 },
          { label: "Two", concept: "two", frequency: 4 },
        ],
        hasResume: false,
      }),
    );
    expect(tasks.length).toBeLessThanOrEqual(6);
  });

  it("only emits task kinds the UI knows how to route", () => {
    const routable = new Set([
      "ASSESSMENT",
      "INTERVIEW",
      "CODING",
      "REVIEW",
      "STUDY",
      "RESUME",
    ]);
    const tasks = buildDailyTasks(
      args({
        weakSkills: [{ skillKey: "dsa", label: "DSA", score: 30 }],
        repeatedMistakes: [{ label: "X", concept: "x", frequency: 2 }],
      }),
    );
    for (const task of tasks) {
      expect(routable.has(task.kind)).toBe(true);
    }
  });

  it("is deterministic — the same input produces the same plan", () => {
    const input = args({
      weakSkills: [{ skillKey: "dsa.dp", label: "Dynamic programming", score: 38 }],
      repeatedMistakes: [{ label: "Vague answers", concept: "vague", frequency: 2 }],
      interviewsCompleted: 2,
      problemsSolved: 4,
      hasResume: true,
    });
    expect(buildDailyTasks(input)).toEqual(buildDailyTasks(input));
  });
});
