import type { NextRequest } from "next/server";

import { ValidationError } from "@/lib/api/errors";
import { ok, route } from "@/lib/api/response";
import { requireAdmin } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { assessmentUpsertSchema } from "@/lib/validation/assessment";

/** POST /api/admin/assessments — build an assessment from existing questions. */
export const POST = route(async (request: NextRequest) => {
  const admin = await requireAdmin();
  const input = assessmentUpsertSchema.parse(await request.json());

  // Every referenced question must actually exist and be active.
  const found = await prisma.question.findMany({
    where: { id: { in: input.questionIds }, isActive: true },
    select: { id: true },
  });
  if (found.length !== input.questionIds.length) {
    throw new ValidationError(
      "Some of the selected questions no longer exist or are inactive.",
    );
  }

  const assessment = await prisma.assessment.create({
    data: {
      title: input.title,
      description: input.description || null,
      category: input.category,
      difficulty: input.difficulty,
      durationMin: input.durationMin,
      passPercentage: input.passPercentage,
      isPublished: input.isPublished,
      authorId: admin.id,
      questions: {
        create: input.questionIds.map((questionId, index) => ({
          questionId,
          order: index,
        })),
      },
    },
  });

  return ok({ id: assessment.id }, 201);
});

export const dynamic = "force-dynamic";
