import type { Metadata } from "next";

import { CodingWorkspace } from "@/components/coding/coding-workspace";
import { aiAvailable } from "@/lib/ai";
import { requireUserPage } from "@/lib/auth/session";
import { executionAvailable } from "@/lib/coding";
import { getProblem, listSubmissions } from "@/lib/coding/service";
import { prisma } from "@/lib/db/prisma";
import type { CodeLanguage } from "@/types/user";

export const metadata: Metadata = {
  title: "Coding problem",
};

export const dynamic = "force-dynamic";

/** Narrows the `starterCode` JSON column into a per-language record. */
function toStarterCode(
  value: unknown,
): Partial<Record<CodeLanguage, string>> {
  if (typeof value !== "object" || value === null) return {};
  const record = value as Record<string, unknown>;
  const out: Partial<Record<CodeLanguage, string>> = {};
  for (const language of ["PYTHON", "JAVA", "CPP", "JAVASCRIPT"] as const) {
    const entry = record[language];
    if (typeof entry === "string") out[language] = entry;
  }
  return out;
}

export default async function CodingProblemPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUserPage();
  const { id } = await params;

  // `getProblem` accepts either an id or a slug and only returns published
  // problems, with hidden test cases excluded from the payload.
  const problem = await getProblem(id);

  const [submissions, profile] = await Promise.all([
    listSubmissions(user.id, problem.id, 8),
    prisma.profile.findUnique({
      where: { userId: user.id },
      select: { preferredLangs: true },
    }),
  ]);

  const preferred = (profile?.preferredLangs?.[0] ?? "PYTHON") as CodeLanguage;

  return (
    <CodingWorkspace
      executionEnabled={executionAvailable()}
      reviewEnabled={aiAvailable()}
      preferredLanguage={preferred}
      problem={{
        id: problem.id,
        title: problem.title,
        difficulty: problem.difficulty,
        topic: problem.topic,
        description: problem.description,
        constraints: problem.constraints,
        inputFormat: problem.inputFormat,
        outputFormat: problem.outputFormat,
        timeLimitMs: problem.timeLimitMs,
        memoryLimitKb: problem.memoryLimitKb,
        totalTests: problem._count.testCases,
        starterCode: toStarterCode(problem.starterCode),
        samples: problem.testCases.map((testCase) => ({
          id: testCase.id,
          input: testCase.input,
          expected: testCase.expected,
          explanation: testCase.explanation,
        })),
      }}
      submissions={submissions.map((submission) => ({
        id: submission.id,
        status: submission.status,
        language: submission.language,
        passedTests: submission.passedTests,
        totalTests: submission.totalTests,
        runtimeMs: submission.runtimeMs,
        createdAt: submission.createdAt.toISOString(),
      }))}
    />
  );
}
