import type { NextRequest } from "next/server";

import { ok, route } from "@/lib/api/response";
import { requireUser } from "@/lib/auth/session";
import { submitAttempt } from "@/lib/db/queries/assessments";
import { submitAssessmentSchema } from "@/lib/validation/assessment";

/**
 * POST /api/assessments/attempts/[attemptId]/submit
 *
 * Grades and closes the attempt. A duplicate submit returns 409 rather than
 * grading twice — the service claims the attempt with a conditional update.
 */
export const POST = route(
  async (
    request: NextRequest,
    context: { params: Promise<{ attemptId: string }> },
  ) => {
    const user = await requireUser();
    const { attemptId } = await context.params;

    const input = submitAssessmentSchema.parse(await request.json());
    const { attempt, result, unlocked } = await submitAttempt(
      user.id,
      attemptId,
      input,
    );

    return ok({
      attemptId: attempt.id,
      score: attempt.score,
      maxScore: attempt.maxScore,
      percentage: attempt.percentage,
      passed: attempt.passed,
      correctCount: result.correctCount,
      incorrectCount: result.incorrectCount,
      unansweredCount: result.unansweredCount,
      unlocked,
    });
  },
);

export const dynamic = "force-dynamic";
