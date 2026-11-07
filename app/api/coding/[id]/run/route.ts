import type { NextRequest } from "next/server";

import { ok, route } from "@/lib/api/response";
import { requireUser } from "@/lib/auth/session";
import { runCode } from "@/lib/coding/service";
import { enforceRateLimit } from "@/lib/rate-limit";
import { runCodeSchema } from "@/lib/validation/coding";

/**
 * POST /api/coding/[id]/run — execute against a single custom input.
 *
 * The code is forwarded to an external sandbox; it is never evaluated inside
 * this process. Rate limited per user because sandbox time is the scarce
 * resource here.
 */
export const POST = route(
  async (
    request: NextRequest,
    context: { params: Promise<{ id: string }> },
  ) => {
    const user = await requireUser();
    const { id } = await context.params;

    enforceRateLimit(`coding:run:${user.id}`, 20, 60_000);

    const input = runCodeSchema.parse(await request.json());
    const result = await runCode({
      userId: user.id,
      problemId: id,
      language: input.language,
      code: input.code,
      stdin: input.stdin ?? "",
    });

    return ok(result);
  },
);

export const runtime = "nodejs";
export const maxDuration = 90;
export const dynamic = "force-dynamic";
