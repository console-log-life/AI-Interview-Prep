import "server-only";

import { ServiceUnavailableError, ValidationError } from "@/lib/api/errors";
import { env } from "@/lib/env";
import {
  DeepgramSttProvider,
  ElevenLabsTtsProvider,
  WhisperSttProvider,
} from "./providers";
import {
  ALLOWED_AUDIO_TYPES,
  MAX_AUDIO_BYTES,
  type SpeechToTextProvider,
  type TextToSpeechProvider,
} from "./types";

/**
 * Voice provider registry.
 *
 * Follows the same contract as the AI and code-execution registries: when
 * nothing is configured, the getter throws a typed 503 with the exact
 * environment variable to set. The UI turns that into a ServiceNotice.
 *
 * There is deliberately NO fallback that fabricates a transcript. A voice
 * feature that silently invents what the candidate said would be worse than
 * having no voice feature at all.
 */

export const STT_UNAVAILABLE_MESSAGE =
  "Voice input is not configured on this deployment. Set VOICE_STT_PROVIDER and VOICE_STT_API_KEY to enable it. Text interviews work without it.";

export const TTS_UNAVAILABLE_MESSAGE =
  "Spoken questions are not configured on this deployment. Set VOICE_TTS_PROVIDER and VOICE_TTS_API_KEY to enable them. Text interviews work without it.";

let sttCache: SpeechToTextProvider | null = null;
let ttsCache: TextToSpeechProvider | null = null;

export function sttAvailable(): boolean {
  const provider = env.voice.sttProvider;
  if (provider === "deepgram" || provider === "whisper") {
    return Boolean(env.voice.sttApiKey);
  }
  return false;
}

export function ttsAvailable(): boolean {
  return env.voice.ttsProvider === "elevenlabs"
    ? Boolean(env.voice.ttsApiKey)
    : false;
}

export function getSttProvider(): SpeechToTextProvider {
  if (sttCache) return sttCache;
  if (!sttAvailable()) {
    throw new ServiceUnavailableError(STT_UNAVAILABLE_MESSAGE, "stt_not_configured");
  }

  switch (env.voice.sttProvider) {
    case "deepgram":
      sttCache = new DeepgramSttProvider(env.voice.sttApiKey);
      return sttCache;
    case "whisper":
      sttCache = new WhisperSttProvider(
        env.voice.sttApiKey,
        env.voice.sttBaseUrl || undefined,
      );
      return sttCache;
    default:
      throw new ServiceUnavailableError(
        STT_UNAVAILABLE_MESSAGE,
        "stt_not_configured",
      );
  }
}

export function getTtsProvider(): TextToSpeechProvider {
  if (ttsCache) return ttsCache;
  if (!ttsAvailable()) {
    throw new ServiceUnavailableError(TTS_UNAVAILABLE_MESSAGE, "tts_not_configured");
  }

  switch (env.voice.ttsProvider) {
    case "elevenlabs":
      ttsCache = new ElevenLabsTtsProvider(env.voice.ttsApiKey);
      return ttsCache;
    default:
      throw new ServiceUnavailableError(
        TTS_UNAVAILABLE_MESSAGE,
        "tts_not_configured",
      );
  }
}

/**
 * Validates an uploaded recording before it reaches a provider.
 * Same posture as the resume uploader: never trust client-declared metadata.
 */
export async function validateAudioUpload(
  file: File,
): Promise<{ buffer: Buffer; mimeType: string }> {
  if (file.size === 0) {
    throw new ValidationError("That recording is empty.");
  }
  if (file.size > MAX_AUDIO_BYTES) {
    throw new ValidationError("Recordings must be smaller than 15 MB.");
  }

  const declared = (file.type || "").split(";")[0].trim().toLowerCase();
  if (
    !ALLOWED_AUDIO_TYPES.includes(declared as (typeof ALLOWED_AUDIO_TYPES)[number])
  ) {
    throw new ValidationError(
      "That audio format is not supported. Record in WebM, OGG, MP3, MP4 or WAV.",
    );
  }

  return {
    buffer: Buffer.from(await file.arrayBuffer()),
    mimeType: declared,
  };
}

/** Test seams. */
export function __setSttProvider(provider: SpeechToTextProvider | null): void {
  sttCache = provider;
}
export function __setTtsProvider(provider: TextToSpeechProvider | null): void {
  ttsCache = provider;
}

export type {
  SpeechToTextProvider,
  TextToSpeechProvider,
  TranscriptionResult,
} from "./types";
