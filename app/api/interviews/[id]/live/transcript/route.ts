import type { NextRequest } from "next/server";
import { z } from "zod";

import { ok, route } from "@/lib/api/response";
import { requireUser } from "@/lib/auth/session";
import { persistLiveTurns } from "@/lib/interviews/live-service";

const segmentSchema = z.object({
  speaker: z.enum(["AI", "CANDIDATE"]),
  text: z.string().trim().min(1).max(8000),
  atMs: z.coerce.number().int().min(0).max(24 * 60 * 60 * 1000),
});

const bodySchema = z.object({
  segments: z.array(segmentSchema).max(200),
  interruptions: z.coerce.number().int().min(0).max(500).default(0),
});

/**
 * POST /api/interviews/[id]/live/transcript
 *
 * Persists finalized dialogue from a live session. Called periodically during
 * the interview rather than once at the end, so a dropped connection does not
 * lose everything the candidate said.
 *
 * Idempotent by design: the service skips segments already stored, so a retry
 * after a failed flush cannot duplicate the transcript.
 */
export const POST = route(
  async (request: NextRequest, context: { params: Promise<{ id: string }> }) => {
    const user = await requireUser();
    const { id } = await context.params;

    const input = bodySchema.parse(await request.json());
    const result = await persistLiveTurns({
      userId: user.id,
      interviewId: id,
      segments: input.segments,
      interruptions: input.interruptions,
    });

    return ok(result);
  },
);

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
