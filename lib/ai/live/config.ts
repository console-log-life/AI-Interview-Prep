import type { InterviewerPersona } from "@prisma/client";

/**
 * Live-session configuration.
 *
 * Pure and SDK-free so the tuning decisions can be unit-tested and reviewed
 * without opening a socket.
 */

/**
 * Default Live model.
 *
 * Chosen by querying the models endpoint for this project's key and filtering
 * on `bidiGenerateContent` support, rather than copying an id from docs that
 * may have moved. At the time of writing the key could reach:
 *
 *   gemini-2.5-flash-native-audio-latest          ← default
 *   gemini-2.5-flash-native-audio-preview-09-2025
 *   gemini-2.5-flash-native-audio-preview-12-2025
 *   gemini-3.1-flash-live-preview
 *   gemini-3.5-live-translate-preview   (translation-specific)
 *   gemini-robotics-er-2-streaming-preview (robotics-specific)
 *
 * The `-latest` alias is preferred over a dated preview so Google can retire a
 * snapshot without breaking this deployment. Override with AI_LIVE_MODEL.
 */
export const DEFAULT_LIVE_MODEL = "gemini-2.5-flash-native-audio-latest";

/**
 * Audio formats the Live API expects.
 *
 * Input must be raw 16-bit PCM at 16 kHz mono; output arrives as 24 kHz PCM.
 * These are not adjustable — they are the wire format — so they live here as
 * named constants rather than magic numbers scattered through the worklet.
 */
export const INPUT_SAMPLE_RATE = 16_000;
export const OUTPUT_SAMPLE_RATE = 24_000;
export const INPUT_MIME_TYPE = `audio/pcm;rate=${INPUT_SAMPLE_RATE}`;

/**
 * Audio chunk size, in samples.
 *
 * 2048 frames at 16 kHz is 128 ms per message. Smaller chunks cut latency but
 * multiply WebSocket overhead; larger ones make barge-in feel sluggish because
 * the model hears the candidate later. 128 ms keeps interruption responsive
 * while staying well under the rate at which the socket becomes the bottleneck.
 */
export const AUDIO_CHUNK_SAMPLES = 2048;

/**
 * No video is sent upstream, deliberately.
 *
 * The camera is analysed in the browser instead — see `lib/ai/live/vision.ts`
 * — which keeps the frames on the candidate's machine, costs no quota, and
 * lets the device check promise plainly that nothing visual is uploaded. The
 * interviewer's questions come from what the candidate *says*; the camera
 * informs the presentation feedback afterwards.
 */

/**
 * Transcript stabilization, measured against the real Live API.
 *
 * The API sends input transcription as *delta fragments* (" I", " AM", " SO",
 * "FTWA", …) and never sets `finished`, and — this is the part that shapes the
 * whole lifecycle — the tail of an utterance is only flushed when the client
 * sends `activityEnd`. Waiting without sending it does nothing: in one measured
 * run, fragments stalled with four words outstanding and stayed stalled for 8.3
 * seconds until `activityEnd` was sent, at which point the remainder arrived
 * 944 ms later.
 *
 * So completion cannot be detected from a flag. It is inferred from the
 * transcript going quiet.
 *
 * `TRANSCRIPT_STABLE_MS` — no new fragment for this long means the utterance is
 * done. It must exceed the longest pause turn detection tolerates
 * (`silenceMs`, 1800 ms by default): transcription arrives with the same
 * temporal shape as the speech, so a candidate's 1 s thinking pause reappears
 * as a ~1085 ms hole in the fragment stream — measured — and a shorter window
 * finalizes inside it and loses the rest of the answer. That failure was
 * reproduced: "I would use PostgreSQL. We need" with the final clause missing.
 * This is a fallback; `serverTurnComplete` normally finalizes far sooner.
 *
 * `TRANSCRIPT_MAX_WAIT_MS` — hard ceiling, so a transcription that never
 * stabilizes cannot hang the interview. Raised from 4 s after a measured run
 * hit the cap at 4016 ms with the tail still arriving 3237 ms after the flush;
 * that answer survived only because the cap happened to fall after the last
 * fragment. 6 s covers it with margin and still fails fast enough to read as a
 * pause rather than a fault.
 */
export const TRANSCRIPT_STABLE_MS = 2500;
/**
 * Minimum wait for the flush to deliver the tail.
 *
 * Measured delays between `activityEnd` and the final fragment: 514ms, 779ms,
 * 944ms, 1922ms. 2200ms clears the worst of those. It is the floor on how long
 * the candidate waits before the interviewer replies, which is why it is not
 * set higher "to be safe" — every extra 100ms here is dead air in the room.
 */
export const TRANSCRIPT_POST_FLUSH_GRACE_MS = 2200;
export const TRANSCRIPT_MAX_WAIT_MS = 7000;
export const TRANSCRIPT_POLL_MS = 50;

/**
 * How long the interviewer keeps waiting after a turn of pure hesitation.
 *
 * "Um..." is not an answer, so the floor stays with the candidate and the
 * model stays silent rather than replying to a filled pause. That silence
 * cannot be unbounded - if the candidate never resumes the interview would
 * hang - so the turn is released after this and the interviewer responds as it
 * would to any silence.
 *
 * Generous on purpose: someone who has just said "let me think" is, by their
 * own account, thinking.
 */
export const HESITATION_GRACE_MS = 8000;

/**
 * Audio held back before the turn opens.
 *
 * With manual activity detection, audio sent outside an activity window is not
 * part of any turn — it is discarded. The detector needs `minSpeechMs` of sound
 * before it will open one, so those first frames are the candidate's opening
 * syllable and must be replayed once the window opens. This is the equivalent
 * of the server VAD's `prefixPaddingMs`, which we no longer get for free.
 */
export const PRE_ROLL_MS = 320;

export type PersonaTuning = {
  /**
   * How the interviewer introduces itself on screen.
   *
   * Configuration rather than copy baked into a component, so a deployment can
   * change who the candidate appears to be meeting without touching the room.
   * Deliberately a plain first name and an honest job title: the candidate is
   * told it is an AI, and a surname or a photo would push a professional tool
   * toward impersonating a person who does not exist.
   */
  displayName: string;
  /** Role shown beneath the name. */
  title: string;
  /** Prebuilt Live voice name. */
  voiceName: string;
  /**
   * Silence before the model treats the answer as finished.
   *
   * This is the single most consequential number in the whole feature. The
   * API's default is tuned for chat, where ~500 ms of quiet means "your turn".
   * Technical interview answers contain real thinking pauses — someone
   * recalling the four Coffman conditions will stop for a second mid-sentence
   * — and cutting them off there is the fastest way to make the product feel
   * hostile. Every persona therefore waits appreciably longer than chat
   * default, and the strict/FAANG personas only slightly less than the others.
   */
  silenceDurationMs: number;
  /** Speech required before a start-of-speech is committed; filters coughs. */
  prefixPaddingMs: number;
  /** Whether the persona talks over a rambling candidate. */
  interruptsCandidate: boolean;
};

/**
 * Per-persona behaviour.
 *
 * The differences are behavioural, not cosmetic: a different voice, a
 * different patience threshold for silence, and a different follow-up posture
 * expressed in the prompt. A persona that only changed its name would be
 * decoration.
 */
export const PERSONA_TUNING: Record<InterviewerPersona, PersonaTuning> = {
  FRIENDLY: {
    displayName: "Sam",
    title: "AI Interviewer",
    voiceName: "Aoede",
    // Most patient: a warm recruiter lets a nervous candidate find the words.
    silenceDurationMs: 3000,
    prefixPaddingMs: 300,
    interruptsCandidate: false,
  },
  PROFESSIONAL: {
    displayName: "Alex",
    title: "AI Technical Interviewer",
    voiceName: "Charon",
    silenceDurationMs: 2500,
    prefixPaddingMs: 250,
    interruptsCandidate: false,
  },
  STRICT: {
    displayName: "Jordan",
    title: "AI Senior Engineer",
    voiceName: "Fenrir",
    silenceDurationMs: 2300,
    prefixPaddingMs: 200,
    interruptsCandidate: true,
  },
  STRESS: {
    displayName: "Riley",
    title: "AI Panel Interviewer",
    // Fast-paced, but still above the 2s floor. A persona that clips normal
    // thinking pauses is not applying pressure, it is broken — measured
    // splitting a single answer in two at 1.8s.
    voiceName: "Puck",
    silenceDurationMs: 2200,
    prefixPaddingMs: 200,
    interruptsCandidate: true,
  },
};

export function tuningFor(persona: InterviewerPersona): PersonaTuning {
  return PERSONA_TUNING[persona] ?? PERSONA_TUNING.PROFESSIONAL;
}

/** Lower bound enforced regardless of persona or future edits. */
/**
 * Absolute floor, regardless of persona or future edits.
 *
 * Set above the 2s thinking pause that was measured splitting an answer into
 * two. No persona may go below it.
 */
export const MIN_SILENCE_DURATION_MS = 2200;

export function safeSilenceDuration(ms: number): number {
  return Math.max(MIN_SILENCE_DURATION_MS, Math.min(5000, ms));
}
