import { ok, route } from "@/lib/api/response";
import { requireUser } from "@/lib/auth/session";
import { deleteConversation, getConversation } from "@/lib/coach/service";

export const GET = route(
  async (_request: Request, context: { params: Promise<{ id: string }> }) => {
    const user = await requireUser();
    const { id } = await context.params;
    // Ownership is enforced inside the service query, not here.
    return ok(await getConversation(user.id, id));
  },
);

export const DELETE = route(
  async (_request: Request, context: { params: Promise<{ id: string }> }) => {
    const user = await requireUser();
    const { id } = await context.params;
    await deleteConversation(user.id, id);
    return ok({ deleted: true });
  },
);

export const dynamic = "force-dynamic";
