import { describe, expect, it } from "vitest";

import {
  DIMENSION_LABEL,
  STAR_PARTS,
  expectsStarStructure,
  summarizeCommunication,
  type CommunicationRow,
} from "@/lib/communication/aggregate";

/**
 * The governing rule: STAR is only scored where STAR was expected. Reporting a
 * missing "Result" on a hash-collision answer would be noise dressed up as
 * feedback, and these tests hold that line.
 */

function row(overrides: Partial<CommunicationRow> = {}): CommunicationRow {
  return {
    clarity: 7,
    structure: 7,
    conciseness: 7,
    technicalExplanation: 7,
    starSituation: false,
    starTask: false,
    starAction: false,
    starResult: false,
    isBehavioural: false,
    ...overrides,
  };
}

describe("summarizeCommunication with no data", () => {
  const summary = summarizeCommunication([]);

  it("reports nothing analysed rather than a zero score", () => {
    expect(summary.analysed).toBe(0);
    for (const dimension of Object.keys(DIMENSION_LABEL)) {
      expect(
        summary.means[dimension as keyof typeof summary.means],
      ).toBeNull();
    }
  });

  it("has no weakest dimension and no STAR claim", () => {
    expect(summary.weakest).toBeNull();
    expect(summary.starCoverage).toBeNull();
    expect(summary.starGaps).toEqual([]);
  });
});

describe("summarizeCommunication means", () => {
  it("averages each dimension across analysed answers", () => {
    const summary = summarizeCommunication([
      row({ clarity: 4, structure: 8 }),
      row({ clarity: 6, structure: 6 }),
    ]);
    expect(summary.means.clarity).toBe(5);
    expect(summary.means.structure).toBe(7);
    expect(summary.analysed).toBe(2);
  });

  it("identifies the weakest dimension", () => {
    const summary = summarizeCommunication([
      row({ clarity: 9, structure: 3, conciseness: 8, technicalExplanation: 7 }),
    ]);
    expect(summary.weakest).toBe("structure");
  });

  it("resolves ties deterministically", () => {
    const rows = [row({ clarity: 5, structure: 5, conciseness: 5, technicalExplanation: 5 })];
    expect(summarizeCommunication(rows).weakest).toBe(
      summarizeCommunication(rows).weakest,
    );
  });
});

describe("STAR reporting", () => {
  it("reports no STAR coverage when nothing behavioural was analysed", () => {
    const summary = summarizeCommunication([row(), row()]);
    expect(summary.behaviouralCount).toBe(0);
    expect(summary.starCoverage).toBeNull();
    expect(summary.starGaps).toEqual([]);
  });

  it("computes coverage only across behavioural answers", () => {
    const summary = summarizeCommunication([
      // Technical answer — its false STAR flags must not count as gaps.
      row({ isBehavioural: false }),
      row({
        isBehavioural: true,
        starSituation: true,
        starTask: true,
        starAction: true,
        starResult: true,
      }),
    ]);

    expect(summary.behaviouralCount).toBe(1);
    expect(summary.starCoverage?.result).toBe(1);
    expect(summary.starGaps).toEqual([]);
  });

  it("flags a STAR part missing from more than half the answers", () => {
    const summary = summarizeCommunication([
      row({
        isBehavioural: true,
        starSituation: true,
        starTask: true,
        starAction: true,
        starResult: false,
      }),
      row({
        isBehavioural: true,
        starSituation: true,
        starTask: true,
        starAction: true,
        starResult: false,
      }),
    ]);

    expect(summary.starCoverage?.result).toBe(0);
    expect(summary.starGaps).toEqual(["result"]);
  });

  it("does not flag a part present in exactly half the answers", () => {
    const summary = summarizeCommunication([
      row({ isBehavioural: true, starResult: true }),
      row({ isBehavioural: true, starResult: false }),
    ]);
    expect(summary.starCoverage?.result).toBe(0.5);
    expect(summary.starGaps).not.toContain("result");
  });

  it("covers all four STAR parts in the coverage record", () => {
    const summary = summarizeCommunication([row({ isBehavioural: true })]);
    for (const part of STAR_PARTS) {
      expect(summary.starCoverage?.[part]).toBeTypeOf("number");
    }
  });
});

describe("expectsStarStructure", () => {
  it("is true for behavioural and HR rounds regardless of topic", () => {
    expect(
      expectsStarStructure({ interviewType: "BEHAVIORAL", topic: "Arrays" }),
    ).toBe(true);
    expect(expectsStarStructure({ interviewType: "HR", topic: null })).toBe(true);
  });

  it("is false for a technical topic in a technical round", () => {
    expect(
      expectsStarStructure({ interviewType: "TECHNICAL", topic: "Hashing" }),
    ).toBe(false);
  });

  it("catches a behavioural question inside a mixed round", () => {
    expect(
      expectsStarStructure({
        interviewType: "MIXED",
        topic: "Teamwork and conflict",
      }),
    ).toBe(true);
    expect(
      expectsStarStructure({ interviewType: "MIXED", topic: "Leadership" }),
    ).toBe(true);
  });

  it("handles a missing topic without throwing", () => {
    expect(
      expectsStarStructure({ interviewType: "TECHNICAL", topic: null }),
    ).toBe(false);
  });
});
