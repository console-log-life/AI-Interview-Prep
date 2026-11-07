import type { NextRequest } from "next/server";
import { z } from "zod";

import { ok, route } from "@/lib/api/response";
import { requireUser } from "@/lib/auth/session";
import { enforceRateLimit } from "@/lib/rate-limit";
import { ALLOWED_HORIZONS, generateRoadmap } from "@/lib/roadmap/service";

const bodySchema = z.object({
  horizonDays: z.union([
    z.literal(7),
    z.literal(14),
    z.literal(30),
    z.literal(60),
    z.literal(90),
  ]),
  minutesPerDay: z.coerce.number().int().min(15).max(480).default(60),
});

/** POST /api/roadmap/generate — build a personalised preparation plan. */
export const POST = route(async (request: NextRequest) => {
  const user = await requireUser();
  // Roadmaps are expensive and rarely need regenerating more than a few times.
  enforceRateLimit(`roadmap:${user.id}`, 6, 60 * 60 * 1000);

  const input = bodySchema.parse(await request.json());
  const roadmap = await generateRoadmap({
    userId: user.id,
    horizonDays: input.horizonDays as (typeof ALLOWED_HORIZONS)[number],
    minutesPerDay: input.minutesPerDay,
  });

  return ok({ id: roadmap.id }, 201);
});

export const runtime = "nodejs";
export const maxDuration = 180;
export const dynamic = "force-dynamic";
