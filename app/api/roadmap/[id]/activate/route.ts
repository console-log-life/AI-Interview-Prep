import type { NextRequest } from "next/server";

import { ok, route } from "@/lib/api/response";
import { requireUser } from "@/lib/auth/session";
import { activateRoadmap } from "@/lib/roadmap/service";

/**
 * POST /api/roadmap/[id]/activate — restore a superseded roadmap.
 *
 * No AI call: this only flips which stored plan is current, so it works with
 * no API key and costs nothing.
 */
export const POST = route(
  async (_request: NextRequest, context: { params: Promise<{ id: string }> }) => {
    const user = await requireUser();
    const { id } = await context.params;
    return ok(await activateRoadmap(user.id, id));
  },
);

export const dynamic = "force-dynamic";
