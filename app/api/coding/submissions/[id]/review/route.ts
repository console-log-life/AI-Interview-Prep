import type { NextRequest } from "next/server";
import { z } from "zod";

import { ok, route } from "@/lib/api/response";
import { requireUser } from "@/lib/auth/session";
import { getReview, reviewSubmission } from "@/lib/coding/review";
import { enforceRateLimit } from "@/lib/rate-limit";

const bodySchema = z.object({
  /** The optimized solution is opt-in — never volunteered. */
  includeOptimizedApproach: z.boolean().default(false),
});

/**
 * GET /api/coding/submissions/[id]/review — an existing review, if any.
 *
 * Returns null rather than 404 when none exists: "not reviewed yet" is a
 * normal state the UI renders as a prompt, not an error. No AI call, so this
 * costs nothing and lets the panel restore itself after a refresh.
 */
export const GET = route(
  async (_request: NextRequest, context: { params: Promise<{ id: string }> }) => {
    const user = await requireUser();
    const { id } = await context.params;
    return ok(await getReview(user.id, id));
  },
);

/** POST /api/coding/submissions/[id]/review — AI review of one submission. */
export const POST = route(
  async (request: NextRequest, context: { params: Promise<{ id: string }> }) => {
    const user = await requireUser();
    const { id } = await context.params;

    enforceRateLimit(`review:${user.id}`, 10, 60 * 60 * 1000);

    const input = bodySchema.parse(await request.json().catch(() => ({})));
    const review = await reviewSubmission({
      userId: user.id,
      submissionId: id,
      includeOptimizedApproach: input.includeOptimizedApproach,
    });

    return ok(review);
  },
);

export const runtime = "nodejs";
export const maxDuration = 180;
export const dynamic = "force-dynamic";
