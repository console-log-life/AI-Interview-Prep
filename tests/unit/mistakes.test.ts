import { describe, expect, it } from "vitest";

import {
  CONCEPT_RULES,
  classifyMissingPoint,
  detectMistakes,
  evaluateMistakeStatus,
  isRepeated,
  mistakePriority,
} from "@/lib/mistakes/detect";

/**
 * The mistake memory only works if two different phrasings of the same error
 * collapse onto one stable slug. Everything here tests that normalisation and
 * the guards that stop it recording noise.
 */

const NOW = new Date("2026-06-01T12:00:00Z");

function daysAgo(days: number): Date {
  return new Date(NOW.getTime() - days * 86_400_000);
}

describe("concept rules", () => {
  it("has unique concept slugs", () => {
    const slugs = CONCEPT_RULES.map((rule) => rule.concept);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("gives every rule at least one pattern and a human label", () => {
    for (const rule of CONCEPT_RULES) {
      expect(rule.patterns.length).toBeGreaterThan(0);
      expect(rule.label.length).toBeGreaterThan(3);
    }
  });

  /**
   * Regression guard. An unanchored short token like `ttl` matched inside
   * "a li(ttl)e" and mislabelled an unrelated note as a caching mistake.
   * Any short alternative must be word-bounded.
   */
  it("word-bounds every short alternative so it cannot match mid-word", () => {
    for (const rule of CONCEPT_RULES) {
      for (const pattern of rule.patterns) {
        const alternatives = pattern.source.split("|");
        for (const alternative of alternatives) {
          const bare = alternative.replace(/\\b/g, "");
          // Only plain alphanumeric runs are at risk; anything with regex
          // syntax is already deliberate.
          if (/^[a-z0-9-]+$/i.test(bare) && bare.length <= 4) {
            expect(
              alternative.startsWith("\\b") && alternative.endsWith("\\b"),
            ).toBe(true);
          }
        }
      }
    }
  });
});

describe("classifyMissingPoint", () => {
  it("collapses different phrasings of the same error onto one slug", () => {
    const first = classifyMissingPoint(
      "Did not distinguish a process from a thread",
    );
    const second = classifyMissingPoint(
      "The candidate confused threads with processes throughout",
    );

    expect(first?.concept).toBe("process-vs-thread");
    expect(second?.concept).toBe(first?.concept);
  });

  it("recognises complexity analysis gaps", () => {
    expect(
      classifyMissingPoint("No time complexity was given")?.concept,
    ).toBe("time-complexity");
    expect(
      classifyMissingPoint("Did not mention the big-O of the approach")?.concept,
    ).toBe("time-complexity");
  });

  it("returns null rather than forcing an unrecognised note into a bucket", () => {
    expect(
      classifyMissingPoint("The candidate spoke a little quietly"),
    ).toBeNull();
  });

  it("ignores fragments too short to classify", () => {
    expect(classifyMissingPoint("no")).toBeNull();
    expect(classifyMissingPoint("   ")).toBeNull();
  });

  it("keeps the original wording as the occurrence detail", () => {
    const point = "No time complexity was given for the nested loop";
    expect(classifyMissingPoint(point)?.detail).toBe(point);
  });

  it("truncates a very long note rather than storing it whole", () => {
    const point = `Missing time complexity. ${"x".repeat(900)}`;
    expect(classifyMissingPoint(point)?.detail.length).toBeLessThanOrEqual(500);
  });
});

describe("detectMistakes", () => {
  it("records nothing for a strong answer, however pedantic the note", () => {
    const mistakes = detectMistakes({
      score: 9,
      missingPoints: ["Could have mentioned time complexity"],
    });
    expect(mistakes).toEqual([]);
  });

  it("records a mistake for a weak answer with an identified gap", () => {
    const mistakes = detectMistakes({
      score: 4,
      missingPoints: ["No time complexity was given"],
    });
    expect(mistakes).toHaveLength(1);
    expect(mistakes[0].concept).toBe("time-complexity");
  });

  it("deduplicates when one answer trips the same concept twice", () => {
    const mistakes = detectMistakes({
      score: 3,
      missingPoints: [
        "No time complexity given",
        "Time complexity of the loop was never analysed",
      ],
    });
    expect(mistakes).toHaveLength(1);
  });

  it("falls back to a vague-answer mistake when nothing classifies", () => {
    const mistakes = detectMistakes({
      score: 2,
      missingPoints: ["The answer never really addressed the question"],
    });
    expect(mistakes).toHaveLength(1);
    expect(mistakes[0].concept).toBe("vague-answer");
  });

  it("does not invent a mistake when there are no missing points at all", () => {
    expect(detectMistakes({ score: 1, missingPoints: [] })).toEqual([]);
  });

  it("honours a custom score threshold", () => {
    const point = ["No time complexity was given"];
    expect(detectMistakes({ score: 8, missingPoints: point })).toEqual([]);
    expect(
      detectMistakes({ score: 8, missingPoints: point, scoreThreshold: 9 }),
    ).toHaveLength(1);
  });
});

describe("evaluateMistakeStatus", () => {
  it("is ACTIVE while the mistake is still recent", () => {
    expect(
      evaluateMistakeStatus({
        frequency: 3,
        lastSeenAt: daysAgo(2),
        now: NOW,
      }),
    ).toBe("ACTIVE");
  });

  it("becomes IMPROVING after a fortnight without recurrence", () => {
    expect(
      evaluateMistakeStatus({
        frequency: 3,
        lastSeenAt: daysAgo(20),
        now: NOW,
      }),
    ).toBe("IMPROVING");
  });

  it("becomes RESOLVED after a month without recurrence", () => {
    expect(
      evaluateMistakeStatus({
        frequency: 3,
        lastSeenAt: daysAgo(40),
        now: NOW,
      }),
    ).toBe("RESOLVED");
  });

  it("respects custom windows", () => {
    expect(
      evaluateMistakeStatus({
        frequency: 2,
        lastSeenAt: daysAgo(10),
        now: NOW,
        improvingAfterDays: 5,
        resolvedAfterDays: 60,
      }),
    ).toBe("IMPROVING");
  });
});

describe("isRepeated", () => {
  it("needs more than one occurrence", () => {
    expect(isRepeated(1)).toBe(false);
    expect(isRepeated(2)).toBe(true);
  });
});

describe("mistakePriority", () => {
  it("ranks frequency above severity", () => {
    const frequentLow = mistakePriority({
      frequency: 4,
      severity: "LOW",
      status: "ACTIVE",
    });
    const rareHigh = mistakePriority({
      frequency: 1,
      severity: "HIGH",
      status: "ACTIVE",
    });
    expect(frequentLow).toBeGreaterThan(rareHigh);
  });

  it("halves the weight of an improving mistake", () => {
    const active = mistakePriority({
      frequency: 2,
      severity: "HIGH",
      status: "ACTIVE",
    });
    const improving = mistakePriority({
      frequency: 2,
      severity: "HIGH",
      status: "IMPROVING",
    });
    expect(improving).toBe(active / 2);
  });

  it("zeroes a resolved mistake so it drops off the dashboard", () => {
    expect(
      mistakePriority({ frequency: 9, severity: "HIGH", status: "RESOLVED" }),
    ).toBe(0);
  });
});
