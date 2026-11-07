import type { NextRequest } from "next/server";

import { ok, route } from "@/lib/api/response";
import { requireUser } from "@/lib/auth/session";
import { getMistakeTimeline } from "@/lib/mistakes/service";

/**
 * GET /api/mistakes/[id] — the full history of one tracked mistake.
 *
 * Ownership is enforced in the service query, so an id belonging to another
 * account 404s rather than leaking that it exists.
 */
export const GET = route(
  async (_request: NextRequest, context: { params: Promise<{ id: string }> }) => {
    const user = await requireUser();
    const { id } = await context.params;
    return ok(await getMistakeTimeline(user.id, id));
  },
);

export const dynamic = "force-dynamic";
