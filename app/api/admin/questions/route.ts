import type { NextRequest } from "next/server";

import { ok, route } from "@/lib/api/response";
import { requireAdmin } from "@/lib/auth/session";
import { clientIp, recordAudit } from "@/lib/audit/service";
import { createQuestion, listQuestions } from "@/lib/db/queries/questions";
import { questionUpsertSchema } from "@/lib/validation/assessment";
import {
  difficultyEnum,
  questionCategoryEnum,
  questionTypeEnum,
} from "@/lib/validation/common";

/** GET /api/admin/questions — paginated, filterable question bank. */
export const GET = route(async (request: NextRequest) => {
  await requireAdmin();

  const params = request.nextUrl.searchParams;
  const category = questionCategoryEnum.safeParse(params.get("category"));
  const difficulty = difficultyEnum.safeParse(params.get("difficulty"));
  const type = questionTypeEnum.safeParse(params.get("type"));

  const result = await listQuestions({
    category: category.success ? category.data : undefined,
    difficulty: difficulty.success ? difficulty.data : undefined,
    type: type.success ? type.data : undefined,
    search: params.get("q") ?? undefined,
    page: Number(params.get("page")) || 1,
    pageSize: Number(params.get("pageSize")) || 20,
  });

  return ok(result);
});

/** POST /api/admin/questions — create a question. */
export const POST = route(async (request: NextRequest) => {
  const admin = await requireAdmin();
  const input = questionUpsertSchema.parse(await request.json());
  const question = await createQuestion(input, admin.id);

  await recordAudit({
    actorId: admin.id,
    actorEmail: admin.email,
    action: "question.created",
    targetType: "Question",
    targetId: question.id,
    metadata: { category: input.category, topic: input.topic },
    ip: clientIp(request),
  });

  return ok({ id: question.id }, 201);
});

export const dynamic = "force-dynamic";
