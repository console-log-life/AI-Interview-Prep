import { describe, expect, it } from "vitest";

import { buildJobRequirements } from "@/lib/analytics/job-requirements";
import { computeJobReadiness } from "@/lib/analytics/readiness";

describe("buildJobRequirements", () => {
  it("marks required and preferred skills correctly", () => {
    const requirements = buildJobRequirements({
      required: ["SQL"],
      preferred: ["Docker"],
    });

    expect(requirements.find((r) => r.label === "SQL")?.required).toBe(true);
    expect(requirements.find((r) => r.label === "Docker")?.required).toBe(false);
  });

  it("counts a skill in both lists once, as required", () => {
    const requirements = buildJobRequirements({
      required: ["SQL"],
      preferred: ["sql"],
    });

    expect(requirements).toHaveLength(1);
    expect(requirements[0].required).toBe(true);
  });

  it("de-duplicates case- and whitespace-insensitively", () => {
    const requirements = buildJobRequirements({
      required: ["Dynamic Programming", "  dynamic programming  "],
      preferred: [],
    });
    expect(requirements).toHaveLength(1);
  });

  it("drops empty and whitespace-only entries", () => {
    const requirements = buildJobRequirements({
      required: ["", "   ", "SQL"],
      preferred: [],
    });
    expect(requirements).toHaveLength(1);
    expect(requirements[0].label).toBe("SQL");
  });

  it("maps a known skill onto the graph", () => {
    const requirements = buildJobRequirements({
      required: ["SQL joins"],
      preferred: [],
    });
    expect(requirements[0].skillKey).toBe("dbms.joins");
  });

  it("keeps an unmappable requirement with a null key rather than dropping it", () => {
    const requirements = buildJobRequirements({
      required: ["Salesforce Apex"],
      preferred: [],
    });
    expect(requirements).toHaveLength(1);
    expect(requirements[0].skillKey).toBeNull();
  });

  it("preserves the original label for display", () => {
    const requirements = buildJobRequirements({
      required: ["  PostgreSQL  "],
      preferred: [],
    });
    expect(requirements[0].label).toBe("PostgreSQL");
  });

  it("returns an empty list for empty input", () => {
    expect(buildJobRequirements({ required: [], preferred: [] })).toEqual([]);
  });
});

describe("buildJobRequirements feeding computeJobReadiness", () => {
  it("keeps an unmappable requirement as a drag on the score", () => {
    const requirements = buildJobRequirements({
      required: ["SQL joins", "Salesforce Apex"],
      preferred: [],
    });

    const result = computeJobReadiness({
      requirements,
      skillScores: new Map([["dbms.joins", { score: 100, confidence: 0.9 }]]),
    });

    // 100 on one of two equally weighted requirements — not 100 overall.
    expect(result.overall).toBeLessThan(100);
    expect(result.unknown).toContain("Salesforce Apex");
  });

  it("does not double-count a skill listed twice", () => {
    const deduped = computeJobReadiness({
      requirements: buildJobRequirements({
        required: ["SQL joins"],
        preferred: ["SQL joins"],
      }),
      skillScores: new Map([["dbms.joins", { score: 80, confidence: 0.9 }]]),
    });

    const single = computeJobReadiness({
      requirements: buildJobRequirements({
        required: ["SQL joins"],
        preferred: [],
      }),
      skillScores: new Map([["dbms.joins", { score: 80, confidence: 0.9 }]]),
    });

    expect(deduped.overall).toBe(single.overall);
  });
});
