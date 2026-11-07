/**
 * Scoring calibration against the real evaluator.
 *
 * Runs the twelve hand-written cases in `tests/fixtures/calibration.ts` through
 * the configured provider and prints expected range against actual score.
 *
 * What this is for: a rubric can be perfectly implemented and still grade
 * badly. The failures that matter are not individual numbers being a point out
 * — a language model will not reproduce a score, and chasing one would be
 * tuning against noise. They are *systematic*, and each one misleads the
 * candidate in a specific way:
 *
 *   - "I don't know" scoring like a partial answer → the report tells someone
 *     they are doing fine when they answered nothing.
 *   - A confidently wrong answer outscoring a hedged correct one → the product
 *     rewards fluency over accuracy, which is the worst thing a grader can do.
 *   - An off-topic answer scoring well → fluent irrelevance passes.
 *
 * Those three are checked explicitly at the end, as orderings rather than
 * thresholds.
 *
 *   npm run calibrate
 *
 * Twelve API calls. Costs real quota, so it is a script and never a test.
 */

import { createRequire } from "node:module";

import { config as loadEnv } from "dotenv";

import {
  CALIBRATION_CASES,
  inRange,
  type CalibrationCase,
} from "../tests/fixtures/calibration";
import type { CandidateContext, InterviewSettings } from "../types/ai";

loadEnv();

/** See the note in `scripts/smoke-real-ai.ts` — `lib/` is server-only. */
const requireFromHere = createRequire(import.meta.url);
const serverOnly = requireFromHere.resolve("server-only");
requireFromHere.cache[serverOnly] = {
  id: serverOnly,
  filename: serverOnly,
  loaded: true,
  exports: {},
} as NodeModule;

/** Invented candidate, so the evaluator has the context it expects. */
const CANDIDATE: CandidateContext = {
  name: "Test Candidate",
  targetRole: "Backend Engineer",
  experienceLevel: "JUNIOR",
  skills: ["TypeScript", "Node.js", "PostgreSQL"],
};

function settingsFor(testCase: CalibrationCase): InterviewSettings {
  return {
    type: testCase.type,
    persona: "PROFESSIONAL",
    difficulty: "MEDIUM",
    plannedQuestions: 6,
  };
}

type Row = {
  testCase: CalibrationCase;
  score: number | null;
  error: string | null;
};

function pad(text: string, width: number): string {
  return text.length >= width ? text.slice(0, width) : text.padEnd(width);
}

async function main(): Promise<void> {
  const { getAIService, aiAvailable } = await import("../lib/ai");

  if (!aiAvailable()) {
    console.error(
      "No AI provider configured. Set AI_PROVIDER and the matching key in .env.",
    );
    process.exit(1);
  }

  const ai = getAIService();

  /**
   * Optional id filter: `npm run calibrate -- design-buzzwords`.
   *
   * Exists because the provider rate-limits. Re-running the whole set to
   * recover one case that hit a 429 would spend twelve calls to learn one
   * thing, and the quota is shared with the demo.
   */
  const wanted = process.argv.slice(2).filter((arg) => !arg.startsWith("-"));
  const cases =
    wanted.length === 0
      ? CALIBRATION_CASES
      : CALIBRATION_CASES.filter((testCase) =>
          wanted.some((id) => testCase.id.includes(id)),
        );

  if (cases.length === 0) {
    console.error(`No calibration case matches: ${wanted.join(", ")}`);
    process.exit(1);
  }

  console.log(`Provider: ${process.env.AI_PROVIDER ?? "(default)"} · model: ${ai.model}`);
  console.log(`Running ${cases.length} case(s) (one call each).\n`);

  const rows: Row[] = [];

  for (const testCase of cases) {
    try {
      const evaluation = await ai.evaluateInterviewAnswer({
        candidate: CANDIDATE,
        settings: settingsFor(testCase),
        question: testCase.question,
        answer: testCase.answer,
        topic: testCase.topic,
      });
      rows.push({ testCase, score: evaluation.score, error: null });
    } catch (error) {
      rows.push({
        testCase,
        score: null,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // --- table ---------------------------------------------------------------
  console.log(
    `${pad("case", 24)} ${pad("quality", 11)} ${pad("expected", 9)} ${pad("actual", 7)} verdict`,
  );
  console.log("-".repeat(66));

  for (const row of rows) {
    const expected = `${row.testCase.expected[0]}-${row.testCase.expected[1]}`;
    if (row.score === null) {
      console.log(
        `${pad(row.testCase.id, 24)} ${pad(row.testCase.quality, 11)} ${pad(expected, 9)} ${pad("ERR", 7)} ${row.error}`,
      );
      continue;
    }
    const ok = inRange(row.score, row.testCase.expected);
    const drift = row.score < row.testCase.expected[0] ? "too low" : "too high";
    console.log(
      `${pad(row.testCase.id, 24)} ${pad(row.testCase.quality, 11)} ${pad(expected, 9)} ${pad(String(row.score), 7)} ${ok ? "in range" : drift}`,
    );
  }

  // --- summary -------------------------------------------------------------
  const scored = rows.filter((r) => r.score !== null);
  const hits = scored.filter((r) => inRange(r.score!, r.testCase.expected));
  console.log(
    `\n${hits.length}/${scored.length} in range · ${rows.length} API call(s) made`,
  );

  // --- the orderings that actually matter ----------------------------------
  console.log("\nSystematic checks (orderings, not thresholds):");

  const best = (quality: string) =>
    Math.max(
      ...scored.filter((r) => r.testCase.quality === quality).map((r) => r.score!),
      Number.NEGATIVE_INFINITY,
    );
  const worst = (quality: string) =>
    Math.min(
      ...scored.filter((r) => r.testCase.quality === quality).map((r) => r.score!),
      Number.POSITIVE_INFINITY,
    );

  const checks: Array<[string, boolean, string]> = [
    [
      '"I don\'t know" is not treated as a partial answer',
      best("DONT_KNOW") <= 3,
      `highest DONT_KNOW score: ${fmt(best("DONT_KNOW"))} (must be <= 3)`,
    ],
    [
      "confidently wrong scores below hedged-but-correct",
      best("WRONG") < worst("AVERAGE"),
      `highest WRONG ${fmt(best("WRONG"))} vs lowest AVERAGE ${fmt(worst("AVERAGE"))}`,
    ],
    [
      "off-topic does not inherit credit for sounding technical",
      best("OFF_TOPIC") <= 3,
      `highest OFF_TOPIC score: ${fmt(best("OFF_TOPIC"))} (must be <= 3)`,
    ],
    /**
     * No *inversion*, rather than strict separation.
     *
     * The expected ranges deliberately overlap — EXCELLENT is 8-10 and one
     * AVERAGE case is 5-8 — because a strong-but-textbook answer and a weak
     * end of excellent genuinely belong in the same region. So a tie at the
     * boundary is the set working as designed; an excellent answer scoring
     * *below* an average one is the real defect, and that is what is checked.
     */
    [
      "no excellent answer scores below an average one",
      worst("EXCELLENT") >= best("AVERAGE"),
      `lowest EXCELLENT ${fmt(worst("EXCELLENT"))} vs highest AVERAGE ${fmt(best("AVERAGE"))}`,
    ],
  ];

  let systematic = 0;
  for (const [label, ok, detail] of checks) {
    if (!ok) systematic += 1;
    console.log(`  ${ok ? "OK  " : "FAIL"} ${label} — ${detail}`);
  }

  console.log(
    systematic === 0
      ? "\nNo systematic problem. Individual numbers outside a range are model variance, not a bug to tune."
      : `\n${systematic} systematic problem(s). This is worth one targeted prompt fix.`,
  );

  if (rows.some((r) => r.error)) process.exit(1);
}

function fmt(value: number): string {
  return Number.isFinite(value) ? String(value) : "n/a";
}

void main().catch((error) => {
  console.error("Calibration crashed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
