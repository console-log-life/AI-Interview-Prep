import { describe, expect, it } from "vitest";

import {
  ROOT_SKILL_KEYS,
  SKILL_GRAPH,
  ancestorsOf,
  childrenOf,
  resolveSkillKey,
  skillLabel,
} from "@/lib/skills/graph";
import {
  DIFFICULTY_WEIGHT,
  EMPTY_SKILL_SCORE,
  FULL_CONFIDENCE_WEIGHT,
  HALF_LIFE_DAYS,
  SOURCE_WEIGHT,
  computeSkillScore,
  computeTrend,
  confidenceBand,
  interviewScoreToSkillScore,
  recencyFactor,
  recommendedAction,
  type Observation,
} from "@/lib/skills/scoring";

const NOW = new Date("2026-06-01T12:00:00Z");

function daysAgo(days: number): Date {
  return new Date(NOW.getTime() - days * 86_400_000);
}

function observation(overrides: Partial<Observation> = {}): Observation {
  return {
    score: 70,
    weight: 1,
    difficulty: "MEDIUM",
    observedAt: NOW,
    ...overrides,
  };
}

describe("skill graph", () => {
  it("has unique keys", () => {
    const keys = SKILL_GRAPH.map((skill) => skill.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("only references parents that exist", () => {
    const keys = new Set(SKILL_GRAPH.map((skill) => skill.key));
    for (const skill of SKILL_GRAPH) {
      if (skill.parentKey) expect(keys.has(skill.parentKey)).toBe(true);
    }
  });

  it("has no cycles — every chain terminates at a root", () => {
    for (const skill of SKILL_GRAPH) {
      // The chain is self-inclusive: "dsa.graphs" → ["dsa.graphs", "dsa"].
      const chain = ancestorsOf(skill.key);
      expect(chain[0]).toBe(skill.key);
      expect(chain.length).toBeLessThanOrEqual(SKILL_GRAPH.length);
      // A cycle would revisit a key; a terminating chain cannot.
      expect(new Set(chain).size).toBe(chain.length);
      expect(ROOT_SKILL_KEYS).toContain(chain[chain.length - 1]);
    }
  });

  it("exposes roots as the parentless skills", () => {
    expect(ROOT_SKILL_KEYS.length).toBeGreaterThan(0);
    for (const key of ROOT_SKILL_KEYS) {
      const skill = SKILL_GRAPH.find((item) => item.key === key);
      expect(skill?.parentKey).toBeUndefined();
    }
  });

  it("gives every child a parent that is itself in the graph", () => {
    const children = SKILL_GRAPH.filter((skill) => skill.parentKey);
    expect(children.length).toBeGreaterThan(0);
    for (const child of children) {
      expect(childrenOf(child.parentKey as string)).toContainEqual(child);
    }
  });

  it("prefers a specific leaf over its root when matching a topic", () => {
    // "SQL joins" must not collapse to the generic dbms root.
    const resolved = resolveSkillKey("SQL joins", "DBMS");
    expect(resolved).toBe("dbms.joins");
  });

  it("falls back to the category root for an unrecognised topic", () => {
    const resolved = resolveSkillKey("Something entirely unmapped", "DSA");
    expect(resolved).toBe("dsa");
  });

  it("returns a readable label even for an unknown key", () => {
    expect(skillLabel("dsa.graphs")).toBe("Graphs");
    expect(skillLabel("not-a-real-key")).toBeTruthy();
  });
});

describe("recencyFactor", () => {
  it("is 1 for something observed right now", () => {
    expect(recencyFactor(NOW, NOW)).toBeCloseTo(1, 5);
  });

  it("halves after exactly one half-life", () => {
    expect(recencyFactor(daysAgo(HALF_LIFE_DAYS), NOW)).toBeCloseTo(0.5, 5);
  });

  it("keeps decaying but never goes negative", () => {
    const veryOld = recencyFactor(daysAgo(365), NOW);
    expect(veryOld).toBeGreaterThan(0);
    expect(veryOld).toBeLessThan(0.05);
  });
});

describe("computeSkillScore", () => {
  it("returns the empty score for no observations", () => {
    expect(computeSkillScore([], NOW)).toEqual(EMPTY_SKILL_SCORE);
  });

  it("weights a recent observation far above an old one", () => {
    const result = computeSkillScore(
      [
        observation({ score: 90, observedAt: NOW }),
        observation({ score: 10, observedAt: daysAgo(180) }),
      ],
      NOW,
    );
    // The stale 10 barely counts, so the score must sit near the recent 90.
    expect(result.score).toBeGreaterThan(80);
  });

  it("reports low confidence from a single observation however good it is", () => {
    const result = computeSkillScore([observation({ score: 100 })], NOW);
    expect(result.score).toBeGreaterThan(90);
    expect(result.confidence).toBeLessThan(0.35);
    expect(confidenceBand(result.confidence)).not.toBe("high");
  });

  it("reaches full confidence only with enough weighted evidence", () => {
    const many = Array.from({ length: FULL_CONFIDENCE_WEIGHT + 4 }, () =>
      observation({ difficulty: "HARD", weight: SOURCE_WEIGHT.INTERVIEW }),
    );
    const result = computeSkillScore(many, NOW);
    expect(result.confidence).toBeCloseTo(1, 1);
  });

  it("counts a HARD observation for more than an EASY one", () => {
    expect(DIFFICULTY_WEIGHT.HARD).toBeGreaterThan(DIFFICULTY_WEIGHT.EASY);

    const hard = computeSkillScore(
      [
        observation({ score: 100, difficulty: "HARD" }),
        observation({ score: 0, difficulty: "EASY" }),
      ],
      NOW,
    );
    expect(hard.score).toBeGreaterThan(50);
  });

  it("weights interview evidence above resume evidence", () => {
    expect(SOURCE_WEIGHT.INTERVIEW).toBeGreaterThan(SOURCE_WEIGHT.RESUME);
  });

  it("records the most recent practice date", () => {
    const result = computeSkillScore(
      [
        observation({ observedAt: daysAgo(10) }),
        observation({ observedAt: daysAgo(2) }),
      ],
      NOW,
    );
    expect(result.lastPracticedAt?.toISOString()).toBe(
      daysAgo(2).toISOString(),
    );
  });

  it("keeps the score inside 0-100 for extreme inputs", () => {
    const result = computeSkillScore(
      [observation({ score: 999 }), observation({ score: -500 })],
      NOW,
    );
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });
});

describe("computeTrend", () => {
  it("is zero without enough observations to compare", () => {
    expect(computeTrend([observation(), observation()])).toBe(0);
  });

  it("is positive when recent results beat older ones", () => {
    const trend = computeTrend([
      observation({ score: 30, observedAt: daysAgo(20) }),
      observation({ score: 35, observedAt: daysAgo(15) }),
      observation({ score: 80, observedAt: daysAgo(3) }),
      observation({ score: 85, observedAt: daysAgo(1) }),
    ]);
    expect(trend).toBeGreaterThan(0);
  });

  it("is negative when recent results are worse", () => {
    const trend = computeTrend([
      observation({ score: 90, observedAt: daysAgo(20) }),
      observation({ score: 88, observedAt: daysAgo(15) }),
      observation({ score: 40, observedAt: daysAgo(3) }),
      observation({ score: 35, observedAt: daysAgo(1) }),
    ]);
    expect(trend).toBeLessThan(0);
  });
});

describe("recommendedAction", () => {
  it("asks for evidence first when confidence is too low to judge", () => {
    expect(recommendedAction(95, 0.05)).toBe("GATHER_EVIDENCE");
    expect(recommendedAction(20, 0.05)).toBe("GATHER_EVIDENCE");
  });

  it("escalates from fundamentals through to maintenance as the score rises", () => {
    expect(recommendedAction(25, 0.9)).toBe("BUILD_FUNDAMENTALS");
    expect(recommendedAction(55, 0.9)).toBe("PRACTISE");
    expect(recommendedAction(70, 0.9)).toBe("DEEPEN");
    expect(recommendedAction(95, 0.9)).toBe("MAINTAIN");
  });
});

describe("interviewScoreToSkillScore", () => {
  it("maps the evaluator's 0-10 onto 0-100", () => {
    expect(interviewScoreToSkillScore(0)).toBe(0);
    expect(interviewScoreToSkillScore(10)).toBe(100);
    expect(interviewScoreToSkillScore(7)).toBe(70);
  });

  it("clamps values outside the expected range", () => {
    expect(interviewScoreToSkillScore(-3)).toBe(0);
    expect(interviewScoreToSkillScore(42)).toBe(100);
  });
});
