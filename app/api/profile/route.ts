import type { NextRequest } from "next/server";

import { ok, route } from "@/lib/api/response";
import { requireUser } from "@/lib/auth/session";
import { getProfileForForm, saveProfile } from "@/lib/db/queries/profile";
import { refreshRecommendations } from "@/lib/recommendations/service";
import { profileSchema } from "@/lib/validation/profile";

/** GET /api/profile — the signed-in user's own profile. */
export const GET = route(async () => {
  const user = await requireUser();
  const profile = await getProfileForForm(user.id);
  return ok(profile);
});

/**
 * PUT /api/profile — update the signed-in user's profile.
 *
 * The user id comes from the session, never from the request body — a client
 * cannot edit somebody else's profile by sending a different id.
 */
export const PUT = route(async (request: NextRequest) => {
  const user = await requireUser();
  const input = profileSchema.parse(await request.json());

  await saveProfile(user.id, input);
  // Filling in a target role or skills changes what the engine recommends.
  await refreshRecommendations(user.id);

  return ok({ saved: true });
});

export const dynamic = "force-dynamic";
