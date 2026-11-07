import type { NextRequest } from "next/server";

import { ok, route } from "@/lib/api/response";
import { requireUser } from "@/lib/auth/session";
import { analyzeJobDescription } from "@/lib/job-description/service";
import { enforceRateLimit } from "@/lib/rate-limit";
import { analyzeJobDescriptionSchema } from "@/lib/validation/job-description";

/** POST /api/job-description/analyze — analyse a posting against the user. */
export const POST = route(async (request: NextRequest) => {
  const user = await requireUser();
  enforceRateLimit(`jd:analyze:${user.id}`, 15, 60 * 60 * 1000);

  const input = analyzeJobDescriptionSchema.parse(await request.json());
  const record = await analyzeJobDescription(user.id, input);

  return ok({ id: record.id, matchScore: record.matchScore }, 201);
});

export const runtime = "nodejs";
export const maxDuration = 180;
export const dynamic = "force-dynamic";
