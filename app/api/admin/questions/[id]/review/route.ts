import type { NextRequest } from "next/server";
import { z } from "zod";

import { ok, route } from "@/lib/api/response";
import { requireAdmin } from "@/lib/auth/session";
import { clientIp, recordAudit } from "@/lib/audit/service";
import { reviewQuestion } from "@/lib/assessments/generation";

const bodySchema = z.object({
  decision: z.enum(["APPROVED", "REJECTED"]),
});

/**
 * PATCH /api/admin/questions/[id]/review
 * Approving is what makes an AI-generated question visible to students.
 */
export const PATCH = route(
  async (request: NextRequest, context: { params: Promise<{ id: string }> }) => {
    const admin = await requireAdmin();
    const { id } = await context.params;

    const input = bodySchema.parse(await request.json());
    const question = await reviewQuestion(id, input.decision);

    await recordAudit({
      actorId: admin.id,
      actorEmail: admin.email,
      action: "question.reviewed",
      targetType: "Question",
      targetId: id,
      metadata: { decision: input.decision },
      ip: clientIp(request),
    });

    return ok(question);
  },
);

export const dynamic = "force-dynamic";
