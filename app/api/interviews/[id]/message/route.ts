import type { NextRequest } from "next/server";

import { ok, route } from "@/lib/api/response";
import { requireUser } from "@/lib/auth/session";
import { submitAnswer } from "@/lib/interviews/service";
import { env } from "@/lib/env";
import { enforceRateLimit } from "@/lib/rate-limit";
import { interviewMessageSchema } from "@/lib/validation/interview";

/**
 * POST /api/interviews/[id]/message
 *
 * One request performs three things: persist the answer, grade it, and produce
 * the next question. The answer is written FIRST, so an AI failure never costs
 * the candidate what they typed.
 */
export const POST = route(
  async (
    request: NextRequest,
    context: { params: Promise<{ id: string }> },
  ) => {
    const user = await requireUser();
    const { id } = await context.params;

    enforceRateLimit(
      `interview:message:${user.id}`,
      env.rateLimit.aiPerMinute,
      60_000,
    );

    const input = interviewMessageSchema.parse(await request.json());
    const result = await submitAnswer(user.id, id, input.answer);

    return ok(result);
  },
);

export const runtime = "nodejs";
export const maxDuration = 120;
export const dynamic = "force-dynamic";
