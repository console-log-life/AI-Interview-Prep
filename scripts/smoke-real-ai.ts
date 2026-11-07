/**
 * Real-provider smoke test for the structured-output fields.
 *
 * Every schema in `lib/ai/schemas.ts` has two layers: a JSON Schema that
 * constrains generation and a zod schema that validates what comes back. The
 * unit suite only ever exercises the zod half, against a fake service — so a
 * field the real provider silently omits, or a JSON Schema it rejects outright,
 * passes every test and fails in the demo.
 *
 * That is exactly the risk for the two fields added most recently:
 * `rubricNotes` on an answer evaluation and `evidence` on a report. Neither has
 * ever been seen coming off a real model.
 *
 * Five calls, one per thing worth proving:
 *   1. résumé claim extraction
 *   2. job-description analysis
 *   3. answer evaluation — strong answer  → rubricNotes
 *   4. answer evaluation — weak answer    → rubricNotes
 *   5. report generation over those turns → evidence, with usable indexes
 *
 *   npm run smoke:ai
 *
 * Costs real quota, so it is a script and never part of `npm test`. Nothing
 * here prints the API key. All sample data below is invented for this file:
 * there is no real candidate, employer or résumé anywhere in it.
 */

import { createRequire } from "node:module";

import { config as loadEnv } from "dotenv";

import type {
  AnswerEvaluation,
  CandidateContext,
  EvaluatedTurn,
  InterviewSettings,
} from "../types/ai";

loadEnv();

/**
 * Neutralise `server-only` before anything under `lib/` is loaded.
 *
 * `lib/ai/index.ts` imports it, and the package throws on import outside a
 * React Server Component — which is the point of it, and why a component can
 * never reach the AI SDK. A plain Node script is not a client component
 * either, but the package cannot tell the difference, so the module cache is
 * seeded with an empty stub. The unit suite does the same thing through
 * `vi.mock("server-only")` in `tests/setup.ts`.
 *
 * This has to happen before the imports below, which is why they are dynamic:
 * a static import would be hoisted above it.
 */
const requireFromHere = createRequire(import.meta.url);
const serverOnly = requireFromHere.resolve("server-only");
requireFromHere.cache[serverOnly] = {
  id: serverOnly,
  filename: serverOnly,
  loaded: true,
  exports: {},
} as NodeModule;


/** Invented candidate. Not a real person. */
const CANDIDATE: CandidateContext = {
  name: "Test Candidate",
  targetRole: "Backend Engineer",
  experienceLevel: "JUNIOR",
  skills: ["TypeScript", "Node.js", "PostgreSQL"],
  college: "Example Institute of Technology",
  degree: "B.Tech Computer Science",
  graduationYear: 2025,
};

const SETTINGS: InterviewSettings = {
  type: "TECHNICAL",
  persona: "PROFESSIONAL",
  difficulty: "MEDIUM",
  plannedQuestions: 6,
};

/** Invented résumé. Written for this script; no real person's details. */
const SAMPLE_RESUME = `
Test Candidate
Backend Engineer — Bengaluru, India
test.candidate@example.com

EXPERIENCE
Example Retail Pvt Ltd — Backend Intern (Jan 2025 - Jun 2025)
- Built a REST API in Node.js and Express for the order service
- Reduced p95 checkout latency by 35% by adding a Redis cache in front of
  the product catalogue query
- Migrated 8 reporting queries from a nightly cron to a materialised view

PROJECTS
- Transit Tracker: a bus-arrival app using WebSockets and PostgreSQL; handled
  about 400 concurrent connections in load testing
- Notes CLI: a Go command-line tool for timestamped notes

SKILLS
TypeScript, Node.js, Express, PostgreSQL, Redis, Docker, Go

EDUCATION
B.Tech Computer Science, Example Institute of Technology, 2025 — CGPA 8.4
`;

/** Invented job ad. Not copied from any real posting. */
const SAMPLE_JD = `
Backend Engineer (2-4 years) — Example Payments

We are looking for a backend engineer to work on our transaction ledger.

Responsibilities
- Design and ship REST APIs used by our mobile and web clients
- Own database schema design and query performance on PostgreSQL
- Add observability to services and take part in on-call rotation

Requirements
- 2-4 years building backend services in Node.js, Go or Java
- Strong SQL and relational modelling; comfortable reading a query plan
- Experience with message queues (Kafka or RabbitMQ)
- Familiarity with Docker and CI pipelines

Nice to have
- Exposure to Kubernetes
- Experience with payment systems or double-entry accounting
`;

const Q1 = "How would you decide whether to add an index to a Postgres table?";
const STRONG_ANSWER = `
I would start from the query, not the table. I'd run EXPLAIN ANALYZE on the
slow query and look at whether it's doing a sequential scan and how many rows
it actually returns versus estimates. If a filter is selective — say it returns
a few percent of the table — a btree index on that column is worth trying.
I'd check pg_stat_user_tables to see read versus write volume first, because
every index slows inserts and updates down, and on the order service that
mattered: we were writing far more than we read on that table. Composite order
matters too, leftmost column first, and I'd confirm with EXPLAIN that the
planner actually picks it rather than assuming.
`;

const Q2 = "What is the difference between a clustered and non-clustered index?";
const WEAK_ANSWER = "I think clustered is faster. I'm not really sure honestly.";

/** Prints a block and returns whether it passed, so failures are countable. */
function report(step: string, ok: boolean, lines: string[]): boolean {
  console.log(`\n${ok ? "PASS" : "FAIL"} — ${step}`);
  for (const line of lines) console.log(`   ${line}`);
  return ok;
}

function preview(text: string, length = 96): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > length ? `${flat.slice(0, length)}…` : flat;
}

async function main(): Promise<void> {
  // Dynamic, so they load after the stub above. tsx emits CJS for this file,
  // which has no top-level await, so they live here rather than at module top.
  const { getAIService, aiAvailable } = await import("../lib/ai");
  const { resolveReportEvidence } = await import(
    "../lib/interviews/report-evidence"
  );
  const { RUBRIC_DIMENSIONS } = await import("../lib/interviews/rubric");

  if (!aiAvailable()) {
    console.error(
      "No AI provider configured. Set AI_PROVIDER and the matching key in .env.",
    );
    process.exit(1);
  }

  const ai = getAIService();
  // `model` is on the interface; the provider name comes from env, since the
  // registry deliberately does not expose its internals.
  console.log(`Provider: ${process.env.AI_PROVIDER ?? "(default)"} · model: ${ai.model}`);
  console.log("Budget: 5 calls.");

  const results: boolean[] = [];
  let calls = 0;

  // --- 1. résumé claims ----------------------------------------------------
  try {
    calls += 1;
    const claims = await ai.extractResumeClaims(SAMPLE_RESUME);
    const withProbes = claims.filter((c) => c.probes.length > 0).length;
    results.push(
      report("1. extractResumeClaims", claims.length > 0 && withProbes > 0, [
        `claims: ${claims.length}, with probes: ${withProbes}`,
        `types: ${[...new Set(claims.map((c) => c.claimType))].join(", ") || "none"}`,
        claims[0] ? `first: "${preview(claims[0].text)}"` : "no claims returned",
      ]),
    );
  } catch (error) {
    results.push(report("1. extractResumeClaims", false, [describe(error)]));
  }

  // --- 2. job description --------------------------------------------------
  try {
    calls += 1;
    const jd = await ai.analyzeJobDescription({
      candidate: CANDIDATE,
      title: "Backend Engineer",
      company: "Example Payments",
      rawText: SAMPLE_JD,
    });
    const ok =
      jd.requiredSkills.length > 0 &&
      jd.responsibilities.length > 0 &&
      typeof jd.matchScore === "number";
    results.push(
      report("2. analyzeJobDescription", ok, [
        `requiredSkills: ${jd.requiredSkills.length}, responsibilities: ${jd.responsibilities.length}`,
        `matchScore: ${jd.matchScore}, experienceReq: ${jd.experienceReq ?? "(none)"}`,
        `skillMatch rows: ${jd.skillMatch.length}, missing: ${jd.missingSkills.length}`,
      ]),
    );
  } catch (error) {
    results.push(report("2. analyzeJobDescription", false, [describe(error)]));
  }

  // --- 3 + 4. answer evaluation, and the rubricNotes field -----------------
  const turns: EvaluatedTurn[] = [];

  for (const [index, probe] of [
    { label: "3. evaluateInterviewAnswer — strong answer", q: Q1, a: STRONG_ANSWER },
    { label: "4. evaluateInterviewAnswer — weak answer", q: Q2, a: WEAK_ANSWER },
  ].entries()) {
    try {
      calls += 1;
      const evaluation: AnswerEvaluation = await ai.evaluateInterviewAnswer({
        candidate: CANDIDATE,
        settings: SETTINGS,
        question: probe.q,
        answer: probe.a,
        topic: index === 0 ? "PostgreSQL" : "Databases",
      });

      turns.push({
        question: probe.q,
        answer: probe.a.trim(),
        topic: index === 0 ? "PostgreSQL" : "Databases",
        evaluation,
      });

      /**
       * The field under test. Reported per dimension rather than as a count,
       * because "some notes came back" would hide a provider that only ever
       * fills the first one.
       */
      const notes = evaluation.rubricNotes ?? {};
      const present = RUBRIC_DIMENSIONS.filter(
        (d) => typeof notes[d.key] === "string" && notes[d.key]!.trim().length > 0,
      ).map((d) => d.key);
      const missing = RUBRIC_DIMENSIONS.filter(
        (d) => !present.includes(d.key),
      ).map((d) => d.key);

      results.push(
        report(probe.label, present.length > 0, [
          `score: ${evaluation.score}/10`,
          `rubricNotes present (${present.length}/6): ${present.join(", ") || "NONE"}`,
          `rubricNotes missing: ${missing.join(", ") || "none"}`,
          present[0]
            ? `sample — ${present[0]}: "${preview(notes[present[0]]!, 80)}"`
            : "no justification came back at all",
        ]),
      );
    } catch (error) {
      results.push(report(probe.label, false, [describe(error)]));
    }
  }

  // --- 5. report generation, and the evidence field ------------------------
  if (turns.length === 0) {
    results.push(
      report("5. generateInterviewReport", false, [
        "skipped: no graded turns, because evaluation failed above",
      ]),
    );
  } else {
    try {
      calls += 1;
      const payload = await ai.generateInterviewReport({
        candidate: CANDIDATE,
        settings: SETTINGS,
        turns,
      });

      const raw = payload.evidence ?? [];
      // The real gate: an index the turns do not support is dropped, so this
      // is what the report would actually render.
      const resolved = resolveReportEvidence(raw, turns);
      const indexes = raw.map((e) => e.questionIndex);
      const outOfRange = indexes.filter((i) => i < 1 || i > turns.length);

      results.push(
        report(
          "5. generateInterviewReport",
          raw.length > 0 && resolved.length > 0,
          [
            `overall: ${payload.overallScore}, strengths: ${payload.strengths.length}, weaknesses: ${payload.weaknesses.length}`,
            `evidence returned: ${raw.length}`,
            `questionIndex values: [${indexes.join(", ")}] over ${turns.length} turns`,
            `out of range: ${outOfRange.length === 0 ? "none" : outOfRange.join(", ")}`,
            `resolved and renderable: ${resolved.length}`,
            resolved[0]
              ? `sample — ${resolved[0].kind} from answer ${resolved[0].questionIndex}: "${preview(resolved[0].point, 70)}"`
              : "nothing survived resolution",
          ],
        ),
      );
    } catch (error) {
      results.push(report("5. generateInterviewReport", false, [describe(error)]));
    }
  }

  const passed = results.filter(Boolean).length;
  console.log(`\n${"=".repeat(60)}`);
  console.log(`${passed}/${results.length} passed · ${calls} API call(s) made`);
  console.log("=".repeat(60));

  if (passed !== results.length) process.exit(1);
}

/**
 * Error text without the key.
 *
 * Provider errors can carry the request URL, and the URL can carry the key, so
 * only the message is printed and anything key-shaped is masked.
 */
function describe(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/AIza[\w-]+/g, "[redacted]").replace(/key=[^&\s]+/g, "key=[redacted]");
}

void main().catch((error) => {
  console.error("Smoke test crashed:", describe(error));
  process.exit(1);
});
