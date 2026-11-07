import { describe, expect, it } from "vitest";

import { compareSeniority, deriveSeniority } from "@/lib/analytics/seniority";

/**
 * Reading a job ad's seniority onto the candidate's own scale.
 *
 * The rule that matters most: **null rather than a guess.** An ad that does not
 * state its seniority is common, and inventing MID because it is the middle
 * would put a number on the page that nothing could defend.
 */

describe("deriveSeniority — explicit wording", () => {
  it.each([
    ["Internship, 6 months", "FRESHER"],
    ["Graduate Engineer", "FRESHER"],
    ["New grad welcome", "FRESHER"],
    ["Entry-level position", "FRESHER"],
    ["Junior Developer", "JUNIOR"],
    ["Jr. Backend Engineer", "JUNIOR"],
    ["Associate Software Engineer", "JUNIOR"],
    ["Mid-level engineer", "MID"],
    ["Intermediate developer", "MID"],
    ["Senior Software Engineer", "SENIOR"],
    ["Sr. Backend Developer", "SENIOR"],
    ["Staff Engineer", "SENIOR"],
    ["Principal Engineer", "SENIOR"],
    ["Tech Lead", "SENIOR"],
    ["Solutions Architect", "SENIOR"],
  ])("reads %s as %s", (text, expected) => {
    expect(deriveSeniority(text)).toBe(expected);
  });

  it("lets explicit wording beat a year range", () => {
    // An ad calling itself senior is senior, whatever number follows.
    expect(deriveSeniority("Senior Engineer, 2+ years")).toBe("SENIOR");
  });
});

describe("deriveSeniority — year ranges", () => {
  it.each([
    ["0-1 years of experience", "FRESHER"],
    ["1-2 years", "JUNIOR"],
    ["2 years experience", "JUNIOR"],
    ["3-5 years of backend experience", "MID"],
    ["4 yrs", "MID"],
    ["6+ years", "SENIOR"],
    ["8-12 years", "SENIOR"],
  ])("reads %s as %s", (text, expected) => {
    expect(deriveSeniority(text)).toBe(expected);
  });

  it("uses the lower bound of a range, which is what decides eligibility", () => {
    // "3-5 years" is open to someone with three; reading it as 5 would make
    // every range stricter than the employer wrote it.
    expect(deriveSeniority("3-5 years")).toBe("MID");
    expect(deriveSeniority("5-8 years")).toBe("MID");
  });

  it("ignores an implausible year count", () => {
    expect(deriveSeniority("founded in 2024 years ago")).toBeNull();
  });
});

describe("deriveSeniority — the title is considered too", () => {
  it("falls back to the job title when the requirement line is silent", () => {
    expect(deriveSeniority(null, "Senior Platform Engineer")).toBe("SENIOR");
  });

  it("prefers a signal from either field over nothing", () => {
    expect(deriveSeniority("Competitive salary", "Junior QA")).toBe("JUNIOR");
  });
});

describe("deriveSeniority — refuses to guess", () => {
  it.each([
    ["null", null],
    ["undefined", undefined],
    ["empty", ""],
    ["whitespace", "   "],
  ])("returns null for %s", (_label, value) => {
    expect(deriveSeniority(value)).toBeNull();
  });

  it("returns null when the ad states no seniority at all", () => {
    expect(deriveSeniority("Strong communication skills required")).toBeNull();
    expect(deriveSeniority("Experience with Kubernetes")).toBeNull();
  });
});

describe("compareSeniority", () => {
  it("reports a match", () => {
    const result = compareSeniority("MID", "MID");
    expect(result?.verdict).toBe("MATCH");
    expect(result?.gap).toBe(0);
  });

  it("reports one level up as a normal stretch, not a warning", () => {
    // A tool that told someone not to apply would be doing them harm.
    const result = compareSeniority("SENIOR", "MID");
    expect(result?.verdict).toBe("ABOVE");
    expect(result?.gap).toBe(1);
    expect(result?.message).toMatch(/stretch/i);
    expect(result?.message).not.toMatch(/do not apply|unqualified/i);
  });

  it("says how far above when the gap is wider", () => {
    const result = compareSeniority("SENIOR", "FRESHER");
    expect(result?.gap).toBe(3);
    expect(result?.message).toMatch(/3 levels above/);
  });

  it("reports a role below the candidate", () => {
    const result = compareSeniority("JUNIOR", "SENIOR");
    expect(result?.verdict).toBe("BELOW");
    expect(result?.gap).toBeLessThan(0);
    expect(result?.message).toMatch(/fundamentals/i);
  });

  it("returns null when either side is unknown", () => {
    expect(compareSeniority(null, "MID")).toBeNull();
    expect(compareSeniority("MID", null)).toBeNull();
    expect(compareSeniority("MID", undefined)).toBeNull();
  });

  it("names both levels in the message, so the comparison is checkable", () => {
    const result = compareSeniority("SENIOR", "JUNIOR");
    expect(result?.message).toMatch(/junior/i);
  });
});
