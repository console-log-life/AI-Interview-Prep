import { describe, expect, it } from "vitest";

import {
  MIN_SILENCE_DURATION_MS,
  PERSONA_TUNING,
  safeSilenceDuration,
  tuningFor,
} from "@/lib/ai/live/config";
import {
  createLiveState,
  finalizedTurns,
  isActive,
  isTerminal,
  liveReducer,
  micIsLive,
} from "@/lib/ai/live/session";
import type { LiveEvent, LiveSessionState } from "@/lib/ai/live/types";

/**
 * The live state machine.
 *
 * Realtime voice has genuinely concurrent inputs, and the failures are all
 * ordering bugs: an indicator that never clears, a barge-in counted twice, a
 * reconnect that wipes the transcript. None of that needs a browser to test —
 * it needs a reducer and a sequence of events.
 */

function run(events: LiveEvent[], from?: Partial<LiveSessionState>) {
  return events.reduce(liveReducer, createLiveState(from));
}

const GRANTED = {
  type: "PERMISSIONS_RESULT" as const,
  camera: "granted" as const,
  microphone: "granted" as const,
};

/** Gets a session to the point where the socket is live. */
const CONNECTED: LiveEvent[] = [
  { type: "PERMISSIONS_REQUESTED" },
  GRANTED,
  { type: "CONNECT_STARTED" },
  { type: "CONNECTED", atMs: 1000 },
  { type: "SETUP_COMPLETE" },
];

describe("permissions", () => {
  it("starts idle with nothing granted", () => {
    const state = createLiveState();
    expect(state.phase).toBe("IDLE");
    expect(state.media.microphone).toBe("unknown");
  });

  it("fails the session when the microphone is denied", () => {
    const state = run([
      { type: "PERMISSIONS_REQUESTED" },
      { type: "PERMISSIONS_RESULT", camera: "granted", microphone: "denied" },
    ]);
    expect(state.phase).toBe("FAILED");
    expect(state.error).toMatch(/microphone is required/i);
    // The user must be pointed at something that still works.
    expect(state.error).toMatch(/text interview/i);
  });

  it("allows the interview to proceed without a camera", () => {
    // Audio-only is a supported mode; a missing camera must not be fatal.
    const state = run([
      { type: "PERMISSIONS_REQUESTED" },
      { type: "PERMISSIONS_RESULT", camera: "denied", microphone: "granted" },
    ]);
    expect(state.phase).toBe("IDLE");
    expect(state.error).toBeNull();
  });

  it("treats an absent camera device the same as a denied one", () => {
    const state = run([
      { type: "PERMISSIONS_REQUESTED" },
      { type: "PERMISSIONS_RESULT", camera: "unavailable", microphone: "granted" },
    ]);
    expect(state.phase).toBe("IDLE");
  });
});

describe("connection lifecycle", () => {
  it("reaches READY only after setup completes", () => {
    const beforeSetup = run(CONNECTED.slice(0, 4));
    expect(beforeSetup.phase).not.toBe("READY");

    const ready = run(CONNECTED);
    expect(ready.phase).toBe("READY");
    expect(ready.connection).toBe("connected");
  });

  it("records the session start time once", () => {
    const state = run([
      ...CONNECTED,
      { type: "CONNECTED", atMs: 99_000 },
    ]);
    // A reconnect must not restart the interview clock.
    expect(state.startedAtMs).toBe(1000);
  });
});

describe("turn taking", () => {
  it("moves through the speaking cycle", () => {
    let state = run(CONNECTED);

    state = liveReducer(state, { type: "AI_TURN_STARTED" });
    expect(state.phase).toBe("AI_SPEAKING");

    state = liveReducer(state, { type: "AI_TURN_COMPLETE" });
    expect(state.phase).toBe("LISTENING");
    expect(state.turnsCompleted).toBe(1);

    state = liveReducer(state, { type: "CANDIDATE_SPEECH_STARTED" });
    expect(state.phase).toBe("CANDIDATE_SPEAKING");

    state = liveReducer(state, { type: "CANDIDATE_SPEECH_ENDED" });
    expect(state.phase).toBe("PROCESSING");
  });

  it("counts turns for progress", () => {
    let state = run(CONNECTED);
    for (let i = 0; i < 3; i += 1) {
      state = liveReducer(state, { type: "AI_TURN_STARTED" });
      state = liveReducer(state, { type: "AI_TURN_COMPLETE" });
    }
    expect(state.turnsCompleted).toBe(3);
  });

  /**
   * `AI_TURN_COMPLETE` is driven by the audio graph going quiet, which also
   * happens when the queue is *flushed* — on barge-in, and when a dropped
   * connection discards the dead session's audio. Only a turn the AI actually
   * held can complete.
   */
  it("does not report a completed turn when a reconnect flushes the audio queue", () => {
    let state = run(CONNECTED);
    state = liveReducer(state, { type: "AI_TURN_STARTED" });
    state = liveReducer(state, { type: "RECONNECTING" });

    // The flush stops playback, which looks exactly like the turn ending.
    state = liveReducer(state, { type: "AI_TURN_COMPLETE" });

    // A dead socket must not display as a working interview.
    expect(state.phase).toBe("RECONNECTING");
    expect(state.turnsCompleted).toBe(0);
  });

  it("does not take the floor back from a candidate who barged in", () => {
    let state = run(CONNECTED);
    state = liveReducer(state, { type: "AI_TURN_STARTED" });
    state = liveReducer(state, { type: "INTERRUPTED" });
    state = liveReducer(state, { type: "AI_TURN_COMPLETE" });

    expect(state.phase).toBe("CANDIDATE_SPEAKING");
    expect(state.turnsCompleted).toBe(0);
  });

  it("treats repeated audio parts as one turn", () => {
    // Audio arrives as many inline parts, each signalling the same thing.
    const speaking = liveReducer(run(CONNECTED), { type: "AI_TURN_STARTED" });
    expect(liveReducer(speaking, { type: "AI_TURN_STARTED" })).toBe(speaking);
  });
});

describe("hesitation keeps the floor with the candidate", () => {
  it("returns to listening when the pause turns out not to be an answer", () => {
    // "Um, let me think" is not a turn. The room had already moved to
    // "Thinking — reviewing your response", which is both false and
    // self-fulfilling: a candidate who sees the interviewer take the floor
    // stops talking.
    let state = run(CONNECTED);
    state = liveReducer(state, { type: "CANDIDATE_SPEECH_STARTED" });
    state = liveReducer(state, { type: "CANDIDATE_SPEECH_ENDED" });
    expect(state.phase).toBe("PROCESSING");

    state = liveReducer(state, { type: "AWAITING_CANDIDATE" });
    expect(state.phase).toBe("LISTENING");
  });

  it("does not interrupt the interviewer to wait for the candidate", () => {
    // Only a pending decision can be revoked; if the interviewer has already
    // started speaking, the floor is genuinely theirs.
    const speaking = liveReducer(run(CONNECTED), { type: "AI_TURN_STARTED" });
    expect(liveReducer(speaking, { type: "AWAITING_CANDIDATE" })).toBe(speaking);
  });
});

describe("interruption / barge-in", () => {
  it("hands the floor to the candidate when they speak over the AI", () => {
    let state = run(CONNECTED);
    state = liveReducer(state, { type: "AI_TURN_STARTED" });
    state = liveReducer(state, { type: "INTERRUPTED" });

    expect(state.phase).toBe("CANDIDATE_SPEAKING");
    expect(state.interruptions).toBe(1);
  });

  it("ignores an interruption when the AI was not speaking", () => {
    // The server can emit `interrupted` for a turn we already ended; counting
    // it would inflate the barge-in metric shown in the report.
    let state = run(CONNECTED);
    state = liveReducer(state, { type: "AI_TURN_STARTED" });
    state = liveReducer(state, { type: "AI_TURN_COMPLETE" });

    const after = liveReducer(state, { type: "INTERRUPTED" });
    expect(after.interruptions).toBe(0);
    expect(after.phase).toBe("LISTENING");
  });

  it("counts repeated barge-ins separately", () => {
    let state = run(CONNECTED);
    for (let i = 0; i < 3; i += 1) {
      state = liveReducer(state, { type: "AI_TURN_STARTED" });
      state = liveReducer(state, { type: "INTERRUPTED" });
    }
    expect(state.interruptions).toBe(3);
  });
});

describe("transcript", () => {
  it("replaces interim text rather than appending fragments", () => {
    // Live transcription resends the whole utterance each tick; appending
    // would produce "I I th I think I think that".
    const state = run([
      ...CONNECTED,
      { type: "TRANSCRIPT", speaker: "CANDIDATE", text: "I", atMs: 10, interim: true },
      { type: "TRANSCRIPT", speaker: "CANDIDATE", text: "I think", atMs: 20, interim: true },
      { type: "TRANSCRIPT", speaker: "CANDIDATE", text: "I think so", atMs: 30, interim: true },
    ]);

    expect(state.transcript).toHaveLength(1);
    expect(state.transcript[0].text).toBe("I think so");
  });

  it("starts a new segment when the speaker changes", () => {
    const state = run([
      ...CONNECTED,
      { type: "TRANSCRIPT", speaker: "AI", text: "Explain indexing.", atMs: 10, interim: false },
      { type: "TRANSCRIPT", speaker: "CANDIDATE", text: "An index is", atMs: 20, interim: true },
    ]);
    expect(state.transcript).toHaveLength(2);
    expect(state.transcript[0].speaker).toBe("AI");
    expect(state.transcript[1].speaker).toBe("CANDIDATE");
  });

  it("promotes an interim segment to final in place", () => {
    const state = run([
      ...CONNECTED,
      { type: "TRANSCRIPT", speaker: "AI", text: "Explain", atMs: 10, interim: true },
      { type: "TRANSCRIPT", speaker: "AI", text: "Explain indexing.", atMs: 20, interim: false },
    ]);
    expect(state.transcript).toHaveLength(1);
    expect(state.transcript[0].interim).toBe(false);
  });

  it("ignores empty transcript chunks", () => {
    const state = run([
      ...CONNECTED,
      { type: "TRANSCRIPT", speaker: "AI", text: "", atMs: 10, interim: false },
    ]);
    expect(state.transcript).toHaveLength(0);
  });

  it("only exposes finalized, non-empty turns for persistence", () => {
    const state = run([
      ...CONNECTED,
      { type: "TRANSCRIPT", speaker: "AI", text: "Question one.", atMs: 10, interim: false },
      { type: "TRANSCRIPT", speaker: "CANDIDATE", text: "Still speaking", atMs: 20, interim: true },
    ]);

    const finalized = finalizedTurns(state);
    expect(finalized).toHaveLength(1);
    expect(finalized[0].text).toBe("Question one.");
  });
});

describe("reconnection", () => {
  it("preserves the transcript across a drop", () => {
    const state = run([
      ...CONNECTED,
      { type: "TRANSCRIPT", speaker: "AI", text: "Explain indexing.", atMs: 10, interim: false },
      { type: "RECONNECTING" },
      { type: "RECONNECTED" },
    ]);

    expect(state.transcript).toHaveLength(1);
    expect(state.connection).toBe("connected");
    expect(state.phase).toBe("LISTENING");
  });

  it("surfaces reconnecting rather than failing silently", () => {
    const state = run([...CONNECTED, { type: "RECONNECTING" }]);
    expect(state.phase).toBe("RECONNECTING");
    expect(state.connection).toBe("reconnecting");
  });

  it("clears a previous error once restored", () => {
    const state = run([...CONNECTED, { type: "RECONNECTING" }, { type: "RECONNECTED" }]);
    expect(state.error).toBeNull();
  });
});

describe("controls", () => {
  it("tracks mute without ending the session", () => {
    const state = run([...CONNECTED, { type: "TOGGLE_MIC", muted: true }]);
    expect(state.media.micMuted).toBe(true);
    expect(isActive(state)).toBe(true);
  });

  it("stops the mic being live while muted", () => {
    const live = run(CONNECTED);
    expect(micIsLive(live)).toBe(true);

    const muted = liveReducer(live, { type: "TOGGLE_MIC", muted: true });
    expect(micIsLive(muted)).toBe(false);
  });

  it("pauses and resumes", () => {
    const paused = run([...CONNECTED, { type: "PAUSE" }]);
    expect(paused.phase).toBe("PAUSED");

    const resumed = liveReducer(paused, { type: "RESUME" });
    expect(resumed.phase).toBe("LISTENING");
  });

  it("does not pause a session that never connected", () => {
    const state = run([{ type: "PAUSE" }]);
    expect(state.phase).toBe("IDLE");
  });
});

describe("terminal states", () => {
  it("ignores late socket messages after completion", () => {
    // Messages can arrive after "End interview"; they must not resurrect it.
    const completed = run([...CONNECTED, { type: "COMPLETED" }]);
    const after = liveReducer(completed, { type: "AI_TURN_STARTED" });

    expect(after.phase).toBe("COMPLETED");
    expect(isTerminal(after)).toBe(true);
  });

  it("still records an error after completion, for diagnostics", () => {
    const completed = run([...CONNECTED, { type: "COMPLETED" }]);
    const errored = liveReducer(completed, { type: "ERROR", message: "socket died" });
    expect(errored.phase).toBe("FAILED");
  });

  it("closes the connection when the session fails", () => {
    const state = run([...CONNECTED, { type: "ERROR", message: "quota exceeded" }]);
    expect(state.connection).toBe("closed");
    expect(state.error).toBe("quota exceeded");
    expect(micIsLive(state)).toBe(false);
  });
});

/**
 * Retrying after a failure.
 *
 * The connect error tells the candidate "you can retry", so there has to be a
 * way out of FAILED. It is the one event besides ERROR that is allowed through
 * the terminal guard, which makes the exact boundary worth pinning down.
 */
describe("retry after a failed session", () => {
  const FAILED: LiveEvent[] = [
    ...CONNECTED,
    { type: "ERROR", message: "Could not connect to the voice service." },
  ];

  it("leaves FAILED so a new session can start", () => {
    const state = run([...FAILED, { type: "RETRY" }]);
    expect(state.phase).toBe("IDLE");
    expect(isTerminal(state)).toBe(false);
  });

  it("clears the error so the alert stops showing", () => {
    const state = run([...FAILED, { type: "RETRY" }]);
    expect(state.error).toBeNull();
  });

  it("reports the connection as offline, not connected", () => {
    // A retry that claimed "connected" before the socket exists is exactly
    // the fake-connected state the room must never show.
    const state = run([...FAILED, { type: "RETRY" }]);
    expect(state.connection).toBe("offline");
  });

  it("keeps the transcript the candidate already produced", () => {
    const state = run([
      ...CONNECTED,
      { type: "TRANSCRIPT", speaker: "CANDIDATE", text: "I used Postgres", atMs: 1000, interim: false },
      { type: "ERROR", message: "connection lost" },
      { type: "RETRY" },
    ]);
    expect(state.transcript).toHaveLength(1);
    expect(state.transcript[0].text).toBe("I used Postgres");
  });

  it("does not restart the interview clock", () => {
    const state = run([...FAILED, { type: "RETRY" }]);
    expect(state.startedAtMs).toBe(1_000);
  });

  it("clears a stale device notice", () => {
    const state = run([
      ...CONNECTED,
      { type: "DEVICE_LOST", device: "microphone" },
      { type: "ERROR", message: "microphone gone" },
      { type: "RETRY" },
    ]);
    expect(state.deviceNotice).toBeNull();
  });

  it("does not reopen an interview the candidate completed", () => {
    // A stray retry on a finished session would open a second live session
    // against an interview that has already been reported.
    const state = run([...CONNECTED, { type: "COMPLETED" }, { type: "RETRY" }]);
    expect(state.phase).toBe("COMPLETED");
  });

  it("is a no-op on a healthy session", () => {
    const connected = run(CONNECTED);
    expect(liveReducer(connected, { type: "RETRY" })).toBe(connected);
  });

  it("accepts the events a fresh start dispatches, once retried", () => {
    // The regression this guards: FAILED is terminal, so dispatching RETRY
    // after `start()` instead of before left every permission and connect
    // event silently dropped.
    const state = run([
      ...FAILED,
      { type: "RETRY" },
      { type: "PERMISSIONS_REQUESTED" },
      GRANTED,
      { type: "CONNECT_STARTED" },
    ]);
    expect(state.phase).toBe("CONNECTING");
    expect(state.connection).toBe("connecting");
  });
});

describe("devices disappearing mid-interview", () => {
  it("keeps the session alive when the camera is unplugged", () => {
    // Tearing the session down would lose the transcript over something a
    // voice interview does not even need.
    const state = run([...CONNECTED, { type: "DEVICE_LOST", device: "camera" }]);

    expect(state.media.camera).toBe("unavailable");
    expect(state.phase).not.toBe("FAILED");
    expect(state.error).toBeNull();
    expect(state.deviceNotice).toMatch(/camera connection was lost/i);
  });

  it("warns but does not end the interview when the microphone goes", () => {
    const state = run([...CONNECTED, { type: "DEVICE_LOST", device: "microphone" }]);

    expect(state.media.microphone).toBe("unavailable");
    expect(state.phase).not.toBe("FAILED");
    expect(state.deviceNotice).toMatch(/microphone is no longer available/i);
  });

  it("clears the notice when the device comes back", () => {
    const state = run([
      ...CONNECTED,
      { type: "DEVICE_LOST", device: "camera" },
      { type: "DEVICE_RESTORED", device: "camera" },
    ]);

    expect(state.media.camera).toBe("granted");
    expect(state.deviceNotice).toBeNull();
  });

  it("does not confuse a lost device with a session error", () => {
    // Both render, and they must not render as the same thing: one is fatal
    // and offers the chat interview, the other is a passing notice.
    const state = run([...CONNECTED, { type: "DEVICE_LOST", device: "camera" }]);
    expect(state.error).toBeNull();
    expect(state.deviceNotice).not.toBeNull();
  });

  it("leaves a candidate mute toggle untouched by a device loss", () => {
    const state = run([
      ...CONNECTED,
      { type: "TOGGLE_MIC", muted: true },
      { type: "DEVICE_LOST", device: "camera" },
    ]);
    expect(state.media.micMuted).toBe(true);
  });
});

describe("persona tuning", () => {
  it("gives every persona a distinct voice", () => {
    const voices = Object.values(PERSONA_TUNING).map((t) => t.voiceName);
    expect(new Set(voices).size).toBe(voices.length);
  });

  it("makes the friendly persona the most patient with silence", () => {
    // Personas differ behaviourally, not just in name.
    expect(PERSONA_TUNING.FRIENDLY.silenceDurationMs).toBeGreaterThan(
      PERSONA_TUNING.STRESS.silenceDurationMs,
    );
    expect(PERSONA_TUNING.PROFESSIONAL.silenceDurationMs).toBeGreaterThan(
      PERSONA_TUNING.STRICT.silenceDurationMs,
    );
  });

  it("never cuts a candidate off faster than a real thinking pause", () => {
    // Below ~1s this clips normal technical speech, which is a bug rather
    // than a persona trait.
    for (const tuning of Object.values(PERSONA_TUNING)) {
      expect(tuning.silenceDurationMs).toBeGreaterThanOrEqual(
        MIN_SILENCE_DURATION_MS,
      );
    }
  });

  it("clamps an out-of-range silence duration", () => {
    expect(safeSilenceDuration(10)).toBe(MIN_SILENCE_DURATION_MS);
    expect(safeSilenceDuration(999_999)).toBeLessThanOrEqual(5000);
    // In-range values pass through untouched.
    expect(safeSilenceDuration(2600)).toBe(2600);
    // 1800ms used to be acceptable. It is not any more: a 2s thinking pause
    // was measured splitting a single answer into two, so anything below the
    // floor is raised to it rather than honoured.
    expect(safeSilenceDuration(1800)).toBe(MIN_SILENCE_DURATION_MS);
  });

  it("falls back to the professional tuning for an unknown persona", () => {
    expect(tuningFor("NOT_A_PERSONA" as never)).toEqual(
      PERSONA_TUNING.PROFESSIONAL,
    );
  });
});
