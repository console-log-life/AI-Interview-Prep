import type { NextRequest } from "next/server";
import { z } from "zod";

import { ValidationError } from "@/lib/api/errors";
import { ok, route } from "@/lib/api/response";
import { verifyPassword } from "@/lib/auth/password";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { getStorage } from "@/lib/storage";

const deleteSchema = z.object({
  password: z.string().min(1, "Password is required"),
  confirm: z.literal("DELETE", {
    errorMap: () => ({ message: 'Type DELETE exactly to confirm' }),
  }),
});

/**
 * DELETE /api/settings/account — permanently delete the account.
 *
 * Re-authentication plus a typed confirmation, because this is irreversible.
 * Stored resume files are removed from the storage provider first; every other
 * row is removed by the `onDelete: Cascade` relations in the schema.
 */
export const DELETE = route(async (request: NextRequest) => {
  const user = await requireUser();
  const input = deleteSchema.parse(await request.json());

  const record = await prisma.user.findUnique({
    where: { id: user.id },
    select: { passwordHash: true },
  });

  const valid = await verifyPassword(input.password, record?.passwordHash);
  if (!valid) {
    throw new ValidationError("That password is incorrect.", {
      fields: { password: "Incorrect password" },
    });
  }

  const resumes = await prisma.resume.findMany({
    where: { userId: user.id },
    select: { storageKey: true },
  });

  const storage = getStorage();
  await Promise.allSettled(
    resumes.map((resume) => storage.delete(resume.storageKey)),
  );

  await prisma.user.delete({ where: { id: user.id } });

  return ok({ deleted: true });
});

export const dynamic = "force-dynamic";
