import type { NextRequest } from "next/server";

import { ok, route } from "@/lib/api/response";
import { requireUser } from "@/lib/auth/session";
import { submitCode } from "@/lib/coding/service";
import { enforceRateLimit } from "@/lib/rate-limit";
import { submitCodeSchema } from "@/lib/validation/coding";

/**
 * POST /api/coding/[id]/submit — run every test case and record the result.
 *
 * Hidden test-case inputs and expected outputs are stripped in the service
 * layer before the response leaves the server.
 */
export const POST = route(
  async (
    request: NextRequest,
    context: { params: Promise<{ id: string }> },
  ) => {
    const user = await requireUser();
    const { id } = await context.params;

    enforceRateLimit(`coding:submit:${user.id}`, 12, 60_000);

    const input = submitCodeSchema.parse(await request.json());
    const result = await submitCode({
      userId: user.id,
      problemId: id,
      language: input.language,
      code: input.code,
    });

    return ok({
      submissionId: result.submission.id,
      status: result.submission.status,
      passedTests: result.passedTests,
      totalTests: result.total,
      runtimeMs: result.submission.runtimeMs,
      memoryKb: result.submission.memoryKb,
      stderr: result.submission.stderr,
      compileOutput: result.submission.compileOutput,
      results: result.results,
      unlocked: result.unlocked,
    });
  },
);

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";
