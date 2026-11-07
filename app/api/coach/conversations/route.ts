import { ok, route } from "@/lib/api/response";
import { requireUser } from "@/lib/auth/session";
import { createConversation, listConversations } from "@/lib/coach/service";

/** GET /api/coach/conversations — the signed-in user's own conversations. */
export const GET = route(async () => {
  const user = await requireUser();
  return ok(await listConversations(user.id));
});

/** POST /api/coach/conversations — start an empty conversation. */
export const POST = route(async () => {
  const user = await requireUser();
  const conversation = await createConversation(user.id);
  return ok(conversation, 201);
});

export const dynamic = "force-dynamic";
