/**
 * Voice provider contracts.
 *
 * Mirrors the `AIService` / `CodeExecutionProvider` pattern: the UI depends on
 * these interfaces, never on a vendor SDK. Swapping Deepgram for Whisper or
 * ElevenLabs for Azure means writing one class and adding one registry line.
 *
 * Critically, when no provider is configured the app must degrade honestly —
 * text interviews keep working and the voice UI says the feature is
 * unavailable. It must never fabricate a transcript.
 */

export type TranscriptionRequest = {
  audio: Buffer;
  mimeType: string;
  /** BCP-47 hint, e.g. "en-IN". */
  languageHint?: string;
};

export type TranscriptionWord = {
  word: string;
  startSec: number;
  endSec: number;
};

export type TranscriptionResult = {
  text: string;
  /** Total audio duration in seconds, when the provider reports it. */
  durationSec: number | null;
  /** Word timings — required for pace and pause metrics. */
  words: TranscriptionWord[];
  /** Provider confidence 0-1, when reported. */
  confidence: number | null;
};

export interface SpeechToTextProvider {
  readonly name: string;
  readonly available: boolean;
  transcribe(request: TranscriptionRequest): Promise<TranscriptionResult>;
}

export type SpeechRequest = {
  text: string;
  /** Provider-specific voice id. */
  voice?: string;
  /** 0.5-2.0 where 1 is normal. */
  speed?: number;
};

export type SpeechResult = {
  audio: Buffer;
  mimeType: string;
};

export interface TextToSpeechProvider {
  readonly name: string;
  readonly available: boolean;
  speak(request: SpeechRequest): Promise<SpeechResult>;
}

/** Upload limits enforced before a byte reaches a provider. */
export const MAX_AUDIO_BYTES = 15 * 1024 * 1024;
export const ALLOWED_AUDIO_TYPES = [
  "audio/webm",
  "audio/ogg",
  "audio/mpeg",
  "audio/mp4",
  "audio/wav",
  "audio/x-wav",
] as const;
