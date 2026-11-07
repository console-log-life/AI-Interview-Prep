import type { NextRequest } from "next/server";

import { ServiceUnavailableError } from "@/lib/api/errors";
import { ok, route } from "@/lib/api/response";
import { requireUser } from "@/lib/auth/session";
import { createLiveGrant } from "@/lib/ai/live/grant";
import { isLiveVoiceConfigured } from "@/lib/env";
import { enforceRateLimit } from "@/lib/rate-limit";

/**
 * POST /api/interviews/[id]/live — mint an ephemeral Live session token.
 *
 * The response never contains GEMINI_API_KEY. It carries a single-use Google
 * token, bound server-side to one model and one system instruction, which the
 * browser uses to open its own WebSocket to Gemini.
 *
 * Rate limited tightly: one interview should need exactly one grant, so a
 * client requesting them in a loop is either buggy or abusive, and each grant
 * costs a token-creation call upstream.
 */
export const POST = route(
  async (_request: NextRequest, context: { params: Promise<{ id: string }> }) => {
    const user = await requireUser();
    const { id } = await context.params;

    if (!isLiveVoiceConfigured()) {
      throw new ServiceUnavailableError(
        "Voice interviews are not configured on this deployment. The text interview is available.",
        "live_not_configured",
      );
    }

    // Allows a handful of reconnects within an interview without permitting
    // an unbounded loop.
    enforceRateLimit(`live:grant:${user.id}`, 10, 10 * 60_000);

    const grant = await createLiveGrant({ userId: user.id, interviewId: id });

    // The system instruction is returned so the client can pass it back on
    // connect; it contains only this user's own measured data, never secrets.
    return ok(grant, 201);
  },
);

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
