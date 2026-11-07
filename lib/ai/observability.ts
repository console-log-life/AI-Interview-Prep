import "server-only";

import { prisma } from "@/lib/db/prisma";

/**
 * AI telemetry.
 *
 * Records ONLY metadata — provider, model, latency, success, token counts,
 * error category. No prompt text, no completion text, no API key, and no user
 * content of any kind ever reaches this table. That is deliberate: an
 * observability table is exactly the sort of thing that gets exported to a
 * dashboard, and it must be safe to do so.
 *
 * Writes are fire-and-forget: telemetry must never fail a user's request.
 */

export type AiUsageRecord = {
  feature: string;
  provider: string;
  model: string;
  latencyMs: number;
  success: boolean;
  validationOk?: boolean;
  errorCategory?: string;
  inputTokens?: number | null;
  outputTokens?: number | null;
};

/**
 * The user a call belongs to.
 *
 * Set per-request rather than threaded through every AI signature — the
 * provider layer should not need to know about sessions.
 */
let currentUserId: string | null = null;

export function setAiUsageUser(userId: string | null): void {
  currentUserId = userId;
}

export function recordAiUsage(record: AiUsageRecord): void {
  const userId = currentUserId;

  void prisma.aIUsageLog
    .create({
      data: {
        userId,
        feature: record.feature,
        provider: record.provider,
        model: record.model,
        latencyMs: Math.max(0, Math.round(record.latencyMs)),
        success: record.success,
        validationOk: record.validationOk ?? record.success,
        errorCategory: record.errorCategory ?? null,
        inputTokens: record.inputTokens ?? null,
        outputTokens: record.outputTokens ?? null,
      },
    })
    .catch((error) => {
      // Never surface — telemetry failure is not the user's problem.
      console.error("[ai-usage] failed to record:", error);
    });
}

export type AiUsageSummary = {
  totalCalls: number;
  successRate: number;
  averageLatencyMs: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  byFeature: Array<{
    feature: string;
    calls: number;
    failures: number;
    averageLatencyMs: number;
  }>;
  recentFailures: Array<{
    feature: string;
    errorCategory: string | null;
    createdAt: Date;
  }>;
};

/** Aggregate usage for the admin dashboard. */
export async function getAiUsageSummary(days = 30): Promise<AiUsageSummary> {
  const since = new Date(Date.now() - days * 86_400_000);

  const [totals, grouped, failures] = await Promise.all([
    prisma.aIUsageLog.aggregate({
      where: { createdAt: { gte: since } },
      _count: { _all: true },
      _avg: { latencyMs: true },
      _sum: { inputTokens: true, outputTokens: true },
    }),
    prisma.aIUsageLog.groupBy({
      by: ["feature"],
      where: { createdAt: { gte: since } },
      _count: { _all: true },
      _avg: { latencyMs: true },
    }),
    prisma.aIUsageLog.findMany({
      where: { createdAt: { gte: since }, success: false },
      orderBy: { createdAt: "desc" },
      take: 15,
      select: { feature: true, errorCategory: true, createdAt: true },
    }),
  ]);

  const successCount = await prisma.aIUsageLog.count({
    where: { createdAt: { gte: since }, success: true },
  });

  const failuresByFeature = await prisma.aIUsageLog.groupBy({
    by: ["feature"],
    where: { createdAt: { gte: since }, success: false },
    _count: { _all: true },
  });
  const failureMap = new Map(
    failuresByFeature.map((row) => [row.feature, row._count._all]),
  );

  const totalCalls = totals._count._all;

  return {
    totalCalls,
    successRate: totalCalls > 0 ? Math.round((successCount / totalCalls) * 100) : 0,
    averageLatencyMs: Math.round(totals._avg.latencyMs ?? 0),
    totalInputTokens: totals._sum.inputTokens ?? 0,
    totalOutputTokens: totals._sum.outputTokens ?? 0,
    byFeature: grouped
      .map((row) => ({
        feature: row.feature,
        calls: row._count._all,
        failures: failureMap.get(row.feature) ?? 0,
        averageLatencyMs: Math.round(row._avg.latencyMs ?? 0),
      }))
      .sort((a, b) => b.calls - a.calls),
    recentFailures: failures,
  };
}

/**
 * Per-user AI spend guard.
 *
 * Complements the request-rate limiter: rate limiting stops bursts, this stops
 * a slow, sustained drain on the API budget.
 */
export async function countUserAiCalls(
  userId: string,
  windowHours = 24,
): Promise<number> {
  const since = new Date(Date.now() - windowHours * 3_600_000);
  return prisma.aIUsageLog.count({
    where: { userId, createdAt: { gte: since } },
  });
}
