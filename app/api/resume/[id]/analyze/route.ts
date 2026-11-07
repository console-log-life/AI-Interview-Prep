import { ok, route } from "@/lib/api/response";
import { requireUser } from "@/lib/auth/session";
import { enforceRateLimit } from "@/lib/rate-limit";
import { analyzeResume } from "@/lib/resume/service";

/**
 * POST /api/resume/[id]/analyze
 *
 * Extract text → AI analysis → structured, user-editable profile.
 * Separate from upload so it can be retried without re-uploading the file.
 */
export const POST = route(
  async (
    _request: Request,
    context: { params: Promise<{ id: string }> },
  ) => {
    const user = await requireUser();
    const { id } = await context.params;

    enforceRateLimit(`resume:analyze:${user.id}`, 10, 60 * 60 * 1000);

    const analysis = await analyzeResume(user.id, id);

    return ok({
      resumeId: id,
      fullName: analysis.fullName,
      skills: analysis.skills,
      summary: analysis.summary,
    });
  },
);

export const runtime = "nodejs";
export const maxDuration = 180;
export const dynamic = "force-dynamic";
