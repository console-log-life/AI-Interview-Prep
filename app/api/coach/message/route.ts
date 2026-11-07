import type { NextRequest } from "next/server";
import { z } from "zod";

import { RateLimitError } from "@/lib/api/errors";
import { ok, route } from "@/lib/api/response";
import { countUserAiCalls } from "@/lib/ai/observability";
import { requireUser } from "@/lib/auth/session";
import { sendCoachMessage } from "@/lib/coach/service";
import { env } from "@/lib/env";
import { enforceRateLimit } from "@/lib/rate-limit";
import { sanitizedBlock } from "@/lib/validation/common";

const bodySchema = z.object({
  conversationId: z.string().min(1).max(64).optional(),
  question: sanitizedBlock(2000, 3),
});

/** POST /api/coach/message — one grounded coach turn. */
export const POST = route(async (request: NextRequest) => {
  const user = await requireUser();

  // Two limiters: burst protection, and a daily budget guard.
  enforceRateLimit(`coach:${user.id}`, env.rateLimit.aiPerMinute, 60_000);

  const dailyCalls = await countUserAiCalls(user.id, 24);
  if (dailyCalls >= env.rateLimit.aiPerDay) {
    throw new RateLimitError(
      "You have reached today's AI usage limit. It resets 24 hours after your first request today.",
    );
  }

  const input = bodySchema.parse(await request.json());
  const result = await sendCoachMessage({
    userId: user.id,
    conversationId: input.conversationId,
    question: input.question,
  });

  return ok(result);
});

export const runtime = "nodejs";
export const maxDuration = 120;
export const dynamic = "force-dynamic";
