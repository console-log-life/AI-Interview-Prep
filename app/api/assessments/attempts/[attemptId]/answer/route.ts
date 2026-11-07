import type { NextRequest } from "next/server";

import { ok, route } from "@/lib/api/response";
import { requireUser } from "@/lib/auth/session";
import { saveAnswer } from "@/lib/db/queries/assessments";
import { saveAnswerSchema } from "@/lib/validation/assessment";

/**
 * POST /api/assessments/attempts/[attemptId]/answer
 * Autosave for a single answer — called as the candidate works.
 */
export const POST = route(
  async (
    request: NextRequest,
    context: { params: Promise<{ attemptId: string }> },
  ) => {
    const user = await requireUser();
    const { attemptId } = await context.params;

    const input = saveAnswerSchema.parse(await request.json());
    const result = await saveAnswer(user.id, attemptId, input);

    return ok(result);
  },
);

export const dynamic = "force-dynamic";
