import { ok, route } from "@/lib/api/response";
import { requireUser } from "@/lib/auth/session";
import { deleteJobDescription } from "@/lib/job-description/service";

/** DELETE /api/job-description/[id] */
export const DELETE = route(
  async (
    _request: Request,
    context: { params: Promise<{ id: string }> },
  ) => {
    const user = await requireUser();
    const { id } = await context.params;

    await deleteJobDescription(user.id, id);
    return ok({ deleted: true });
  },
);

export const dynamic = "force-dynamic";
