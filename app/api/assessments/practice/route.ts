import type { NextRequest } from "next/server";

import { ok, route } from "@/lib/api/response";
import { requireUser } from "@/lib/auth/session";
import { createPracticeAssessment } from "@/lib/db/queries/assessments";
import { enforceRateLimit } from "@/lib/rate-limit";
import { startAssessmentSchema } from "@/lib/validation/assessment";

/** POST /api/assessments/practice — build a one-off practice set and start it. */
export const POST = route(async (request: NextRequest) => {
  const user = await requireUser();
  enforceRateLimit(`practice:${user.id}`, 20, 60 * 60 * 1000);

  const input = startAssessmentSchema.parse(await request.json());
  const attempt = await createPracticeAssessment(user.id, input);

  return ok({ attemptId: attempt.id }, 201);
});

export const dynamic = "force-dynamic";
