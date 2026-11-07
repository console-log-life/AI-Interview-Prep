import { ok, route } from "@/lib/api/response";
import { requireUser } from "@/lib/auth/session";
import { startOrResumeAttempt } from "@/lib/db/queries/assessments";

/**
 * POST /api/assessments/[id]/start
 *
 * Idempotent by design: calling it again while an attempt is open returns the
 * SAME attempt rather than creating a second one, which is what makes the
 * timer un-resettable by reloading.
 */
export const POST = route(
  async (
    _request: Request,
    context: { params: Promise<{ id: string }> },
  ) => {
    const user = await requireUser();
    const { id } = await context.params;

    const attempt = await startOrResumeAttempt(user.id, id);
    return ok({ attemptId: attempt.id });
  },
);

export const dynamic = "force-dynamic";
