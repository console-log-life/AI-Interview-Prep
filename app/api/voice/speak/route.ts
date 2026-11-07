import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";

import { route } from "@/lib/api/response";
import { requireUser } from "@/lib/auth/session";
import { enforceRateLimit } from "@/lib/rate-limit";
import { getTtsProvider } from "@/lib/voice";

const bodySchema = z.object({
  text: z.string().min(1).max(2500),
});

/**
 * POST /api/voice/speak — text → spoken audio for the interviewer's question.
 * Returns the audio stream directly rather than the JSON envelope.
 */
export const POST = route(async (request: NextRequest) => {
  const user = await requireUser();
  enforceRateLimit(`voice:tts:${user.id}`, 60, 60 * 60 * 1000);

  const input = bodySchema.parse(await request.json());

  const provider = getTtsProvider();
  const result = await provider.speak({ text: input.text });

  return new NextResponse(new Uint8Array(result.audio), {
    headers: {
      "Content-Type": result.mimeType,
      "Content-Length": String(result.audio.length),
      "Cache-Control": "private, no-store",
    },
  });
});

export const runtime = "nodejs";
export const maxDuration = 120;
export const dynamic = "force-dynamic";
