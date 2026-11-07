import { ok, route } from "@/lib/api/response";
import { requireUser } from "@/lib/auth/session";
import { enforceRateLimit } from "@/lib/rate-limit";
import { extractClaims, getClaims } from "@/lib/resume/claims";

/** GET /api/resume/[id]/claims — extracted claims and their verification state. */
export const GET = route(
  async (_request: Request, context: { params: Promise<{ id: string }> }) => {
    const user = await requireUser();
    const { id } = await context.params;
    return ok(await getClaims(user.id, id));
  },
);

/** POST /api/resume/[id]/claims — (re)extract verifiable claims. */
export const POST = route(
  async (_request: Request, context: { params: Promise<{ id: string }> }) => {
    const user = await requireUser();
    const { id } = await context.params;

    enforceRateLimit(`claims:${user.id}`, 8, 60 * 60 * 1000);

    const claims = await extractClaims(user.id, id);
    return ok({ count: claims.length, claims }, 201);
  },
);

export const runtime = "nodejs";
export const maxDuration = 180;
export const dynamic = "force-dynamic";
