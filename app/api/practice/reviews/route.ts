import type { NextRequest } from "next/server";

import { ok, route } from "@/lib/api/response";
import { requireUser } from "@/lib/auth/session";
import { getReviewQueue } from "@/lib/practice/service";

/**
 * GET /api/practice/reviews — the spaced-repetition queue.
 *
 * No AI call: enrolment and scheduling are derived from stored evidence, so
 * this works with no API key configured.
 */
export const GET = route(async (_request: NextRequest) => {
  const user = await requireUser();
  return ok(await getReviewQueue(user.id));
});

export const dynamic = "force-dynamic";
