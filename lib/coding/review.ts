import "server-only";
import type { Prisma } from "@prisma/client";

import { getAIService } from "@/lib/ai";
import { setAiUsageUser } from "@/lib/ai/observability";
import { ConflictError, NotFoundError } from "@/lib/api/errors";
import { prisma } from "@/lib/db/prisma";

/**
 * AI code review.
 *
 * Two rules the implementation enforces rather than merely asking for:
 *
 *  1. The candidate's code is NEVER modified. The review is advisory output
 *     stored beside the submission.
 *  2. The optimized solution is only produced when explicitly requested. The
 *     flag is enforced in the provider AND re-checked here, so a model that
 *     ignores the instruction still cannot hand over an unrequested answer.
 */

export async function reviewSubmission(args: {
  userId: string;
  submissionId: string;
  includeOptimizedApproach?: boolean;
}) {
  const submission = await prisma.codingSubmission.findFirst({
    // Ownership scoping — a user cannot review someone else's submission.
    where: { id: args.submissionId, userId: args.userId },
    include: {
      problem: {
        select: {
          title: true,
          description: true,
          constraints: true,
        },
      },
      review: true,
    },
  });

  if (!submission) throw new NotFoundError("We could not find that submission.");
  if (submission.isRunOnly) {
    throw new ConflictError(
      "Only full submissions can be reviewed. Submit your solution first.",
    );
  }

  // Reuse an existing review unless the user is now asking for the optimized
  // approach that the stored review does not contain — avoids paying for the
  // same analysis twice.
  const wantsOptimized = args.includeOptimizedApproach ?? false;
  if (submission.review && (!wantsOptimized || submission.review.optimizedApproach)) {
    return submission.review;
  }

  setAiUsageUser(args.userId);
  const ai = getAIService();

  const result = await ai.reviewCode({
    problemTitle: submission.problem.title,
    problemDescription: [
      submission.problem.description,
      submission.problem.constraints,
    ]
      .filter(Boolean)
      .join("\n\nConstraints:\n"),
    language: submission.language,
    code: submission.code,
    verdict: submission.status,
    passedTests: submission.passedTests,
    totalTests: submission.totalTests,
    includeOptimizedApproach: wantsOptimized,
  });

  const data = {
    correctness: result.correctness,
    timeComplexity: result.timeComplexity,
    spaceComplexity: result.spaceComplexity,
    readability: result.readability,
    maintainability: result.maintainability,
    efficiency: result.efficiency,
    summary: result.summary,
    issues: result.issues as unknown as Prisma.InputJsonValue,
    edgeCases: result.edgeCases as unknown as Prisma.InputJsonValue,
    optimizationNotes: result.optimizationNotes || null,
    // Second enforcement point for the "never volunteer a solution" rule.
    optimizedApproach: wantsOptimized ? result.optimizedApproach || null : null,
    learningPoints: result.learningPoints,
    modelUsed: ai.model,
  };

  return prisma.codeReview.upsert({
    where: { submissionId: args.submissionId },
    create: { submissionId: args.submissionId, ...data },
    update: data,
  });
}

export async function getReview(userId: string, submissionId: string) {
  return prisma.codeReview.findFirst({
    where: { submissionId, submission: { userId } },
  });
}
