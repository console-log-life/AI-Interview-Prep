import type { NextRequest } from "next/server";

import { ok, route } from "@/lib/api/response";
import { requireUser } from "@/lib/auth/session";
import { probeLiveService } from "@/lib/ai/live/grant";
import { isLiveVoiceConfigured } from "@/lib/env";
import { enforceRateLimit } from "@/lib/rate-limit";

/**
 * POST /api/interviews/[id]/live/probe — is a realtime interview actually
 * possible right now?
 *
 * The device check needs to show "Connection ✓" without lying, and a config
 * flag cannot support that claim. This does a real round trip to the voice
 * provider and reports what happened, so a valid-looking key with an exhausted
 * quota is caught here rather than thirty seconds into an interview.
 *
 * The probe credential is discarded server-side and never returned — a caller
 * cannot use this endpoint to obtain a session.
 *
 * Returns 200 with `reachable: false` on failure rather than an error status:
 * "the voice service is down" is the answer to this question, not a fault in
 * the request.
 */
export const POST = route(
  async (_request: NextRequest, context: { params: Promise<{ id: string }> }) => {
    const user = await requireUser();
    const { id } = await context.params;

    if (!isLiveVoiceConfigured()) {
      return ok({ reachable: false, configured: false, latencyMs: null });
    }

    // Separate budget from the grant limiter, so re-checking devices a few
    // times never eats the allowance the interview itself needs.
    enforceRateLimit(`live:probe:${user.id}`, 15, 10 * 60_000);

    const result = await probeLiveService({ userId: user.id, interviewId: id });
    return ok({ configured: true, ...result });
  },
);

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
