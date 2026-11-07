import { ok, route } from "@/lib/api/response";
import { computeReadinessV2 } from "@/lib/analytics/service";
import { CONFIDENCE_LEVEL_LABEL } from "@/lib/analytics/readiness";
import { requireUser } from "@/lib/auth/session";

/**
 * GET /api/analytics/readiness
 *
 * Returns the score AND the reasoning behind it. Exposing `explanations` and
 * `evidenceFactor` is deliberate: a readiness number the user cannot
 * interrogate is not a number they should trust.
 */
export const GET = route(async () => {
  const user = await requireUser();
  const result = await computeReadinessV2(user.id);

  return ok({
    ...result,
    confidenceLabel: CONFIDENCE_LEVEL_LABEL[result.confidence],
  });
});

export const dynamic = "force-dynamic";
