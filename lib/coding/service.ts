import "server-only";
import type { CodeLanguage, Difficulty, Prisma } from "@prisma/client";

import { NotFoundError } from "@/lib/api/errors";
import { getCodeExecutionProvider } from "@/lib/coding";
import { prisma } from "@/lib/db/prisma";
import { inferSkillCategory } from "@/lib/db/queries/profile";
import {
  recordActivity,
  recordTopicPerformance,
  writeProgressSnapshot,
} from "@/lib/progress/service";
import { evaluateAchievements } from "@/lib/recommendations/achievements";
import { refreshRecommendations } from "@/lib/recommendations/service";
import type { ExecutionVerdict } from "@/lib/coding/types";

/**
 * Coding assessment service.
 *
 * User code never runs in this process — every execution goes through the
 * `CodeExecutionProvider` abstraction into an external sandbox.
 */

/** Trailing whitespace differences should not fail an otherwise correct answer. */
function normalizeOutput(value: string): string {
  return value
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .trim();
}

export type TestCaseResult = {
  index: number;
  isSample: boolean;
  passed: boolean;
  /** Hidden test inputs/outputs are redacted before this leaves the server. */
  input: string | null;
  expected: string | null;
  actual: string | null;
  stderr: string | null;
  runtimeMs: number | null;
};

export type RunOutcome = {
  verdict: ExecutionVerdict;
  stdout: string;
  stderr: string;
  compileOutput: string;
  runtimeMs: number | null;
  memoryKb: number | null;
};

export async function listProblems(filters: {
  difficulty?: Difficulty;
  topic?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}) {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(50, Math.max(1, filters.pageSize ?? 20));

  const where: Prisma.CodingProblemWhereInput = {
    isPublished: true,
    ...(filters.difficulty ? { difficulty: filters.difficulty } : {}),
    ...(filters.topic ? { topic: filters.topic } : {}),
    ...(filters.search
      ? { title: { contains: filters.search, mode: "insensitive" } }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.codingProblem.findMany({
      where,
      select: {
        id: true,
        slug: true,
        title: true,
        difficulty: true,
        topic: true,
        tags: true,
      },
      orderBy: [{ difficulty: "asc" }, { title: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.codingProblem.count({ where }),
  ]);

  return {
    items,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

/** Problem detail with only the SAMPLE test cases exposed. */
export async function getProblem(idOrSlug: string) {
  const problem = await prisma.codingProblem.findFirst({
    where: {
      OR: [{ id: idOrSlug }, { slug: idOrSlug }],
      isPublished: true,
    },
    include: {
      testCases: {
        where: { isSample: true },
        orderBy: { order: "asc" },
      },
      _count: { select: { testCases: true } },
    },
  });

  if (!problem) throw new NotFoundError("We could not find that problem.");
  return problem;
}

/** Runs code against a single custom input. Never persisted as a submission. */
export async function runCode(args: {
  userId: string;
  problemId: string;
  language: CodeLanguage;
  code: string;
  stdin: string;
}): Promise<RunOutcome> {
  const problem = await prisma.codingProblem.findUnique({
    where: { id: args.problemId },
    select: { timeLimitMs: true, memoryLimitKb: true },
  });
  if (!problem) throw new NotFoundError("We could not find that problem.");

  const provider = getCodeExecutionProvider();
  const result = await provider.execute({
    language: args.language,
    code: args.code,
    stdin: args.stdin,
    timeLimitMs: problem.timeLimitMs,
    memoryLimitKb: problem.memoryLimitKb,
  });

  // A "Run" is a smoke test, so it is recorded for history but flagged
  // `isRunOnly` and excluded from every score and streak calculation.
  await prisma.codingSubmission.create({
    data: {
      userId: args.userId,
      problemId: args.problemId,
      language: args.language,
      code: args.code,
      status: result.verdict,
      passedTests: 0,
      totalTests: 0,
      runtimeMs: result.runtimeMs,
      memoryKb: result.memoryKb,
      stderr: result.stderr || null,
      compileOutput: result.compileOutput || null,
      isRunOnly: true,
    },
  });

  return result;
}

/**
 * Full submission: runs every test case and records a graded submission.
 *
 * Execution stops at the first failure so a broken solution does not burn the
 * sandbox quota on 20 identical failures.
 */
export async function submitCode(args: {
  userId: string;
  problemId: string;
  language: CodeLanguage;
  code: string;
}) {
  const problem = await prisma.codingProblem.findUnique({
    where: { id: args.problemId },
    include: { testCases: { orderBy: { order: "asc" } } },
  });
  if (!problem) throw new NotFoundError("We could not find that problem.");

  const provider = getCodeExecutionProvider();
  const results: TestCaseResult[] = [];
  let passedTests = 0;
  let finalVerdict: ExecutionVerdict = "ACCEPTED";
  let maxRuntime = 0;
  let maxMemory = 0;
  let stderr = "";
  let compileOutput = "";

  for (const [index, testCase] of problem.testCases.entries()) {
    const outcome = await provider.execute({
      language: args.language,
      code: args.code,
      stdin: testCase.input,
      timeLimitMs: problem.timeLimitMs,
      memoryLimitKb: problem.memoryLimitKb,
    });

    maxRuntime = Math.max(maxRuntime, outcome.runtimeMs ?? 0);
    maxMemory = Math.max(maxMemory, outcome.memoryKb ?? 0);

    const ranCleanly = outcome.verdict === "ACCEPTED";
    const matched =
      ranCleanly &&
      normalizeOutput(outcome.stdout) === normalizeOutput(testCase.expected);

    if (matched) passedTests += 1;

    results.push({
      index,
      isSample: testCase.isSample,
      passed: matched,
      // Redact hidden cases so students cannot reverse-engineer the tests.
      input: testCase.isSample ? testCase.input : null,
      expected: testCase.isSample ? testCase.expected : null,
      actual: testCase.isSample ? outcome.stdout : null,
      stderr: testCase.isSample ? outcome.stderr || null : null,
      runtimeMs: outcome.runtimeMs,
    });

    if (!matched) {
      finalVerdict = ranCleanly ? "WRONG_ANSWER" : outcome.verdict;
      stderr = outcome.stderr;
      compileOutput = outcome.compileOutput;
      break;
    }
  }

  if (problem.testCases.length === 0) finalVerdict = "INTERNAL_ERROR";

  const submission = await prisma.codingSubmission.create({
    data: {
      userId: args.userId,
      problemId: args.problemId,
      language: args.language,
      code: args.code,
      status: finalVerdict,
      passedTests,
      totalTests: problem.testCases.length,
      runtimeMs: maxRuntime || null,
      memoryKb: maxMemory || null,
      stderr: stderr || null,
      compileOutput: compileOutput || null,
      testResults: results as unknown as Prisma.InputJsonValue,
      isRunOnly: false,
    },
  });

  const percentage =
    problem.testCases.length > 0
      ? (passedTests / problem.testCases.length) * 100
      : 0;

  await recordTopicPerformance(args.userId, [
    {
      topic: problem.topic,
      category: inferSkillCategory(problem.topic),
      score: percentage,
    },
  ]);
  await recordActivity(args.userId, "CODING");
  await writeProgressSnapshot(args.userId);
  const unlocked = await evaluateAchievements(args.userId);
  await refreshRecommendations(args.userId);

  return { submission, results, passedTests, total: problem.testCases.length, unlocked };
}

export async function listSubmissions(
  userId: string,
  problemId?: string,
  limit = 20,
) {
  return prisma.codingSubmission.findMany({
    where: {
      userId,
      isRunOnly: false,
      ...(problemId ? { problemId } : {}),
    },
    include: { problem: { select: { title: true, slug: true } } },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

export async function listProblemTopics(): Promise<string[]> {
  const rows = await prisma.codingProblem.findMany({
    where: { isPublished: true },
    select: { topic: true },
    distinct: ["topic"],
    orderBy: { topic: "asc" },
  });
  return rows.map((row) => row.topic);
}
