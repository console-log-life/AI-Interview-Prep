import type { NextRequest } from "next/server";

import { ok, route } from "@/lib/api/response";
import { getAiUsageSummary } from "@/lib/ai/observability";
import { requireAdmin } from "@/lib/auth/session";
import { listAuditLogs } from "@/lib/audit/service";

/**
 * GET /api/admin/observability — AI usage + audit trail.
 *
 * The usage table holds only metadata (provider, model, latency, tokens,
 * error category). No prompt or completion text is stored, so this endpoint
 * cannot leak user content.
 */
export const GET = route(async (request: NextRequest) => {
  await requireAdmin();

  const params = request.nextUrl.searchParams;
  const days = Math.min(90, Math.max(1, Number(params.get("days")) || 30));

  const [usage, audit] = await Promise.all([
    getAiUsageSummary(days),
    listAuditLogs({ page: Number(params.get("page")) || 1, pageSize: 25 }),
  ]);

  return ok({ usage, audit, windowDays: days });
});

export const dynamic = "force-dynamic";
