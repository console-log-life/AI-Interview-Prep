import type { NextRequest } from "next/server";

import { ok, route } from "@/lib/api/response";
import { requireUser } from "@/lib/auth/session";
import { createInterview } from "@/lib/interviews/service";
import { env } from "@/lib/env";
import { enforceRateLimit } from "@/lib/rate-limit";
import { createInterviewSchema } from "@/lib/validation/interview";

/** POST /api/interviews — start a new mock interview. */
export const POST = route(async (request: NextRequest) => {
  const user = await requireUser();
  // Starting an interview is one of the most expensive AI calls in the app.
  enforceRateLimit(`interview:create:${user.id}`, 10, 60 * 60 * 1000);

  const input = createInterviewSchema.parse(await request.json());
  const interviewId = await createInterview(user.id, input);

  return ok({ interviewId }, 201);
});

export const runtime = "nodejs";
// AI generation can take a while; give the route room before the platform
// kills it. (Vercel Hobby caps this lower — see README → Deployment.)
export const maxDuration = 120;

export const dynamic = "force-dynamic";

// Referenced so the module is not tree-shaken before env validation runs.
void env.ai.provider;
