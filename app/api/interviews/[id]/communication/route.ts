import type { NextRequest } from "next/server";
import { z } from "zod";

import { RateLimitError } from "@/lib/api/errors";
import { ok, route } from "@/lib/api/response";
import { countUserAiCalls } from "@/lib/ai/observability";
import { requireUser } from "@/lib/auth/session";
import {
  analyzeAnswerCommunication,
  getInterviewCommunication,
} from "@/lib/communication/service";
import { env } from "@/lib/env";
import { enforceRateLimit } from "@/lib/rate-limit";

const bodySchema = z.object({
  evaluationId: z.string().min(1).max(64),
});

/** GET /api/interviews/[id]/communication — stored coaching for this interview. */
export const GET = route(
  async (_request: NextRequest, context: { params: Promise<{ id: string }> }) => {
    const user = await requireUser();
    const { id } = await context.params;
    return ok(await getInterviewCommunication(user.id, id));
  },
);

/**
 * POST /api/interviews/[id]/communication — coach one specific answer.
 *
 * The interview id in the path is not what authorises the call: ownership is
 * checked against the evaluation itself inside the service, so a valid id for
 * one interview cannot be used to reach another user's answer.
 */
export const POST = route(
  async (request: NextRequest, context: { params: Promise<{ id: string }> }) => {
    const user = await requireUser();
    await context.params;

    enforceRateLimit(`communication:${user.id}`, 20, 60 * 60 * 1000);

    const dailyCalls = await countUserAiCalls(user.id, 24);
    if (dailyCalls >= env.rateLimit.aiPerDay) {
      throw new RateLimitError(
        "You have reached today's AI usage limit. It resets 24 hours after your first request today.",
      );
    }

    const input = bodySchema.parse(await request.json());
    const analysis = await analyzeAnswerCommunication({
      userId: user.id,
      evaluationId: input.evaluationId,
    });

    return ok(analysis, 201);
  },
);

export const runtime = "nodejs";
export const maxDuration = 120;
export const dynamic = "force-dynamic";
