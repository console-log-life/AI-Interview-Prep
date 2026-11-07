import {
  INITIAL_LIVE_STATE,
  type LiveEvent,
  type LiveSessionState,
  type TranscriptSegment,
} from "@/lib/ai/live/types";

/**
 * The live-interview state machine — pure, no SDK, no React, no I/O.
 *
 * Realtime voice has genuinely concurrent inputs: the socket says the model
 * started speaking at the same moment the microphone says the candidate did.
 * Scattering that across component state produces the classic bugs — an
 * "AI speaking" indicator that never clears, a barge-in that is counted twice,
 * a reconnect that resets the transcript. One reducer with one set of rules
 * makes those cases testable without a browser or a network.
 */

/** Phases where the socket is live and the candidate can be heard. */
const ACTIVE_PHASES: ReadonlySet<LiveSessionState["phase"]> = new Set([
  "READY",
  "AI_SPEAKING",
  "LISTENING",
  "CANDIDATE_SPEAKING",
  "PROCESSING",
]);

/** Phases after which nothing but a fresh session should change anything. */
const TERMINAL_PHASES: ReadonlySet<LiveSessionState["phase"]> = new Set([
  "COMPLETED",
  "FAILED",
]);

export function isActive(state: LiveSessionState): boolean {
  return ACTIVE_PHASES.has(state.phase);
}

export function isTerminal(state: LiveSessionState): boolean {
  return TERMINAL_PHASES.has(state.phase);
}

/** Can the candidate's audio reach the model right now? */
export function micIsLive(state: LiveSessionState): boolean {
  return (
    isActive(state) &&
    state.media.microphone === "granted" &&
    !state.media.micMuted
  );
}

export function liveReducer(
  state: LiveSessionState,
  event: LiveEvent,
): LiveSessionState {
  // Once completed or failed, only an explicit new session moves us. Late
  // socket messages arriving after "End interview" must not resurrect the UI.
  if (isTerminal(state) && event.type !== "ERROR") return state;

  switch (event.type) {
    case "PERMISSIONS_REQUESTED":
      return { ...state, phase: "REQUESTING_PERMISSIONS", error: null };

    case "PERMISSIONS_RESULT": {
      const media = {
        ...state.media,
        camera: event.camera,
        microphone: event.microphone,
      };
      // A missing microphone is fatal for a voice interview; a missing camera
      // is not, because audio-only is a supported mode.
      if (event.microphone !== "granted") {
        return {
          ...state,
          media,
          phase: "FAILED",
          error:
            "A microphone is required for a voice interview. You can still use the text interview.",
        };
      }
      return { ...state, media, phase: "IDLE", error: null };
    }

    case "CONNECT_STARTED":
      return { ...state, phase: "CONNECTING", connection: "connecting", error: null };

    case "CONNECTED":
      return {
        ...state,
        connection: "connected",
        // Keep whatever start time we already had: a reconnect must not
        // restart the interview clock.
        startedAtMs: state.startedAtMs ?? event.atMs,
      };

    case "SETUP_COMPLETE":
      return { ...state, phase: "READY", connection: "connected", error: null };

    case "AI_TURN_STARTED":
      // Idempotent: audio arrives as many inline parts per turn, and each one
      // signals the same thing. Returning the same object keeps the whole
      // audio path off the render loop.
      return state.phase === "AI_SPEAKING" ? state : { ...state, phase: "AI_SPEAKING" };

    /**
     * Playback stopped.
     *
     * Only a turn the AI actually held can complete. This is driven by the
     * audio graph going quiet, which also happens when the queue is *flushed*
     * — on barge-in, and when a dropped connection discards the dead session's
     * audio. Unguarded, that flush reported a completed turn: it moved the
     * room to LISTENING on top of RECONNECTING, so a dead socket displayed as
     * a working interview, overwrote CANDIDATE_SPEAKING mid-barge-in, and
     * inflated the turn count that drives progress.
     */
    case "AI_TURN_COMPLETE":
      return state.phase === "AI_SPEAKING"
        ? { ...state, phase: "LISTENING", turnsCompleted: state.turnsCompleted + 1 }
        : state;

    case "CANDIDATE_SPEECH_STARTED":
      return { ...state, phase: "CANDIDATE_SPEAKING" };

    case "CANDIDATE_SPEECH_ENDED":
      // The model now has the turn; it is thinking, not yet speaking.
      return { ...state, phase: "PROCESSING" };

    /**
     * The pause was a hesitation, not an answer.
     *
     * The room had already moved to "Thinking — reviewing your response",
     * which is false and, worse, self-fulfilling: a candidate who sees the
     * interviewer take the floor stops talking. The floor is still theirs.
     */
    case "AWAITING_CANDIDATE":
      return state.phase === "PROCESSING" ? { ...state, phase: "LISTENING" } : state;

    case "INTERRUPTED":
      // Only count it as a barge-in if the AI actually held the floor.
      // The server can emit `interrupted` on a turn we already ended.
      return state.phase === "AI_SPEAKING"
        ? {
            ...state,
            phase: "CANDIDATE_SPEAKING",
            interruptions: state.interruptions + 1,
          }
        : state;

    case "TRANSCRIPT":
      return { ...state, transcript: mergeTranscript(state.transcript, event) };

    /**
     * A device vanished — unplugged, or claimed by another application.
     *
     * The session is deliberately kept alive. Tearing it down would lose the
     * transcript and the candidate's place over something that is often
     * momentary, and a voice interview survives a lost camera entirely.
     */
    case "DEVICE_LOST":
      return {
        ...state,
        media: {
          ...state.media,
          [event.device]: "unavailable",
        },
        deviceNotice:
          event.device === "camera"
            ? "Your camera connection was lost. The interview is continuing in audio."
            : "Your microphone is no longer available. Reconnect it, or end the interview to keep your report.",
      };

    case "DEVICE_RESTORED":
      return {
        ...state,
        media: { ...state.media, [event.device]: "granted" },
        deviceNotice: null,
      };

    case "TOGGLE_MIC":
      return { ...state, media: { ...state.media, micMuted: event.muted } };

    case "TOGGLE_CAMERA":
      return { ...state, media: { ...state.media, cameraOff: event.off } };

    case "PAUSE":
      return isActive(state) ? { ...state, phase: "PAUSED" } : state;

    case "RESUME":
      return state.phase === "PAUSED" ? { ...state, phase: "LISTENING" } : state;

    case "RECONNECTING":
      return { ...state, phase: "RECONNECTING", connection: "reconnecting" };

    case "RECONNECTED":
      return { ...state, phase: "LISTENING", connection: "connected", error: null };

    case "COMPLETED":
      return { ...state, phase: "COMPLETED", connection: "closed" };

    case "ERROR":
      return {
        ...state,
        phase: "FAILED",
        connection: "closed",
        error: event.message,
      };

    default: {
      // Exhaustiveness: adding an event without handling it fails to compile.
      const exhaustive: never = event;
      return exhaustive;
    }
  }
}

/**
 * Folds a transcript chunk into the list.
 *
 * The Live API streams a speaker's text as a growing series of interim
 * updates, then a final. Appending each one produces a wall of duplicated
 * fragments, so an interim update replaces the trailing interim segment from
 * the same speaker, and a final promotes it in place.
 */
function mergeTranscript(
  transcript: TranscriptSegment[],
  event: Extract<LiveEvent, { type: "TRANSCRIPT" }>,
): TranscriptSegment[] {
  const text = event.text;
  if (!text) return transcript;

  const last = transcript[transcript.length - 1];
  const continuesLast = last && last.speaker === event.speaker && last.interim;

  if (continuesLast) {
    const updated = [...transcript];
    updated[updated.length - 1] = {
      ...last,
      // Live transcription resends the whole utterance, so replace rather
      // than concatenate or the text doubles on every tick.
      text,
      interim: event.interim,
    };
    return updated;
  }

  return [
    ...transcript,
    {
      id: `${event.speaker}-${event.atMs}-${transcript.length}`,
      speaker: event.speaker,
      text,
      atMs: event.atMs,
      interim: event.interim,
    },
  ];
}

/** Only finalized dialogue is worth persisting or evaluating. */
export function finalizedTurns(state: LiveSessionState): TranscriptSegment[] {
  return state.transcript.filter(
    (segment) => !segment.interim && segment.text.trim().length > 0,
  );
}

export function createLiveState(
  overrides: Partial<LiveSessionState> = {},
): LiveSessionState {
  return { ...INITIAL_LIVE_STATE, ...overrides };
}
