import type { NextRequest } from "next/server";

import { ok, route } from "@/lib/api/response";
import { getJobReadiness } from "@/lib/analytics/job-readiness";
import { requireUser } from "@/lib/auth/session";

/**
 * GET /api/job-description/[id]/readiness
 *
 * Measured readiness for this posting. No AI call — it reads the skill ledger,
 * so it works with no API key and costs nothing.
 */
export const GET = route(
  async (_request: NextRequest, context: { params: Promise<{ id: string }> }) => {
    const user = await requireUser();
    const { id } = await context.params;
    return ok(await getJobReadiness(user.id, id));
  },
);

export const dynamic = "force-dynamic";
