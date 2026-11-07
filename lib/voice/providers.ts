import "server-only";

import { AppError } from "@/lib/api/errors";
import type {
  SpeechRequest,
  SpeechResult,
  SpeechToTextProvider,
  TextToSpeechProvider,
  TranscriptionRequest,
  TranscriptionResult,
} from "./types";

/**
 * Concrete voice providers.
 *
 * Both are thin HTTP clients — no vendor SDK is added as a dependency, which
 * keeps the bundle small and the swap cost low.
 */

/**
 * Deepgram speech-to-text.
 * Chosen as the reference implementation because it returns word-level
 * timings, which the pause metrics genuinely require.
 */
export class DeepgramSttProvider implements SpeechToTextProvider {
  readonly name = "deepgram";
  readonly available: boolean;

  private readonly apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
    this.available = Boolean(apiKey);
  }

  async transcribe(request: TranscriptionRequest): Promise<TranscriptionResult> {
    const params = new URLSearchParams({
      model: "nova-2",
      smart_format: "true",
      punctuate: "true",
      language: request.languageHint ?? "en",
    });

    let response: Response;
    try {
      response = await fetch(
        `https://api.deepgram.com/v1/listen?${params.toString()}`,
        {
          method: "POST",
          headers: {
            Authorization: `Token ${this.apiKey}`,
            "Content-Type": request.mimeType,
          },
          body: new Uint8Array(request.audio),
          signal: AbortSignal.timeout(120_000),
        },
      );
    } catch (error) {
      console.error("[voice/stt] request failed:", error);
      throw new AppError(
        "We could not reach the speech service. Please try again.",
        { status: 502, code: "stt_unavailable" },
      );
    }

    if (!response.ok) {
      console.error("[voice/stt] non-OK:", response.status);
      throw new AppError(
        "The speech service could not process that recording.",
        { status: 502, code: "stt_failed" },
      );
    }

    const data = (await response.json()) as {
      results?: {
        channels?: Array<{
          alternatives?: Array<{
            transcript?: string;
            confidence?: number;
            words?: Array<{ word: string; start: number; end: number }>;
          }>;
        }>;
      };
      metadata?: { duration?: number };
    };

    const alternative = data.results?.channels?.[0]?.alternatives?.[0];
    if (!alternative?.transcript) {
      throw new AppError(
        "We couldn't hear anything in that recording. Please try again.",
        { status: 422, code: "stt_empty" },
      );
    }

    return {
      text: alternative.transcript,
      durationSec: data.metadata?.duration ?? null,
      words: (alternative.words ?? []).map((word) => ({
        word: word.word,
        startSec: word.start,
        endSec: word.end,
      })),
      confidence: alternative.confidence ?? null,
    };
  }
}

/** OpenAI-compatible Whisper endpoint (OpenAI, Groq, or self-hosted). */
export class WhisperSttProvider implements SpeechToTextProvider {
  readonly name = "whisper";
  readonly available: boolean;

  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(apiKey: string, baseUrl = "https://api.openai.com/v1") {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.available = Boolean(apiKey);
  }

  async transcribe(request: TranscriptionRequest): Promise<TranscriptionResult> {
    const form = new FormData();
    form.append(
      "file",
      new Blob([new Uint8Array(request.audio)], { type: request.mimeType }),
      "audio.webm",
    );
    form.append("model", "whisper-1");
    form.append("response_format", "verbose_json");

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/audio/transcriptions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${this.apiKey}` },
        body: form,
        signal: AbortSignal.timeout(120_000),
      });
    } catch (error) {
      console.error("[voice/stt] request failed:", error);
      throw new AppError(
        "We could not reach the speech service. Please try again.",
        { status: 502, code: "stt_unavailable" },
      );
    }

    if (!response.ok) {
      throw new AppError(
        "The speech service could not process that recording.",
        { status: 502, code: "stt_failed" },
      );
    }

    const data = (await response.json()) as {
      text?: string;
      duration?: number;
    };

    if (!data.text?.trim()) {
      throw new AppError(
        "We couldn't hear anything in that recording. Please try again.",
        { status: 422, code: "stt_empty" },
      );
    }

    return {
      text: data.text,
      durationSec: data.duration ?? null,
      // Whisper's default response has no word timings, so pause metrics are
      // correctly reported as unavailable rather than estimated.
      words: [],
      confidence: null,
    };
  }
}

/** ElevenLabs text-to-speech. */
export class ElevenLabsTtsProvider implements TextToSpeechProvider {
  readonly name = "elevenlabs";
  readonly available: boolean;

  private readonly apiKey: string;
  private readonly defaultVoice: string;

  constructor(apiKey: string, defaultVoice = "21m00Tcm4TlvDq8ikWAM") {
    this.apiKey = apiKey;
    this.defaultVoice = defaultVoice;
    this.available = Boolean(apiKey);
  }

  async speak(request: SpeechRequest): Promise<SpeechResult> {
    const voice = request.voice || this.defaultVoice;

    let response: Response;
    try {
      response = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${voice}`,
        {
          method: "POST",
          headers: {
            "xi-api-key": this.apiKey,
            "Content-Type": "application/json",
            Accept: "audio/mpeg",
          },
          body: JSON.stringify({
            // Cap length so a runaway question cannot generate minutes of audio.
            text: request.text.slice(0, 2500),
            model_id: "eleven_turbo_v2_5",
            voice_settings: { stability: 0.5, similarity_boost: 0.7 },
          }),
          signal: AbortSignal.timeout(60_000),
        },
      );
    } catch (error) {
      console.error("[voice/tts] request failed:", error);
      throw new AppError("We could not reach the speech service.", {
        status: 502,
        code: "tts_unavailable",
      });
    }

    if (!response.ok) {
      throw new AppError("The speech service could not generate audio.", {
        status: 502,
        code: "tts_failed",
      });
    }

    return {
      audio: Buffer.from(await response.arrayBuffer()),
      mimeType: "audio/mpeg",
    };
  }
}
