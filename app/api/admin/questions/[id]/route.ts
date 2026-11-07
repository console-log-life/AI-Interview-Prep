import type { NextRequest } from "next/server";

import { NotFoundError } from "@/lib/api/errors";
import { ok, route } from "@/lib/api/response";
import { requireAdmin } from "@/lib/auth/session";
import { clientIp, recordAudit } from "@/lib/audit/service";
import {
  deleteQuestion,
  getQuestion,
  updateQuestion,
} from "@/lib/db/queries/questions";
import { questionUpsertSchema } from "@/lib/validation/assessment";

export const GET = route(
  async (_request: NextRequest, context: { params: Promise<{ id: string }> }) => {
    await requireAdmin();
    const { id } = await context.params;
    const question = await getQuestion(id);
    if (!question) throw new NotFoundError("We could not find that question.");
    return ok(question);
  },
);

/** PATCH /api/admin/questions/[id] — full replace of the question + options. */
export const PATCH = route(
  async (request: NextRequest, context: { params: Promise<{ id: string }> }) => {
    const admin = await requireAdmin();
    const { id } = await context.params;

    const existing = await getQuestion(id);
    if (!existing) throw new NotFoundError("We could not find that question.");

    const input = questionUpsertSchema.parse(await request.json());
    await updateQuestion(id, input);

    await recordAudit({
      actorId: admin.id,
      actorEmail: admin.email,
      action: "question.updated",
      targetType: "Question",
      targetId: id,
      metadata: { topic: input.topic },
      ip: clientIp(request),
    });

    return ok({ updated: true });
  },
);

export const DELETE = route(
  async (request: NextRequest, context: { params: Promise<{ id: string }> }) => {
    const admin = await requireAdmin();
    const { id } = await context.params;

    const existing = await getQuestion(id);
    if (!existing) throw new NotFoundError("We could not find that question.");

    await deleteQuestion(id);

    await recordAudit({
      actorId: admin.id,
      actorEmail: admin.email,
      action: "question.deleted",
      targetType: "Question",
      targetId: id,
      metadata: { topic: existing.topic },
      ip: clientIp(request),
    });

    return ok({ deleted: true });
  },
);

export const dynamic = "force-dynamic";
