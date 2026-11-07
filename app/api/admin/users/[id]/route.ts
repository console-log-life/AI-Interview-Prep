import type { NextRequest } from "next/server";
import { z } from "zod";

import { ForbiddenError, NotFoundError } from "@/lib/api/errors";
import { ok, route } from "@/lib/api/response";
import { requireAdmin } from "@/lib/auth/session";
import { clientIp, recordAudit } from "@/lib/audit/service";
import { prisma } from "@/lib/db/prisma";

const patchSchema = z.object({
  role: z.enum(["STUDENT", "ADMIN"]).optional(),
  isActive: z.boolean().optional(),
});

/**
 * PATCH /api/admin/users/[id] — change a user's role or suspend them.
 *
 * An admin cannot demote or deactivate themselves: that is the classic way to
 * end up with zero administrators and no way back in.
 */
export const PATCH = route(
  async (request: NextRequest, context: { params: Promise<{ id: string }> }) => {
    const admin = await requireAdmin();
    const { id } = await context.params;

    if (id === admin.id) {
      throw new ForbiddenError(
        "You can't change your own role or status. Ask another administrator.",
      );
    }

    const target = await prisma.user.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!target) throw new NotFoundError("We could not find that user.");

    const input = patchSchema.parse(await request.json());
    const updated = await prisma.user.update({
      where: { id },
      data: input,
      select: { id: true, role: true, isActive: true },
    });

    // Role and suspension changes are exactly the actions an audit trail is for.
    if (input.role !== undefined) {
      await recordAudit({
        actorId: admin.id,
        actorEmail: admin.email,
        action: "user.role_changed",
        targetType: "User",
        targetId: id,
        metadata: { newRole: input.role },
        ip: clientIp(request),
      });
    }
    if (input.isActive !== undefined) {
      await recordAudit({
        actorId: admin.id,
        actorEmail: admin.email,
        action: "user.status_changed",
        targetType: "User",
        targetId: id,
        metadata: { isActive: input.isActive },
        ip: clientIp(request),
      });
    }

    return ok(updated);
  },
);

export const dynamic = "force-dynamic";
