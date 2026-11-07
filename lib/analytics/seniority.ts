import type { ExperienceLevel } from "@prisma/client";

/**
 * Reading a job ad's seniority onto the same scale as the candidate.
 *
 * The JD analysis already captured `experienceReq` as written — "3-5 years of
 * backend experience", "Senior Engineer, 7+ yrs". Useful to read, useless to
 * compare: the candidate's own level is a four-value enum, so nothing could
 * answer "is this role above me?".
 *
 * Derived here rather than asked of the model, for two reasons. It works on
 * every job description already in the database instead of only ones analysed
 * from now on, and a wrong answer is a *visible* mis-parse of text the
 * candidate can see on the same screen rather than an opaque model judgement.
 *
 * Returns null rather than guessing. An ad that does not state its seniority is
 * common, and "we could not tell" is the honest output — inventing MID because
 * it is the middle would be a number the page could not defend.
 */

const ORDER: ExperienceLevel[] = ["FRESHER", "JUNIOR", "MID", "SENIOR"];

/** Explicit words beat year ranges: an ad calling itself senior is senior. */
const EXPLICIT: Array<[RegExp, ExperienceLevel]> = [
  [/\b(intern|internship|trainee|fresher|graduate|new\s+grad|entry[-\s]?level)\b/i, "FRESHER"],
  [/\b(junior|jr\.?|associate|early[-\s]?career)\b/i, "JUNIOR"],
  [/\b(principal|staff|lead|senior|sr\.?|architect|head\s+of)\b/i, "SENIOR"],
  [/\b(mid[-\s]?level|intermediate)\b/i, "MID"],
];

/**
 * Years → band.
 *
 * Deliberately generous at the bottom: "0-1 years" is a fresher role however it
 * is dressed up, and a graduate reading otherwise would be discouraged from a
 * job they are in fact the target for.
 */
function bandForYears(years: number): ExperienceLevel {
  if (years < 1) return "FRESHER";
  if (years < 3) return "JUNIOR";
  if (years < 6) return "MID";
  return "SENIOR";
}

/**
 * The lowest number of years the ad asks for.
 *
 * The *lower* bound of a range is what decides eligibility — "3-5 years" is
 * open to someone with three. Taking the upper bound would read every range as
 * stricter than it is.
 */
function minimumYears(text: string): number | null {
  /**
   * The lookarounds are load-bearing.
   *
   * Without them `\d{1,2}` happily takes "20" out of "2024" and then "24" as
   * the range end, so "founded in 2024" read as a 24-year requirement and the
   * ad came out SENIOR. Forbidding an adjacent digit means a number longer
   * than two digits is not treated as a year count at all.
   */
  const matches = [
    ...text.matchAll(
      /(?<!\d)(\d{1,2})(?!\d)\s*(?:\+|plus)?\s*(?:-|–|to)?\s*(?:(?<!\d)(\d{1,2})(?!\d))?\s*(?:\+)?\s*(?:years?|yrs?)\b/gi,
    ),
  ];

  const lows: number[] = [];
  for (const match of matches) {
    const first = Number.parseInt(match[1], 10);
    if (!Number.isFinite(first)) continue;
    // Guards against a stray "2024 years" style mis-parse.
    if (first > 50) continue;
    lows.push(first);
  }

  return lows.length > 0 ? Math.min(...lows) : null;
}

/**
 * Derives a seniority band from whatever the ad said.
 *
 * `title` is considered as well as the requirement line, because plenty of ads
 * state seniority only in the job title.
 */
export function deriveSeniority(
  experienceReq: string | null | undefined,
  title?: string | null,
): ExperienceLevel | null {
  const text = [experienceReq ?? "", title ?? ""].join(" ").trim();
  if (!text) return null;

  for (const [pattern, level] of EXPLICIT) {
    if (pattern.test(text)) return level;
  }

  const years = minimumYears(text);
  return years === null ? null : bandForYears(years);
}

export type SeniorityComparison = {
  jd: ExperienceLevel;
  candidate: ExperienceLevel;
  /** Positive when the role sits above the candidate. */
  gap: number;
  verdict: "ABOVE" | "MATCH" | "BELOW";
  /** One line, safe to render as-is. */
  message: string;
};

/**
 * Compares the role to the candidate.
 *
 * Phrased as information, not a verdict on whether to apply. A role one band
 * up is the normal stretch application, and a tool that told someone not to
 * try would be doing them harm — so "above" says what to expect in the
 * interview instead.
 */
export function compareSeniority(
  jd: ExperienceLevel | null,
  candidate: ExperienceLevel | null | undefined,
): SeniorityComparison | null {
  if (!jd || !candidate) return null;

  const gap = ORDER.indexOf(jd) - ORDER.indexOf(candidate);
  if (gap < 0) {
    return {
      jd,
      candidate,
      gap,
      verdict: "BELOW",
      message: `This role is pitched below your stated level (${label(jd)} vs your ${label(candidate)}). Expect fundamentals rather than depth.`,
    };
  }
  if (gap === 0) {
    return {
      jd,
      candidate,
      gap,
      verdict: "MATCH",
      message: `This role matches your stated level (${label(jd)}).`,
    };
  }
  return {
    jd,
    candidate,
    gap,
    verdict: "ABOVE",
    message:
      gap === 1
        ? `This role is one level above your stated ${label(candidate)} — a normal stretch. Expect to be pushed on depth and on decisions you owned.`
        : `This role is ${gap} levels above your stated ${label(candidate)}. Expect questions about leading work, not just doing it.`,
  };
}

function label(level: ExperienceLevel): string {
  return level === "FRESHER"
    ? "fresher"
    : level === "JUNIOR"
      ? "junior"
      : level === "MID"
        ? "mid-level"
        : "senior";
}
