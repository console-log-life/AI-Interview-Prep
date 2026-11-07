import type { NextRequest } from "next/server";

import { ValidationError } from "@/lib/api/errors";
import { ok, route } from "@/lib/api/response";
import { requireUser } from "@/lib/auth/session";
import { enforceRateLimit } from "@/lib/rate-limit";
import { getSttProvider, validateAudioUpload } from "@/lib/voice";
import { analyzeSpeech, paceAssessment } from "@/lib/voice/metrics";

/**
 * POST /api/voice/transcribe
 *
 * Audio → transcript + speech metrics. When no STT provider is configured the
 * registry throws a typed 503 naming the missing env var, which the UI renders
 * as a ServiceNotice. It never returns a fabricated transcript.
 */
export const POST = route(async (request: NextRequest) => {
  const user = await requireUser();
  enforceRateLimit(`voice:stt:${user.id}`, 30, 60 * 60 * 1000);

  const formData = await request.formData();
  const file = formData.get("audio");
  if (!(file instanceof File)) {
    throw new ValidationError("No audio was uploaded.");
  }

  const { buffer, mimeType } = await validateAudioUpload(file);

  const provider = getSttProvider();
  const result = await provider.transcribe({ audio: buffer, mimeType });

  // Metrics are computed from what the provider actually returned; anything
  // unsupported is reported in `unavailable` rather than estimated.
  const metrics = analyzeSpeech({
    transcript: result.text,
    durationSec: result.durationSec,
    words: result.words,
  });

  return ok({
    transcript: result.text,
    confidence: result.confidence,
    metrics,
    pace: paceAssessment(metrics.wordsPerMinute),
    provider: provider.name,
  });
});

export const runtime = "nodejs";
export const maxDuration = 180;
export const dynamic = "force-dynamic";
