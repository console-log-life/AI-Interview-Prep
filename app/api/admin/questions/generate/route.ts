import type { NextRequest } from "next/server";
import { z } from "zod";

import { ok, route } from "@/lib/api/response";
import { requireAdmin } from "@/lib/auth/session";
import { clientIp, recordAudit } from "@/lib/audit/service";
import { generateQuestions } from "@/lib/assessments/generation";
import { enforceRateLimit } from "@/lib/rate-limit";
import {
  difficultyEnum,
  experienceLevelEnum,
  questionCategoryEnum,
  sanitizedText,
} from "@/lib/validation/common";

const bodySchema = z.object({
  category: questionCategoryEnum,
  topic: sanitizedText(80, 2),
  difficulty: difficultyEnum,
  count: z.coerce.number().int().min(1).max(15).default(5),
  types: z
    .array(z.enum(["MCQ", "MULTI_SELECT", "TRUE_FALSE", "SHORT_ANSWER"]))
    .min(1)
    .default(["MCQ"]),
  targetRole: sanitizedText(120).optional(),
  experienceLevel: experienceLevelEnum.optional(),
  /** Default true — nothing an AI wrote reaches students unreviewed. */
  requireReview: z.boolean().default(true),
});

/**
 * POST /api/admin/questions/generate
 *
 * Generation is only half the job — every candidate question runs the quality
 * pipeline, and the response reports exactly which ones were rejected and why.
 */
export const POST = route(async (request: NextRequest) => {
  const admin = await requireAdmin();
  enforceRateLimit(`generate:${admin.id}`, 15, 60 * 60 * 1000);

  const input = bodySchema.parse(await request.json());

  const result = await generateQuestions({
    adminId: admin.id,
    category: input.category,
    topic: input.topic,
    difficulty: input.difficulty,
    count: input.count,
    types: input.types,
    targetRole: input.targetRole,
    experienceLevel: input.experienceLevel,
    requireReview: input.requireReview,
  });

  await recordAudit({
    actorId: admin.id,
    actorEmail: admin.email,
    action: "question.ai_generated",
    targetType: "Question",
    metadata: {
      category: input.category,
      topic: input.topic,
      requested: result.requested,
      accepted: result.accepted,
      rejected: result.rejected,
    },
    ip: clientIp(request),
  });

  return ok(result, 201);
});

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";
