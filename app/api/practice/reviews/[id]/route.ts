import type { NextRequest } from "next/server";
import { z } from "zod";

import { ok, route } from "@/lib/api/response";
import { requireUser } from "@/lib/auth/session";
import { recordReview, retireReviewItem } from "@/lib/practice/service";

const bodySchema = z.object({
  quality: z.enum(["AGAIN", "HARD", "GOOD", "EASY"]),
});

/** PATCH /api/practice/reviews/[id] — record a self-graded review. */
export const PATCH = route(
  async (request: NextRequest, context: { params: Promise<{ id: string }> }) => {
    const user = await requireUser();
    const { id } = await context.params;

    const input = bodySchema.parse(await request.json());
    const updated = await recordReview({
      userId: user.id,
      reviewItemId: id,
      quality: input.quality,
    });

    return ok(updated);
  },
);

/**
 * DELETE /api/practice/reviews/[id] — retire an item from the queue.
 * The row and its history are kept; only `isActive` flips.
 */
export const DELETE = route(
  async (_request: NextRequest, context: { params: Promise<{ id: string }> }) => {
    const user = await requireUser();
    const { id } = await context.params;
    return ok(await retireReviewItem(user.id, id));
  },
);

export const dynamic = "force-dynamic";
