import type { NextRequest } from "next/server";

import { ok, route } from "@/lib/api/response";
import { requireUser } from "@/lib/auth/session";
import { enforceRateLimit } from "@/lib/rate-limit";
import { searchEverything } from "@/lib/search/service";

/**
 * GET /api/search?q= — global search for the command palette.
 *
 * No AI call, so it works with no API key. Rate limited because the palette
 * fires on keystroke, and an unbounded query-per-character would be a cheap
 * way to hammer the database.
 */
export const GET = route(async (request: NextRequest) => {
  const user = await requireUser();
  enforceRateLimit(`search:${user.id}`, 90, 60_000);

  const query = request.nextUrl.searchParams.get("q") ?? "";
  return ok({ results: await searchEverything(user.id, query) });
});

export const dynamic = "force-dynamic";
