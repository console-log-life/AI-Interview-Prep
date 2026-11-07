import { describe, expect, it } from "vitest";

import {
  PILLAR_WEIGHT,
  computeJobReadiness,
  computeReadiness,
  toConfidenceLevel,
  type PillarInput,
  type ReadinessInput,
} from "@/lib/analytics/readiness";

/**
 * Readiness V2's whole reason for existing is that a high score from thin
 * evidence must not read as "ready". These tests pin that behaviour down —
 * they are the guard against the single most dishonest failure mode the
 * product could have.
 */

const NOW = new Date("2026-06-01T12:00:00Z");

function daysAgo(days: number): Date {
  return new Date(NOW.getTime() - days * 86_400_000);
}

function pillar(overrides: Partial<PillarInput> = {}): PillarInput {
  return { score: null, count: 0, lastAt: null, ...overrides };
}

function input(overrides: Partial<ReadinessInput> = {}): ReadinessInput {
  return {
    interview: pillar(),
    assessment: pillar(),
    coding: pillar(),
    skillsCovered: 0,
    totalSkills: 12,
    meanSkillConfidence: 0,
    repeatedMistakes: 0,
    now: NOW,
    ...overrides,
  };
}

describe("computeReadiness with no evidence", () => {
  const result = computeReadiness(input());

  it("returns zero rather than a flattering placeholder", () => {
    expect(result.readiness).toBe(0);
    expect(result.rawPerformance).toBe(0);
    expect(result.evidenceFactor).toBe(0);
  });

  it("reports NONE confidence and says why", () => {
    expect(result.confidence).toBe("NONE");
    expect(result.explanations[0]).toContain("No scored activity yet");
  });

  it("still lists all three pillars so the UI can render the breakdown", () => {
    expect(result.pillars.map((p) => p.key)).toEqual([
      "interview",
      "assessment",
      "coding",
    ]);
  });
});

describe("evidence discounting", () => {
  it("does not report a single perfect interview as high readiness", () => {
    const result = computeReadiness(
      input({
        interview: { score: 100, count: 1, lastAt: NOW },
        skillsCovered: 1,
        meanSkillConfidence: 0.2,
      }),
    );

    expect(result.rawPerformance).toBe(100);
    // The headline must be dragged well below the raw performance.
    expect(result.readiness).toBeLessThan(60);
    expect(result.confidence).not.toBe("HIGH");
  });

  it("raises the same score once the evidence is broad and repeated", () => {
    const thin = computeReadiness(
      input({
        interview: { score: 85, count: 1, lastAt: NOW },
        skillsCovered: 1,
        meanSkillConfidence: 0.2,
      }),
    );

    const thick = computeReadiness(
      input({
        interview: { score: 85, count: 6, lastAt: NOW },
        assessment: { score: 85, count: 8, lastAt: NOW },
        coding: { score: 85, count: 12, lastAt: NOW },
        skillsCovered: 12,
        meanSkillConfidence: 0.9,
      }),
    );

    expect(thick.readiness).toBeGreaterThan(thin.readiness);
    expect(thick.confidence).toBe("HIGH");
    expect(thick.rawPerformance).toBe(thin.rawPerformance);
  });

  it("never lets the evidence factor exceed 1", () => {
    const result = computeReadiness(
      input({
        interview: { score: 90, count: 100, lastAt: NOW },
        assessment: { score: 90, count: 100, lastAt: NOW },
        coding: { score: 90, count: 100, lastAt: NOW },
        skillsCovered: 99,
        meanSkillConfidence: 5,
      }),
    );
    expect(result.evidenceFactor).toBeLessThanOrEqual(1);
    expect(result.readiness).toBeLessThanOrEqual(100);
  });
});

describe("pillar weighting", () => {
  it("weights interviews above assessments above coding", () => {
    expect(PILLAR_WEIGHT.interview).toBeGreaterThan(PILLAR_WEIGHT.assessment);
    expect(PILLAR_WEIGHT.assessment).toBeGreaterThan(PILLAR_WEIGHT.coding);
  });

  it("renormalises over active pillars so an untouched one is not a zero", () => {
    // Only assessments attempted, scoring 80. Raw performance must be 80,
    // not 80 * 0.3.
    const result = computeReadiness(
      input({ assessment: { score: 80, count: 5, lastAt: NOW } }),
    );
    expect(result.rawPerformance).toBe(80);
  });

  it("explains which pillars have no activity", () => {
    const result = computeReadiness(
      input({ assessment: { score: 80, count: 5, lastAt: NOW } }),
    );
    const joined = result.explanations.join(" ");
    expect(joined).toContain("interview");
    expect(joined).toContain("coding");
  });
});

describe("staleness", () => {
  it("does not penalise recent practice", () => {
    const result = computeReadiness(
      input({ interview: { score: 80, count: 4, lastAt: daysAgo(3) } }),
    );
    expect(result.recencyFactor).toBe(1);
  });

  it("decays evidence when practice is old, and says so", () => {
    const fresh = computeReadiness(
      input({ interview: { score: 80, count: 4, lastAt: daysAgo(2) } }),
    );
    const stale = computeReadiness(
      input({ interview: { score: 80, count: 4, lastAt: daysAgo(60) } }),
    );

    expect(stale.recencyFactor).toBeLessThan(fresh.recencyFactor);
    expect(stale.readiness).toBeLessThan(fresh.readiness);
    expect(stale.explanations.join(" ")).toContain("60 days ago");
  });

  it("floors the recency decay rather than zeroing an old result", () => {
    const ancient = computeReadiness(
      input({ interview: { score: 80, count: 4, lastAt: daysAgo(900) } }),
    );
    expect(ancient.recencyFactor).toBeGreaterThan(0.5);
  });
});

describe("repeated mistake penalty", () => {
  it("costs two points per repeated mistake", () => {
    const clean = computeReadiness(
      input({
        interview: { score: 80, count: 5, lastAt: NOW },
        skillsCovered: 6,
        meanSkillConfidence: 0.6,
      }),
    );
    const withMistakes = computeReadiness(
      input({
        interview: { score: 80, count: 5, lastAt: NOW },
        skillsCovered: 6,
        meanSkillConfidence: 0.6,
        repeatedMistakes: 2,
      }),
    );

    expect(withMistakes.mistakePenalty).toBe(4);
    expect(clean.readiness - withMistakes.readiness).toBe(4);
  });

  it("caps the penalty so mistakes sting without dominating", () => {
    const result = computeReadiness(
      input({
        interview: { score: 80, count: 5, lastAt: NOW },
        repeatedMistakes: 50,
      }),
    );
    expect(result.mistakePenalty).toBe(8);
  });

  it("never drives readiness below zero", () => {
    const result = computeReadiness(
      input({
        interview: { score: 2, count: 1, lastAt: NOW },
        repeatedMistakes: 20,
      }),
    );
    expect(result.readiness).toBeGreaterThanOrEqual(0);
  });
});

describe("toConfidenceLevel", () => {
  it("maps the numeric score onto the four bands", () => {
    expect(toConfidenceLevel(0)).toBe("NONE");
    expect(toConfidenceLevel(0.2)).toBe("LOW");
    expect(toConfidenceLevel(0.5)).toBe("MEDIUM");
    expect(toConfidenceLevel(0.85)).toBe("HIGH");
  });
});

describe("computeJobReadiness", () => {
  function scores(entries: Array<[string, number, number]>) {
    return new Map(
      entries.map(([key, score, confidence]) => [key, { score, confidence }]),
    );
  }

  it("counts a required skill for more than a preferred one", () => {
    const requiredStrong = computeJobReadiness({
      requirements: [
        { skillKey: "dsa", label: "DSA", required: true },
        { skillKey: "dbms", label: "DBMS", required: false },
      ],
      skillScores: scores([
        ["dsa", 90, 0.8],
        ["dbms", 20, 0.8],
      ]),
    });

    const preferredStrong = computeJobReadiness({
      requirements: [
        { skillKey: "dsa", label: "DSA", required: false },
        { skillKey: "dbms", label: "DBMS", required: true },
      ],
      skillScores: scores([
        ["dsa", 90, 0.8],
        ["dbms", 20, 0.8],
      ]),
    });

    expect(requiredStrong.overall).toBeGreaterThan(preferredStrong.overall);
  });

  it("treats a skill with no evidence as a gap, not a pass", () => {
    const result = computeJobReadiness({
      requirements: [{ skillKey: "system-design", label: "System design", required: true }],
      skillScores: scores([["system-design", 88, 0.02]]),
    });

    expect(result.covered).toHaveLength(0);
    expect(result.gaps.map((gap) => gap.label)).toContain("System design");
  });

  it("lists unmappable requirements separately and still counts them as risk", () => {
    const result = computeJobReadiness({
      requirements: [
        { skillKey: null, label: "Salesforce Apex", required: true },
        { skillKey: "dsa", label: "DSA", required: true },
      ],
      skillScores: scores([["dsa", 100, 0.9]]),
    });

    expect(result.unknown).toContain("Salesforce Apex");
    // 100 on one of two equally weighted requirements → 50, not 100.
    expect(result.overall).toBeLessThan(100);
  });

  it("returns zero for an empty requirement list without dividing by zero", () => {
    const result = computeJobReadiness({
      requirements: [],
      skillScores: new Map(),
    });
    expect(result.overall).toBe(0);
    expect(Number.isFinite(result.overall)).toBe(true);
  });

  it("puts a strong measured skill in covered", () => {
    const result = computeJobReadiness({
      requirements: [{ skillKey: "dbms", label: "DBMS", required: true }],
      skillScores: scores([["dbms", 82, 0.7]]),
    });
    expect(result.covered.map((item) => item.label)).toEqual(["DBMS"]);
    expect(result.gaps).toHaveLength(0);
  });
});
