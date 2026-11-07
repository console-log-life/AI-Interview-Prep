import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CONNECT_TIMEOUT_MS, RESPONSE_TIMEOUT_MS } from "@/lib/ai/live/config";
import { createOrchestratorState } from "@/lib/ai/live/orchestrator";
import type { InterviewPlanInput } from "@/lib/ai/live/orchestrator-types";
import { createLiveState, finalizedTurns, liveReducer } from "@/lib/ai/live/session";
import type { LiveEvent, LiveSessionGrant } from "@/lib/ai/live/types";

/**
 * Realtime state safety, driven through the real client.
 *
 * These are the failures that unit-testing the pure modules cannot reach,
 * because they are about *ordering between transports*: a socket that dies
 * while a turn is being finalized, a message that arrives after the interview
 * ended, an interruption the client provoked itself. Each test below
 * reproduces a defect that was live.
 *
 * The Gemini SDK and the audio graph are replaced with doubles; everything
 * else — turn detection, the hold window, transcript assembly, reconnect — is
 * the production code path.
 *
 * What this does NOT cover: real audio, real transcription, real network
 * timing. A pass means the state machine is disciplined, not that a microphone
 * works.
 */

const harness = vi.hoisted(() => {
  type Callbacks = {
    onopen: () => void;
    onmessage: (message: unknown) => void;
    onerror: () => void;
    onclose: () => void;
  };

  class FakeSession {
    closed = false;
    readonly realtime: Array<Record<string, unknown>> = [];
    readonly content: Array<Record<string, unknown>> = [];
    sendRealtimeInput(input: Record<string, unknown>) {
      if (this.closed) throw new Error("socket closed");
      this.realtime.push(input);
    }
    sendClientContent(input: Record<string, unknown>) {
      if (this.closed) throw new Error("socket closed");
      this.content.push(input);
    }
    close() {
      this.closed = true;
    }
    /** Did this socket ever open a candidate activity window? */
    get openedActivity(): boolean {
      return this.realtime.some((input) => "activityStart" in input);
    }
  }

  return {
    /**
     * When set, `live.connect()` never resolves.
     *
     * Reproduces the one connect failure that reports nothing: a socket that
     * opens and then stalls before setup. Released by `settleConnect`, so a
     * test can also check what happens when the handshake lands *after* the
     * client gave up on it.
     */
    hangConnect: false,
    settleConnect: null as null | (() => void),
    sessions: [] as FakeSession[],
    callbacks: [] as Callbacks[],
    audio: [] as Array<{
      flushes: number;
      onChunk: (pcm: ArrayBuffer) => void;
      onPlaybackChange?: (playing: boolean) => void;
    }>,
    FakeSession,
    reset() {
      this.sessions.length = 0;
      this.callbacks.length = 0;
      this.audio.length = 0;
      this.hangConnect = false;
      this.settleConnect = null;
    },
  };
});

vi.mock("@google/genai", () => ({
  Modality: { AUDIO: "AUDIO" },
  GoogleGenAI: class {
    live = {
      connect: async ({
        callbacks,
      }: {
        callbacks: {
          onopen: () => void;
          onmessage: (message: unknown) => void;
          onerror: () => void;
          onclose: () => void;
        };
      }) => {
        harness.callbacks.push(callbacks);
        const session = new harness.FakeSession();
        harness.sessions.push(session);

        if (harness.hangConnect) {
          await new Promise<void>((resolve) => {
            harness.settleConnect = resolve;
          });
        }

        callbacks.onopen();
        return session;
      },
    };
  },
}));

vi.mock("@/lib/ai/live/audio", () => ({
  encodeBase64: () => "",
  LiveAudioManager: class {
    flushes = 0;
    constructor(callbacks: {
      onChunk: (pcm: ArrayBuffer) => void;
      onPlaybackChange?: (playing: boolean) => void;
    }) {
      harness.audio.push({
        flushes: 0,
        onChunk: callbacks.onChunk,
        onPlaybackChange: callbacks.onPlaybackChange,
      });
    }
    async startPlayback() {}
    async startCapture() {}
    async resume() {}
    async dispose() {}
    enqueue() {}
    flushPlayback() {
      const entry = harness.audio[harness.audio.length - 1];
      if (entry) entry.flushes += 1;
    }
    setMuted() {}
    setOutputMuted() {}
    outputLevel() {
      return 0;
    }
  },
}));

// Imported after the mocks so the client picks up the doubles.
const { LiveInterviewClient } = await import("@/lib/ai/live/client");

const PLAN: InterviewPlanInput = {
  interviewType: "TECHNICAL",
  persona: "PROFESSIONAL",
  difficulty: "MEDIUM",
  targetRole: "Backend Engineer",
  durationMin: 30,
  plannedQuestions: 8,
  resumeClaims: [],
  jdSkills: ["postgresql"],
  weakSkills: [],
  candidateSkills: [],
};

const GRANT: LiveSessionGrant = {
  token: "ephemeral-test-token",
  model: "test-model",
  expiresAt: new Date().toISOString(),
  interviewId: "interview-1",
  systemInstruction: "You are an interviewer.",
  voiceName: "Charon",
  liveStartedAt: new Date().toISOString(),
  interviewerName: "Alex",
  interviewerTitle: "AI Technical Interviewer",
  silenceDurationMs: 2500,
  prefixPaddingMs: 250,
  planInput: PLAN,
};

/** A stream that satisfies the client without touching real media. */
const STREAM = {
  getTracks: () => [],
  getAudioTracks: () => [],
  getVideoTracks: () => [],
} as unknown as MediaStream;

/** Reaches the finalization entry point without simulating 3s of silence. */
type Finalizable = { completeCandidateTurn(): Promise<void> };

async function startClient() {
  const events: LiveEvent[] = [];
  const client = new LiveInterviewClient({
    grant: GRANT,
    dispatch: (event) => events.push(event),
    orchestrator: createOrchestratorState(PLAN),
  });
  await client.start(STREAM);
  return { client, events };
}

/** One frame of audio loud enough to count as speech. */
function loudFrame(): ArrayBuffer {
  const buffer = new ArrayBuffer(128);
  const view = new DataView(buffer);
  for (let i = 0; i < 64; i += 1) view.setInt16(i * 2, 8000, true);
  return buffer;
}

/**
 * Feeds frames through the capture callback, advancing the clock as it goes.
 *
 * The detector reads wall-clock time, so frames delivered without advancing it
 * never accumulate speech.
 */
function speak(frames: number): void {
  const capture = harness.audio[harness.audio.length - 1];
  for (let i = 0; i < frames; i += 1) {
    vi.setSystemTime(Date.now() + 128);
    capture.onChunk(loudFrame());
  }
}

function latest() {
  return {
    session: harness.sessions[harness.sessions.length - 1],
    callbacks: harness.callbacks[harness.callbacks.length - 1],
  };
}

beforeEach(() => {
  harness.reset();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-01-01T10:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("the hold window is not a barge-in", () => {
  /**
   * The worst defect this file guards.
   *
   * Finalization releases the turn with `activityEnd`, which lets the model
   * start generating, then immediately re-opens candidate activity to hold it
   * back while the transcription tail arrives. The server reports that hold as
   * an interruption — of a turn the candidate has just *finished*. Acting on it
   * wiped the assembled answer and abandoned the finalization waiting on it, so
   * a complete, well-formed answer vanished and the interviewer never replied.
   */
  it("keeps the finished answer when the server reports our own hold as an interruption", async () => {
    const { client, events } = await startClient();
    const { callbacks } = latest();

    callbacks.onmessage({ setupComplete: {} });
    callbacks.onmessage({
      serverContent: { outputTranscription: { text: "Why did you choose PostgreSQL?" } },
    });
    callbacks.onmessage({ serverContent: { turnComplete: true } });

    callbacks.onmessage({
      serverContent: { inputTranscription: { text: "I chose it because we" } },
    });
    callbacks.onmessage({
      serverContent: { inputTranscription: { text: " needed transactions." } },
    });

    const finalizing = (client as unknown as Finalizable).completeCandidateTurn();

    // The model had already begun generating, so the hold interrupts it.
    callbacks.onmessage({ serverContent: { interrupted: true } });

    await vi.advanceTimersByTimeAsync(3000);
    await finalizing;

    const trace = client.devTrace;
    const finalTranscript = trace.find((entry) => entry.event === "final-transcript");

    expect(finalTranscript?.answer).toBe("I chose it because we needed transactions.");
    // The interview moved on, rather than silently dropping the turn.
    expect(trace.some((entry) => entry.event === "steering-sent")).toBe(true);
    // And no barge-in was recorded against a candidate who did not interrupt.
    expect(events.some((event) => event.type === "INTERRUPTED")).toBe(false);
  });

  /**
   * The hold is a cancelled model turn, and a fragment can leak out before the
   * cancel lands. Playing it talks over a candidate who is still finishing;
   * recording it replaces the real question with half of one, and the answer
   * is then graded against a question that was never asked.
   */
  it("discards anything the model leaks out during the hold", async () => {
    const { client, events } = await startClient();
    const { callbacks } = latest();

    callbacks.onmessage({ setupComplete: {} });
    callbacks.onmessage({
      serverContent: { outputTranscription: { text: "Why did you choose PostgreSQL?" } },
    });
    callbacks.onmessage({ serverContent: { turnComplete: true } });
    callbacks.onmessage({
      serverContent: { inputTranscription: { text: "Because we needed transactions." } },
    });

    const finalizing = (client as unknown as Finalizable).completeCandidateTurn();

    // The model got a word out before the hold cancelled it.
    callbacks.onmessage({
      serverContent: {
        outputTranscription: { text: "So, tell me" },
        modelTurn: { parts: [{ inlineData: { data: "AAAA" } }] },
      },
    });
    callbacks.onmessage({ serverContent: { turnComplete: true } });
    callbacks.onmessage({ serverContent: { interrupted: true } });

    await vi.advanceTimersByTimeAsync(3000);
    await finalizing;

    // The real question still stands.
    expect(client.pendingQuestion?.text).toBe("Why did you choose PostgreSQL?");
    // Nothing was played over the candidate.
    expect(events.some((event) => event.type === "AI_TURN_STARTED")).toBe(false);
  });

  it("still treats a genuine interruption as a barge-in", async () => {
    const { client, events } = await startClient();
    const { callbacks } = latest();

    callbacks.onmessage({ setupComplete: {} });
    // The model is speaking: audio parts mark a real turn in progress.
    callbacks.onmessage({
      serverContent: { modelTurn: { parts: [{ inlineData: { data: "AAAA" } }] } },
    });
    callbacks.onmessage({ serverContent: { interrupted: true } });

    expect(events.some((event) => event.type === "INTERRUPTED")).toBe(true);
    expect(
      client.devTrace.some(
        (entry) => entry.event === "interruption" && entry.note?.includes("discarded"),
      ),
    ).toBe(true);
  });
});

describe("the candidate's answer reaches the stored transcript", () => {
  /**
   * Every candidate segment was dispatched as interim, and `finalizedTurns` —
   * which is what both the periodic flush and the closing flush send — filters
   * interim out. The saved interview contained the interviewer's questions and
   * nothing else: it read as one where the candidate never spoke.
   */
  it("finalizes the answer rather than leaving it interim forever", async () => {
    const { client, events } = await startClient();
    const { callbacks } = latest();

    callbacks.onmessage({ setupComplete: {} });
    callbacks.onmessage({
      serverContent: { inputTranscription: { text: "We sharded by tenant id." } },
    });

    const finalizing = (client as unknown as Finalizable).completeCandidateTurn();
    await vi.advanceTimersByTimeAsync(3000);
    await finalizing;

    const state = events.reduce(liveReducer, createLiveState());
    const stored = finalizedTurns(state);

    expect(stored.some((segment) => segment.speaker === "CANDIDATE")).toBe(true);
    expect(stored.at(-1)?.text).toBe("We sharded by tenant id.");
  });

  it("does not show the answer twice", async () => {
    const { client, events } = await startClient();
    const { callbacks } = latest();

    callbacks.onmessage({ setupComplete: {} });
    callbacks.onmessage({ serverContent: { inputTranscription: { text: "We used" } } });
    callbacks.onmessage({
      serverContent: { inputTranscription: { text: " Redis for sessions." } },
    });

    const finalizing = (client as unknown as Finalizable).completeCandidateTurn();
    await vi.advanceTimersByTimeAsync(3000);
    await finalizing;

    const state = events.reduce(liveReducer, createLiveState());
    const candidate = state.transcript.filter(
      (segment) => segment.speaker === "CANDIDATE",
    );

    // The final replaces the interim in place; it does not append beside it.
    expect(candidate).toHaveLength(1);
    expect(candidate[0].text).toBe("We used Redis for sessions.");
    expect(candidate[0].interim).toBe(false);
  });

  it("leaves a hesitation unfinalized, so it is never stored as an answer", async () => {
    const { client, events } = await startClient();
    const { callbacks } = latest();

    callbacks.onmessage({ setupComplete: {} });
    callbacks.onmessage({ serverContent: { inputTranscription: { text: "um, well" } } });

    const finalizing = (client as unknown as Finalizable).completeCandidateTurn();
    await vi.advanceTimersByTimeAsync(3000);
    await finalizing;

    const state = events.reduce(liveReducer, createLiveState());
    expect(
      finalizedTurns(state).some((segment) => segment.speaker === "CANDIDATE"),
    ).toBe(false);
  });
});

describe("reconnect leaves the candidate audible", () => {
  /**
   * A reconnect used to end the interview without saying so.
   *
   * The candidate's activity window belonged to the dead socket. Left marked
   * open, the detector never emitted another speech start, so `activityStart`
   * was never sent on the new socket — and every frame was streamed outside any
   * turn, where the server discards it. The room reconnected, said it was
   * listening, and heard nothing for the rest of the interview.
   */
  it("opens a fresh activity window on the new socket", async () => {
    await startClient();
    const first = latest();

    first.callbacks.onmessage({ setupComplete: {} });

    // The candidate is mid-answer when the socket dies.
    speak(4);
    expect(first.session.openedActivity).toBe(true);

    first.callbacks.onclose();
    await vi.advanceTimersByTimeAsync(2000);

    expect(harness.sessions).toHaveLength(2);
    const second = latest();
    expect(second.session).not.toBe(first.session);

    // They carry on talking. The new socket must be told a turn is open.
    speak(4);
    expect(second.session.openedActivity).toBe(true);
  });

  it("does not restart the interview when setup runs again", async () => {
    const { client } = await startClient();
    const first = latest();
    first.callbacks.onmessage({ setupComplete: {} });

    const openingTurns = first.session.content.length;
    expect(openingTurns).toBeGreaterThan(0);

    first.callbacks.onclose();
    await vi.advanceTimersByTimeAsync(2000);

    const second = latest();
    second.callbacks.onmessage({ setupComplete: {} });

    // No second opening directive: the interviewer does not re-introduce
    // itself half-way through, and the plan is not rewound to INTRO.
    expect(second.session.content).toHaveLength(0);
    expect(
      client.devTrace.some((entry) => entry.event === "reconnect-completed"),
    ).toBe(true);
  });

  it("opens exactly one socket when error and close both fire", async () => {
    await startClient();
    const first = latest();
    first.callbacks.onmessage({ setupComplete: {} });

    // A dying socket reports the same failure twice.
    first.callbacks.onerror();
    first.callbacks.onclose();
    await vi.advanceTimersByTimeAsync(4000);

    // Two live sessions would both interview the candidate and both bill.
    expect(harness.sessions).toHaveLength(2);
  });

  it("ignores messages from a socket that has been replaced", async () => {
    const { events } = await startClient();
    const first = latest();
    first.callbacks.onmessage({ setupComplete: {} });

    first.callbacks.onclose();
    await vi.advanceTimersByTimeAsync(2000);

    const before = events.length;
    first.callbacks.onmessage({
      serverContent: { inputTranscription: { text: "from the dead socket" } },
    });

    expect(events).toHaveLength(before);
  });
});

describe("ending the interview stops everything", () => {
  it("ignores transcription that arrives after the session is closed", async () => {
    const { client, events } = await startClient();
    const { callbacks } = latest();
    callbacks.onmessage({ setupComplete: {} });

    await client.stop();

    const before = events.length;
    callbacks.onmessage({
      serverContent: { inputTranscription: { text: "said after the end" } },
    });
    callbacks.onmessage({ serverContent: { turnComplete: true } });

    expect(events).toHaveLength(before);
  });

  it("does not reconnect after the candidate ends the interview", async () => {
    const { client } = await startClient();
    const { callbacks } = latest();
    callbacks.onmessage({ setupComplete: {} });

    await client.stop();
    callbacks.onclose();
    await vi.advanceTimersByTimeAsync(4000);

    expect(harness.sessions).toHaveLength(1);
  });

  it("abandons a finalization that is still waiting when the interview ends", async () => {
    const { client } = await startClient();
    const { callbacks } = latest();
    callbacks.onmessage({ setupComplete: {} });
    callbacks.onmessage({
      serverContent: { inputTranscription: { text: "a half-finished thought" } },
    });

    const finalizing = (client as unknown as Finalizable).completeCandidateTurn();
    await client.stop();
    await vi.advanceTimersByTimeAsync(8000);
    await finalizing;

    // The wait resolved instead of running the whole decision path against a
    // session that no longer exists.
    expect(
      client.devTrace.some((entry) => entry.event === "steering-sent"),
    ).toBe(false);
  });
});

/**
 * No path may leave the room waiting forever.
 *
 * Two states had no timeout at all. CONNECTING, because `live.connect()` never
 * gives up on its own; and PROCESSING, because releasing the turn is the one
 * point where the interview depends on a reply the client cannot produce.
 * Both displayed a plausible "Connecting..." or "Thinking..." indefinitely --
 * the failure mode that looks exactly like a slow network until the interview
 * slot has gone.
 */
describe("stuck states are bounded by a watchdog", () => {
  /** Reaches the point where the model owes the candidate a reply. */
  async function releaseTheTurn(client: unknown) {
    const finalizing = (client as Finalizable).completeCandidateTurn();
    await vi.advanceTimersByTimeAsync(3000);
    await finalizing;
  }

  function errors(events: LiveEvent[]) {
    return events.filter((event) => event.type === "ERROR");
  }

  /** A client whose handshake stalls before setup. */
  function startStalled() {
    harness.hangConnect = true;
    const events: LiveEvent[] = [];
    const client = new LiveInterviewClient({
      grant: GRANT,
      dispatch: (event) => events.push(event),
      orchestrator: createOrchestratorState(PLAN),
    });
    return { client, events, starting: client.start(STREAM) };
  }

  it("fails the session when the interviewer never replies", async () => {
    const { client, events } = await startClient();
    const { callbacks } = latest();
    callbacks.onmessage({ setupComplete: {} });
    callbacks.onmessage({
      serverContent: { inputTranscription: { text: "We used a write-through cache." } },
    });

    await releaseTheTurn(client);
    expect(errors(events)).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(RESPONSE_TIMEOUT_MS + 1000);

    // The room must leave PROCESSING, with something the candidate can act on.
    const state = events.reduce(liveReducer, createLiveState());
    expect(state.phase).toBe("FAILED");
    expect(state.error).toMatch(/stopped responding/i);
  });

  it("stands down as soon as the interviewer speaks", async () => {
    const { client, events } = await startClient();
    const { callbacks } = latest();
    callbacks.onmessage({ setupComplete: {} });
    callbacks.onmessage({
      serverContent: { inputTranscription: { text: "We used a queue." } },
    });

    await releaseTheTurn(client);
    callbacks.onmessage({
      serverContent: { modelTurn: { parts: [{ inlineData: { data: "AAAA" } }] } },
    });

    await vi.advanceTimersByTimeAsync(RESPONSE_TIMEOUT_MS + 1000);
    expect(errors(events)).toHaveLength(0);
  });

  it("does not fail a session where the candidate is still talking", async () => {
    // An answer longer than the response budget is a working interview, not a
    // dead one: the candidate speaking is what the model is waiting on.
    const { client, events } = await startClient();
    const { callbacks } = latest();
    callbacks.onmessage({ setupComplete: {} });
    callbacks.onmessage({ serverContent: { inputTranscription: { text: "Well," } } });

    await releaseTheTurn(client);
    speak(40);

    await vi.advanceTimersByTimeAsync(RESPONSE_TIMEOUT_MS + 1000);
    expect(errors(events)).toHaveLength(0);
  });

  it("does not fail a session the candidate has ended", async () => {
    const { client, events } = await startClient();
    const { callbacks } = latest();
    callbacks.onmessage({ setupComplete: {} });
    callbacks.onmessage({ serverContent: { inputTranscription: { text: "Done." } } });

    await releaseTheTurn(client);
    await client.stop();

    await vi.advanceTimersByTimeAsync(RESPONSE_TIMEOUT_MS + 1000);
    expect(errors(events)).toHaveLength(0);
  });

  it("does not fail a session that is reconnecting", async () => {
    const { client, events } = await startClient();
    const { callbacks } = latest();
    callbacks.onmessage({ setupComplete: {} });
    callbacks.onmessage({ serverContent: { inputTranscription: { text: "Done." } } });

    await releaseTheTurn(client);
    // The turn it was timing belonged to the socket that just died.
    callbacks.onclose();
    await vi.advanceTimersByTimeAsync(RESPONSE_TIMEOUT_MS + 1000);

    expect(errors(events)).toHaveLength(0);
  });

  it("gives up on a handshake that never completes", async () => {
    const { events, starting } = startStalled();

    await vi.advanceTimersByTimeAsync(CONNECT_TIMEOUT_MS + 1000);
    await starting;

    const state = events.reduce(liveReducer, createLiveState());
    expect(state.phase).toBe("FAILED");
    expect(state.error).toMatch(/could not connect/i);
  });

  it("closes a socket that opens after the handshake was abandoned", async () => {
    const { starting } = startStalled();

    await vi.advanceTimersByTimeAsync(CONNECT_TIMEOUT_MS + 1000);
    await starting;

    // The handshake lands late. Left open it would be a second socket against
    // the same interview, burning quota with nothing reading it.
    harness.settleConnect?.();
    await vi.advanceTimersByTimeAsync(10);

    expect(harness.sessions.at(-1)?.closed).toBe(true);
  });

  it("ignores a late handshake's callbacks", async () => {
    const { events, starting } = startStalled();

    await vi.advanceTimersByTimeAsync(CONNECT_TIMEOUT_MS + 1000);
    await starting;

    harness.settleConnect?.();
    await vi.advanceTimersByTimeAsync(10);

    const before = events.length;
    latest().callbacks.onmessage({ setupComplete: {} });

    // The generation was retired when the connect failed, so nothing from that
    // socket may reach the interview.
    expect(events).toHaveLength(before);
  });
});

describe("a hesitation keeps the floor with the candidate", () => {
  it("does not answer 'um, let me think' and does not hang", async () => {
    const { client, events } = await startClient();
    const { callbacks, session } = latest();
    callbacks.onmessage({ setupComplete: {} });

    const contentBefore = session.content.length;
    callbacks.onmessage({
      serverContent: { inputTranscription: { text: "um, let me think" } },
    });

    const finalizing = (client as unknown as Finalizable).completeCandidateTurn();
    await vi.advanceTimersByTimeAsync(3000);
    await finalizing;

    // Nothing was steered: replying to a filled pause is the single most
    // unnatural thing a voice interviewer can do.
    expect(session.content).toHaveLength(contentBefore);
    // And the room stops claiming it is reviewing an answer nobody gave.
    expect(events.some((event) => event.type === "AWAITING_CANDIDATE")).toBe(true);

    // Bounded: if the answer never comes the turn is released rather than
    // leaving the interview silent forever.
    await vi.advanceTimersByTimeAsync(9000);
    expect(
      client.devTrace.some((entry) => entry.event === "turn-released"),
    ).toBe(true);
  });
});
