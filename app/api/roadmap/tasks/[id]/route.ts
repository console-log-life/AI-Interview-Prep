import type { NextRequest } from "next/server";
import { z } from "zod";

import { ok, route } from "@/lib/api/response";
import { requireUser } from "@/lib/auth/session";
import { toggleRoadmapTask } from "@/lib/roadmap/service";

const bodySchema = z.object({ isCompleted: z.boolean() });

/** PATCH /api/roadmap/tasks/[id] — tick a roadmap task off. */
export const PATCH = route(
  async (request: NextRequest, context: { params: Promise<{ id: string }> }) => {
    const user = await requireUser();
    const { id } = await context.params;

    const input = bodySchema.parse(await request.json());
    // Ownership is verified through the parent roadmap in the service.
    const task = await toggleRoadmapTask(user.id, id, input.isCompleted);

    return ok({ id: task.id, isCompleted: task.isCompleted });
  },
);

export const dynamic = "force-dynamic";
