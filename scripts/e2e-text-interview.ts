/**
 * One complete text interview, against the dev database and the real provider.
 *
 * The last thing between the code and the demo that nothing had exercised: the
 * unit suite mocks Prisma and the AI, the smoke test calls the AI without a
 * database, and the browser is unavailable here. So the path that actually
 * matters — create, answer, grade, complete, then load exactly what the result
 * page loads — had never run end to end against real rows.
 *
 * It is specifically a check that the two newest columns survive a round trip
 * through Postgres, not just through zod: `InterviewReport.evidence` and
 * `InterviewEvaluation.rubricNotes` are JSONB, written by the service and read
 * back by the page through their own parsers.
 *
 *   npx tsx scripts/e2e-text-interview.ts            # keeps the interview
 *   npx tsx scripts/e2e-text-interview.ts --cleanup  # deletes it afterwards
 *
 * Costs real quota: 7 calls (1 opening question, 3 × [evaluate + next], and a
 * report; the third answer is the last planned one, so no fourth question is
 * generated). Actual calls are counted from `AIUsageLog`, not assumed.
 *
 * Cleanup is **opt-in on purpose.** Deleting the interview cascades its
 * messages, evaluations and report, but the derived rows it also wrote —
 * topic performance, the progress snapshot, recommendations — are aggregates
 * that do not cleanly reverse. Removing the interview while leaving those
 * behind would leave the dashboard showing scores with no interview behind
 * them, which is exactly the invented data this project refuses to display. So
 * the default is to keep a real, consistent interview, which is also the
 * better thing to have on screen tomorrow.
 */

import { createRequire } from "node:module";

import { config as loadEnv } from "dotenv";

loadEnv();

/** See `scripts/smoke-real-ai.ts` — everything under `lib/` is server-only. */
const requireFromHere = createRequire(import.meta.url);
const serverOnly = requireFromHere.resolve("server-only");
requireFromHere.cache[serverOnly] = {
  id: serverOnly,
  filename: serverOnly,
  loaded: true,
  exports: {},
} as NodeModule;

const DEMO_EMAIL = "student@preppilot.local";

/**
 * Three answers of deliberately different quality, written for this script.
 *
 * They are canned, and the interview generates its own questions, so they will
 * often not match what was asked -- expect low scores. That is not a grading
 * bug: what this script verifies is the plumbing (rows written, JSONB columns
 * round-tripped, the result page's reads succeeding), not the marking. The
 * question actually asked is echoed before each answer so the mismatch is
 * visible rather than confusing.
 */
const ANSWERS = [
  // Strong: reasoning, a trade-off, and a number.
  `We were seeing the product listing page slow down as the catalogue grew. I
   ran EXPLAIN ANALYZE and saw a sequential scan on the category filter, which
   was returning about three percent of rows, so a btree index on that column
   was worth trying. I checked the write volume first because that table is
   written on every stock update, and added a partial index covering only
   active products instead of the whole column. p95 on that endpoint came down
   from around 800ms to about 180ms, and I confirmed with EXPLAIN that the
   planner was actually using it rather than assuming.`,

  // Middling: correct but shallow, and honest about its limits.
  `Normalisation is about splitting data so each fact lives in one place, which
   avoids update anomalies. Denormalisation is deliberately duplicating some of
   it to make reads faster. I'd normalise by default and denormalise only when
   a specific query is too slow, though I haven't had to do that on a real
   production system yet.`,

  // Weak: an honest admission with almost no content.
  `I'm not really sure about that one. I think it's to do with how transactions
   see each other's changes, but I couldn't explain the isolation levels.`,
];

function heading(text: string): void {
  console.log(`\n${text}`);
  console.log("-".repeat(text.length));
}

async function main(): Promise<void> {
  const cleanup = process.argv.includes("--cleanup");

  const { prisma } = await import("../lib/db/prisma");
  const { aiAvailable } = await import("../lib/ai");
  const { createInterview, submitAnswer, completeInterview, getInterviewResult } =
    await import("../lib/interviews/service");
  const { getInterviewIntelligence } = await import(
    "../lib/interviews/report-intelligence"
  );
  const { getInterviewDelivery } = await import("../lib/interviews/delivery-service");
  const { parseStoredEvidence } = await import("../lib/interviews/report-evidence");
  const { parseRubricNotes, rubricRows } = await import("../lib/interviews/rubric");

  if (!aiAvailable()) {
    console.error("No AI provider configured. Set AI_PROVIDER and its key in .env.");
    process.exit(1);
  }

  const student = await prisma.user.findUnique({
    where: { email: DEMO_EMAIL },
    select: { id: true, name: true },
  });
  if (!student) {
    console.error(`Demo student ${DEMO_EMAIL} not found. Run npm run db:seed first.`);
    process.exit(1);
  }

  const callsBefore = await prisma.aIUsageLog.count();
  let interviewId: string | null = null;
  const failures: string[] = [];
  /**
   * Set if the run throws.
   *
   * Without it the `finally` block reported on `failures` alone, so an
   * exception part-way through -- a rate limit, most likely -- left that array
   * empty and the script printed PASS on its way out. A false green is worse
   * than no check at all.
   */
  let crashed: string | null = null;

  try {
    // --- create ------------------------------------------------------------
    heading("1. Create the interview");
    const createdId = await createInterview(student.id, {
      targetRole: "Backend Engineer",
      experienceLevel: "JUNIOR",
      type: "TECHNICAL",
      persona: "PROFESSIONAL",
      difficulty: "MEDIUM",
      durationMin: 20,
      // Three, so the final answer is the last planned one and no fourth
      // question is generated.
      plannedQuestions: 3,
      useResume: false,
    });
    interviewId = createdId;
    console.log(`   interview ${createdId}`);

    const opening = await prisma.interviewMessage.findFirst({
      where: { interviewId: createdId, isQuestion: true },
      orderBy: { order: "asc" },
      select: { content: true },
    });
    console.log(`   opening question: ${trim(opening?.content ?? "(none)", 90)}`);

    // --- answer ------------------------------------------------------------
    heading("2. Answer three questions");
    for (const [index, answer] of ANSWERS.entries()) {
      const asked = await prisma.interviewMessage.findFirst({
        where: { interviewId: createdId, isQuestion: true },
        orderBy: { order: "desc" },
        select: { content: true },
      });
      console.log(`   q${index + 1}: ${trim(asked?.content ?? "(unknown)", 72)}`);

      const result = await submitAnswer(student.id, createdId, answer.trim());
      const notes = parseRubricNotes(
        (result as { evaluation?: { rubricNotes?: unknown } }).evaluation?.rubricNotes ??
          {},
      );
      console.log(
        `   answer ${index + 1}: score ${
          (result as { evaluation?: { score?: number } }).evaluation?.score ?? "?"
        }/10, rubric notes ${Object.keys(notes).length}/6`,
      );
    }

    // --- complete ----------------------------------------------------------
    heading("3. Complete the interview");
    const report = await completeInterview(student.id, createdId);
    if (!report) {
      failures.push("completeInterview returned no report");
      console.log("   no report produced");
    } else {
      console.log(
        `   report ${report.id}: overall ${report.overallScore}, ${report.strengths.length} strengths, ${report.weaknesses.length} weaknesses`,
      );
    }

    // --- read back exactly what the result page reads ----------------------
    heading("4. Load the result page's data");
    const result = await getInterviewResult(student.id, createdId);
    const intelligence = await getInterviewIntelligence(student.id, createdId);
    const delivery = await getInterviewDelivery(student.id, createdId);

    console.log(`   status: ${result.status}, evaluations: ${result.evaluations.length}`);
    console.log(`   intelligence: ${intelligence ? "present" : "null"}`);
    console.log(
      `   delivery: ${delivery ? "present" : "null (expected — this is a text interview)"}`,
    );

    if (result.evaluations.length !== ANSWERS.length) {
      failures.push(
        `expected ${ANSWERS.length} evaluations, found ${result.evaluations.length}`,
      );
    }

    // --- the two JSONB columns, through their real parsers ------------------
    heading("5. The new columns, round-tripped through Postgres");

    const evidence = parseStoredEvidence(result.report?.evidence);
    console.log(`   report evidence rows parsed: ${evidence.length}`);
    if (evidence.length === 0) {
      failures.push("report evidence came back empty after a DB round trip");
    } else {
      const bad = evidence.filter(
        (e) => e.questionIndex < 1 || e.questionIndex > result.evaluations.length,
      );
      console.log(
        `   indexes: [${evidence.map((e) => e.questionIndex).join(", ")}] over ${result.evaluations.length} turns`,
      );
      console.log(
        `   sample: ${evidence[0].kind} from answer ${evidence[0].questionIndex} — "${trim(evidence[0].point, 64)}"`,
      );
      console.log(`   quoted answer present: ${evidence[0].answer.length > 0}`);
      if (bad.length > 0) {
        failures.push(`${bad.length} stored evidence rows point outside the turn range`);
      }
    }

    let withNotes = 0;
    for (const evaluation of result.evaluations) {
      const notes = parseRubricNotes(evaluation.rubricNotes);
      const rows = rubricRows(
        {
          correctness: evaluation.correctness,
          relevance: evaluation.relevance,
          clarity: evaluation.clarity,
          technicalDepth: evaluation.technicalDepth,
          completeness: evaluation.completeness,
          structure: evaluation.structure,
        },
        notes,
      );
      const explained = rows.filter((r) => r.note !== null).length;
      if (explained > 0) withNotes += 1;
      console.log(
        `   answer ${evaluation.score}/10 → ${rows.length} rubric rows, ${explained} with a reason`,
      );
    }
    if (withNotes === 0) {
      failures.push("no evaluation came back with any rubric justification");
    }
  } catch (error) {
    crashed = error instanceof Error ? error.message : String(error);
    failures.push(`run aborted: ${crashed}`);
  } finally {
    const callsAfter = await prisma.aIUsageLog.count();

    heading("Result");
    console.log(`   API calls made: ${callsAfter - callsBefore} (from AIUsageLog)`);

    if (interviewId && cleanup) {
      await prisma.interview.delete({ where: { id: interviewId } });
      console.log(`   cleaned up interview ${interviewId} (cascade)`);
      console.log(
        "   note: derived topic-performance and progress rows are aggregates and remain",
      );
    } else if (interviewId) {
      console.log(`   kept interview ${interviewId} — pass --cleanup to delete it`);
    }

    if (failures.length === 0 && crashed === null) {
      console.log("\n   PASS — every stage completed and both new columns parsed.");
    } else {
      console.log(`\n   FAIL — ${failures.length} problem(s):`);
      for (const failure of failures) console.log(`     - ${failure}`);
    }

    await prisma.$disconnect();
    if (failures.length > 0) process.exitCode = 1;
  }
}

function trim(text: string, length: number): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > length ? `${flat.slice(0, length)}…` : flat;
}

void main().catch((error) => {
  // Reached only if the teardown itself fails; the run's own errors are
  // reported through `crashed` above, so the exit status and the printed
  // verdict cannot disagree.
  console.error(
    "\nE2E teardown failed:",
    error instanceof Error ? error.message : error,
  );
  process.exit(1);
});
