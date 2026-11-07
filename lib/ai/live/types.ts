/**
 * Shared types for the realtime (Gemini Live) interview.
 *
 * Kept free of both the SDK and React so the same vocabulary is used by the
 * server route that mints tokens, the browser session client, and the pure
 * state machine that the tests drive.
 */

import type { InterviewPlanInput } from "@/lib/ai/live/orchestrator-types";

/**
 * Session lifecycle.
 *
 * Deliberately explicit rather than a set of booleans: "is the AI speaking AND
 * are we reconnecting AND is the mic muted" is exactly the combination that
 * produces contradictory UI, so the room renders from one value.
 */
export type LivePhase =
  | "IDLE"
  | "REQUESTING_PERMISSIONS"
  | "CONNECTING"
  | "READY"
  | "AI_SPEAKING"
  | "LISTENING"
  | "CANDIDATE_SPEAKING"
  | "PROCESSING"
  | "RECONNECTING"
  | "PAUSED"
  | "COMPLETED"
  | "FAILED";

/** Which media the candidate granted. */
export type MediaPermission = "unknown" | "granted" | "denied" | "unavailable";

export type MediaState = {
  camera: MediaPermission;
  microphone: MediaPermission;
  /** Candidate muted themselves — distinct from the browser denying access. */
  micMuted: boolean;
  cameraOff: boolean;
};

export type ConnectionState =
  | "offline"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "closed";

/** One finalized piece of dialogue. Interim text is never persisted. */
export type TranscriptSegment = {
  id: string;
  speaker: "AI" | "CANDIDATE";
  text: string;
  /** Milliseconds since the session started. */
  atMs: number;
  /** True while the model is still revising this text. */
  interim: boolean;
};

/** Everything the room renders from. */
export type LiveSessionState = {
  phase: LivePhase;
  connection: ConnectionState;
  media: MediaState;
  /** Finalized + current interim segments, in order. */
  transcript: TranscriptSegment[];
  /** Times the candidate spoke over the AI. */
  interruptions: number;
  /** Turns completed, used for progress against plannedQuestions. */
  turnsCompleted: number;
  startedAtMs: number | null;
  /** User-safe error, already classified. Never a stack trace. */
  error: string | null;
  /**
   * A device disappeared mid-interview.
   *
   * Separate from `error` because it is recoverable and must not read as a
   * failed session: a camera unplugged at minute nine is worth saying out
   * loud, but the interview carries on.
   */
  deviceNotice: string | null;
};

export const INITIAL_LIVE_STATE: LiveSessionState = {
  phase: "IDLE",
  connection: "offline",
  media: {
    camera: "unknown",
    microphone: "unknown",
    micMuted: false,
    cameraOff: false,
  },
  transcript: [],
  interruptions: 0,
  turnsCompleted: 0,
  startedAtMs: null,
  error: null,
  deviceNotice: null,
};

/**
 * Events the state machine understands.
 *
 * Sourced from three places: the browser (permissions, control clicks), the
 * Live socket (server messages), and the transport (connect/close). Modelling
 * them as one union is what makes the reducer exhaustively testable.
 */
export type LiveEvent =
  | { type: "PERMISSIONS_REQUESTED" }
  | { type: "PERMISSIONS_RESULT"; camera: MediaPermission; microphone: MediaPermission }
  | { type: "CONNECT_STARTED" }
  | { type: "CONNECTED"; atMs: number }
  | { type: "SETUP_COMPLETE" }
  | { type: "AI_TURN_STARTED" }
  | { type: "AI_TURN_COMPLETE" }
  | { type: "CANDIDATE_SPEECH_STARTED" }
  | { type: "CANDIDATE_SPEECH_ENDED" }
  /**
   * The candidate stopped, but has not actually answered — "um…", "let me
   * think". The floor stays theirs and the interviewer keeps waiting.
   */
  | { type: "AWAITING_CANDIDATE" }
  | { type: "INTERRUPTED" }
  | { type: "TRANSCRIPT"; speaker: "AI" | "CANDIDATE"; text: string; atMs: number; interim: boolean }
  | { type: "DEVICE_LOST"; device: "camera" | "microphone" }
  | { type: "DEVICE_RESTORED"; device: "camera" | "microphone" }
  | { type: "TOGGLE_MIC"; muted: boolean }
  | { type: "TOGGLE_CAMERA"; off: boolean }
  | { type: "PAUSE" }
  | { type: "RESUME" }
  | { type: "RECONNECTING" }
  | { type: "RECONNECTED" }
  | { type: "COMPLETED" }
  | { type: "ERROR"; message: string }
  /**
   * The candidate asked to try again after a failed session.
   *
   * Needed as its own event because FAILED is terminal: without a way out of
   * it, the "You can retry" the connect error promises has nothing to act on,
   * and the room's only exit is the text interview.
   */
  | { type: "RETRY" };

/** What the browser needs to open its own Live socket. Never the real key. */
export type LiveSessionGrant = {
  /** Ephemeral token name, usable once, expiring shortly. */
  token: string;
  model: string;
  expiresAt: string;
  interviewId: string;
  /** Rendered system instruction — built server-side from real user data. */
  systemInstruction: string;
  voiceName: string;
  /**
   * When the candidate actually joined the live room, ISO.
   *
   * The interview clock's anchor. Persisted on the first grant so it survives
   * a refresh, and deliberately not `Interview.startedAt` — that is when the
   * row was created, which can be hours earlier.
   */
  liveStartedAt: string;
  /** How the interviewer presents itself in the room. */
  interviewerName: string;
  interviewerTitle: string;
  /** Turn-detection tuning, chosen per persona. */
  silenceDurationMs: number;
  prefixPaddingMs: number;
  /**
   * Everything the orchestrator needs to build its topic plan.
   *
   * Assembled server-side from the user's real resume claims, JD skills and
   * measured weak areas, so the client cannot invent grounding it was not
   * given.
   */
  planInput: InterviewPlanInput;
};
