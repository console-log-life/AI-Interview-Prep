import type { NextRequest } from "next/server";

import { ValidationError } from "@/lib/api/errors";
import { ok, route } from "@/lib/api/response";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { enforceRateLimit } from "@/lib/rate-limit";
import { changePasswordSchema } from "@/lib/validation/auth";

/**
 * POST /api/settings/password — change the signed-in user's password.
 *
 * Requires the CURRENT password even though the user is already signed in, so
 * a hijacked session cannot silently lock the real owner out.
 */
export const POST = route(async (request: NextRequest) => {
  const user = await requireUser();
  enforceRateLimit(`password:${user.id}`, 5, 15 * 60 * 1000);

  const input = changePasswordSchema.parse(await request.json());

  const record = await prisma.user.findUnique({
    where: { id: user.id },
    select: { passwordHash: true },
  });

  const valid = await verifyPassword(
    input.currentPassword,
    record?.passwordHash,
  );
  if (!valid) {
    throw new ValidationError("Your current password is incorrect.", {
      fields: { currentPassword: "Incorrect password" },
    });
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(input.newPassword) },
  });

  return ok({ changed: true });
});

export const dynamic = "force-dynamic";
