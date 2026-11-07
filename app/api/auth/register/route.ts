import type { NextRequest } from "next/server";

import { ok, route } from "@/lib/api/response";
import { createUser } from "@/lib/db/queries/users";
import { enforceRateLimit } from "@/lib/rate-limit";
import { registerSchema } from "@/lib/validation/auth";

/**
 * POST /api/auth/register — create a credentials account.
 *
 * Sign-in is NOT performed here; the client calls `signIn("credentials", …)`
 * afterwards so Auth.js owns session creation end to end.
 */
export const POST = route(async (request: NextRequest) => {
  // Registration is a cheap endpoint to abuse, so it is rate limited per IP.
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";
  enforceRateLimit(`register:${ip}`, 8, 60 * 60 * 1000);

  const body = await request.json();
  const input = registerSchema.parse(body);

  const user = await createUser({
    name: input.name,
    email: input.email,
    password: input.password,
  });

  return ok({ id: user.id, email: user.email }, 201);
});
