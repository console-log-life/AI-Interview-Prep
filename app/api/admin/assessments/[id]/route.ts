import type { NextRequest } from "next/server";
import { z } from "zod";

import { NotFoundError } from "@/lib/api/errors";
import { ok, route } from "@/lib/api/response";
import { requireAdmin } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";

const patchSchema = z.object({
  isPublished: z.boolean().optional(),
  title: z.string().trim().min(3).max(140).optional(),
  passPercentage: z.coerce.number().int().min(0).max(100).optional(),
  durationMin: z.coerce.number().int().min(5).max(180).optional(),
});

export const PATCH = route(
  async (request: NextRequest, context: { params: Promise<{ id: string }> }) => {
    await requireAdmin();
    const { id } = await context.params;

    const existing = await prisma.assessment.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) throw new NotFoundError("We could not find that assessment.");

    const input = patchSchema.parse(await request.json());
    await prisma.assessment.update({ where: { id }, data: input });

    return ok({ updated: true });
  },
);

/**
 * DELETE /api/admin/assessments/[id]
 *
 * Refuses to delete an assessment that students have already attempted —
 * removing it would cascade away their results. Unpublish it instead.
 */
export const DELETE = route(
  async (_request: NextRequest, context: { params: Promise<{ id: string }> }) => {
    await requireAdmin();
    const { id } = await context.params;

    const assessment = await prisma.assessment.findUnique({
      where: { id },
      select: { _count: { select: { attempts: true } } },
    });
    if (!assessment) throw new NotFoundError("We could not find that assessment.");

    if (assessment._count.attempts > 0) {
      await prisma.assessment.update({
        where: { id },
        data: { isPublished: false },
      });
      return ok({
        deleted: false,
        unpublished: true,
        message:
          "This assessment has student attempts, so it was unpublished instead of deleted. Deleting it would erase their results.",
      });
    }

    await prisma.assessment.delete({ where: { id } });
    return ok({ deleted: true, unpublished: false });
  },
);

export const dynamic = "force-dynamic";
