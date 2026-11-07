import type { NextRequest } from "next/server";

import { ok, route } from "@/lib/api/response";
import { requireUser } from "@/lib/auth/session";
import { deleteResume, updateResumeAnalysis } from "@/lib/resume/service";
import { resumeAnalysisUpdateSchema } from "@/lib/validation/resume";

/**
 * PATCH /api/resume/[id] — save the user's corrections to the AI extraction.
 * Marks the analysis `userVerified`, because a human has now reviewed it.
 */
export const PATCH = route(
  async (
    request: NextRequest,
    context: { params: Promise<{ id: string }> },
  ) => {
    const user = await requireUser();
    const { id } = await context.params;

    const input = resumeAnalysisUpdateSchema.parse(await request.json());
    await updateResumeAnalysis(user.id, id, input);

    return ok({ saved: true });
  },
);

/** DELETE /api/resume/[id] — removes the stored blob and the DB rows. */
export const DELETE = route(
  async (
    _request: NextRequest,
    context: { params: Promise<{ id: string }> },
  ) => {
    const user = await requireUser();
    const { id } = await context.params;

    await deleteResume(user.id, id);
    return ok({ deleted: true });
  },
);

export const dynamic = "force-dynamic";
