import { ok, route } from "@/lib/api/response";
import { requireUser } from "@/lib/auth/session";
import { completeInterview } from "@/lib/interviews/service";

/**
 * POST /api/interviews/[id]/complete
 *
 * Ends the interview and generates the report. Safe to call twice: if a report
 * already exists it is returned rather than regenerated, which also makes this
 * the retry endpoint when report generation failed the first time.
 */
export const POST = route(
  async (
    _request: Request,
    context: { params: Promise<{ id: string }> },
  ) => {
    const user = await requireUser();
    const { id } = await context.params;

    const report = await completeInterview(user.id, id);

    return ok({
      interviewId: id,
      hasReport: Boolean(report),
      overallScore: report?.overallScore ?? null,
    });
  },
);

export const runtime = "nodejs";
export const maxDuration = 120;
export const dynamic = "force-dynamic";
