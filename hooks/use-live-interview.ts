"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";

import { LiveInterviewClient } from "@/lib/ai/live/client";
import { createOrchestratorState } from "@/lib/ai/live/orchestrator";
import { liveReducer, finalizedTurns } from "@/lib/ai/live/session";
import {
  INITIAL_LIVE_STATE,
  type LiveSessionGrant,
  type MediaPermission,
} from "@/lib/ai/live/types";
import type { CameraSnapshot } from "@/lib/ai/live/media-state";
import { cameraStateFrom } from "@/lib/ai/live/media-state";
import type { InterviewPhase } from "@/lib/ai/live/orchestrator-types";
import { VisualSampler } from "@/lib/ai/live/vision";
import { apiPost } from "@/lib/api/client";
import { summarizeSpeech } from "@/lib/interviews/speech-metrics";
import { emptyVisualSummary, summarizeVisual } from "@/lib/interviews/visual";

/**
 * Owns the browser side of a live interview: device permissions, the media
 * stream, the Gemini socket, the visual sampler, and periodic transcript
 * flushes.
 *
 * All ordering decisions live in the pure reducer and all analysis lives in
 * pure modules; this hook only performs the effects. That split is what lets
 * the state logic and the measurements be tested without a browser, and keeps
 * the room component free of socket and canvas handling.
 */

/** How often finalized dialogue is pushed to the server. */
const FLUSH_INTERVAL_MS = 15_000;

export type UseLiveInterviewOptions = {
  interviewId: string;
  /** Candidate asked for video; false runs audio-only. */
  wantVideo: boolean;
};

export function useLiveInterview({
  interviewId,
  wantVideo,
}: UseLiveInterviewOptions) {
  const [state, dispatch] = useReducer(liveReducer, INITIAL_LIVE_STATE);

  const clientRef = useRef<LiveInterviewClient | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const flushedRef = useRef(0);
  const videoElRef = useRef<HTMLVideoElement | null>(null);
  const samplerRef = useRef<VisualSampler | null>(null);
  const deliverySentRef = useRef(false);
  /** Set before the first await in `start`, so two calls cannot both proceed. */
  const startingRef = useRef(false);

  /**
   * Controller state the room displays.
   *
   * Polled rather than pushed. These values change only when the interviewer
   * asks something or the plan moves on — a handful of times per interview —
   * so a slow poll that sets state only on an actual change costs nothing,
   * while wiring them through the reducer would put a render on the same path
   * as the audio loop.
   */
  /**
   * When the live session actually began, from the grant.
   *
   * Null until the grant lands, and the room shows the clock as not-yet-running
   * rather than counting from an anchor it does not have.
   */
  const [liveStartedAtMs, setLiveStartedAtMs] = useState<number | null>(null);

  /**
   * Real video-track state, polled.
   *
   * Derived from the track rather than a UI flag, so a camera unplugged
   * mid-interview stops claiming to work. Only set when a field actually
   * changes, so this never re-renders the room on a timer.
   */
  const [cameraSnapshot, setCameraSnapshot] = useState<CameraSnapshot>({
    permission: "unknown",
    hasTrack: false,
    trackEnabled: false,
    trackLive: false,
  });

  const [interview, setInterview] = useState<{
    question: string | null;
    isFollowUp: boolean;
    topic: string | null;
    phase: InterviewPhase;
    /** Phases this interview's plan actually visits. */
    plannedPhases: InterviewPhase[];
  }>({
    question: null,
    isFollowUp: false,
    topic: null,
    phase: "INTRO",
    plannedPhases: [],
  });

  /**
   * Pushes finalized turns to the server.
   *
   * Runs on an interval rather than only at the end so a dropped connection
   * or a closed tab does not lose what the candidate already said. Tracks how
   * much has been sent so a flush never re-posts the whole transcript.
   */
  const flush = useCallback(
    async (segments: ReturnType<typeof finalizedTurns>, interruptions: number) => {
      const pending = segments.slice(flushedRef.current);
      if (pending.length === 0) return;

      try {
        await apiPost(`/api/interviews/${interviewId}/live/transcript`, {
          segments: pending.map((segment) => ({
            speaker: segment.speaker,
            text: segment.text,
            atMs: segment.atMs,
          })),
          interruptions,
        });
        flushedRef.current = segments.length;
      } catch {
        // Leave the cursor where it is so the next tick retries. The endpoint
        // de-duplicates, so a double send is harmless.
      }
    },
    [interviewId],
  );

  /**
   * Asks for devices.
   *
   * Requested together because two separate prompts is a worse experience,
   * and because a candidate who denies the camera should still reach the
   * audio-only path rather than a dead end.
   */
  const requestPermissions = useCallback(async (): Promise<MediaStream | null> => {
    dispatch({ type: "PERMISSIONS_REQUESTED" });

    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      dispatch({
        type: "PERMISSIONS_RESULT",
        camera: "unavailable",
        microphone: "unavailable",
      });
      return null;
    }

    let stream: MediaStream | null = null;
    let camera: MediaPermission = wantVideo ? "denied" : "unavailable";
    let microphone: MediaPermission = "denied";

    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          // Without this the model hears its own voice through the speakers
          // and interrupts itself.
          autoGainControl: true,
        },
        video: wantVideo ? { width: { ideal: 640 }, facingMode: "user" } : false,
      });
      microphone = stream.getAudioTracks().length > 0 ? "granted" : "unavailable";
      camera = stream.getVideoTracks().length > 0 ? "granted" : camera;
    } catch {
      // Retry audio-only: the most common failure is no camera on the device,
      // and that should not block a voice interview.
      if (wantVideo) {
        try {
          stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          microphone = "granted";
          camera = "unavailable";
        } catch {
          microphone = "denied";
        }
      }
    }

    streamRef.current = stream;
    dispatch({ type: "PERMISSIONS_RESULT", camera, microphone });
    return stream;
  }, [wantVideo]);

  /**
   * Attaches the local stream to a `<video>` and starts visual sampling.
   *
   * The sampler reads from the same element the candidate sees, so there is
   * exactly one capture and one decode for both purposes.
   */
  const attachPreview = useCallback(
    (element: HTMLVideoElement | null) => {
      videoElRef.current = element;
      if (!element || !streamRef.current) return;

      element.srcObject = streamRef.current;
      // Muted, or the candidate hears themselves with a delay.
      element.muted = true;
      void element.play().catch(() => undefined);

      if (streamRef.current.getVideoTracks().length > 0 && !samplerRef.current) {
        const sampler = new VisualSampler();
        sampler.start(element, Date.now());
        samplerRef.current = sampler;
      }
    },
    [],
  );

  /** Requests a grant and opens the socket. One session per interview. */
  const start = useCallback(async () => {
    /**
     * The guard has to be synchronous.
     *
     * `clientRef` is only assigned after two awaits — permissions and the
     * grant — so two calls landing in the same tick both got past a check on
     * it and opened a second `getUserMedia` and a second Gemini session. Two
     * interviewers, twice the quota. Development double-mounts and a fast
     * re-entry into the room both produce exactly that pair of calls.
     */
    if (clientRef.current || startingRef.current) return;
    startingRef.current = true;

    const stream = streamRef.current ?? (await requestPermissions());
    if (!stream || stream.getAudioTracks().length === 0) {
      // Nothing was opened, so a retry after granting the microphone must be
      // allowed through.
      startingRef.current = false;
      return;
    }

    try {
      const grant = await apiPost<LiveSessionGrant>(
        `/api/interviews/${interviewId}/live`,
      );

      setLiveStartedAtMs(new Date(grant.liveStartedAt).getTime());

      const client = new LiveInterviewClient({
        grant,
        dispatch,
        // The plan is derived from server-supplied grounding, never invented
        // in the browser.
        orchestrator: createOrchestratorState(grant.planInput),
      });
      clientRef.current = client;
      await client.start(stream);
    } catch (error) {
      /**
       * Release the half-started session.
       *
       * `clientRef` is assigned before `client.start`, and the guard at the
       * top of this function returns early when it is set — so leaving a
       * failed client in place made every later attempt a silent no-op. The
       * client is stopped rather than just dropped, because it may already
       * own an AudioContext and a socket.
       */
      const failed = clientRef.current;
      clientRef.current = null;
      startingRef.current = false;
      try {
        await failed?.stop();
      } catch {
        // Already torn down, which is the expected case here.
      }

      dispatch({
        type: "ERROR",
        message:
          error instanceof Error && error.message
            ? error.message
            : "Could not start the voice interview. The text interview is still available.",
      });
    }
  }, [interviewId, requestPermissions]);

  /**
   * Starts over after a failed session.
   *
   * `connect` reports a failure as "You can retry", so there has to be
   * something that actually retries. A fresh attempt needs a clean slate: the
   * dead client still holds an AudioContext and possibly a socket, and
   * `start` refuses to run while `clientRef` is set.
   *
   * The media stream is released too and re-requested, because a connect
   * failure is not the only way to get here — a microphone revoked
   * mid-interview also lands in FAILED, and reusing its dead tracks would
   * fail again for a reason the candidate cannot see.
   */
  const retry = useCallback(async () => {
    const failed = clientRef.current;
    clientRef.current = null;
    startingRef.current = false;
    try {
      await failed?.stop();
    } catch {
      // Already torn down.
    }

    samplerRef.current?.stop();
    samplerRef.current = null;
    for (const track of streamRef.current?.getTracks() ?? []) track.stop();
    streamRef.current = null;
    // The next session must be allowed to post its own delivery summary.
    deliverySentRef.current = false;

    // Must precede `start`: FAILED is terminal, so the permission and connect
    // events `start` dispatches would all be dropped by the reducer.
    dispatch({ type: "RETRY" });
    await start();
  }, [start]);

  /**
   * Posts the delivery measurements.
   *
   * Guarded by a ref because ending an interview and unmounting the room both
   * lead here, and a second post would be a redundant round trip on the way
   * out. A failure is swallowed: the report is still worth showing without
   * its delivery section, and there is nowhere useful to surface an error at
   * this point in the flow.
   */
  const sendDelivery = useCallback(async () => {
    if (deliverySentRef.current) return;
    deliverySentRef.current = true;

    const sampler = samplerRef.current;
    const turns = clientRef.current?.candidateTurns ?? [];

    const visual = sampler
      ? summarizeVisual(sampler.collected, sampler.hasDetector)
      : emptyVisualSummary(
          "Your camera was off for this interview, so there is no visual analysis.",
        );

    try {
      await apiPost(`/api/interviews/${interviewId}/delivery`, {
        visual,
        speech: summarizeSpeech([...turns]),
        // Grounded in the actual exchanges; the report quotes these rather
        // than asserting conclusions the transcript cannot support.
        evidence: [...(clientRef.current?.evidenceLog ?? [])],
        interruptions: stateRef.current.interruptions,
      });
    } catch {
      // Non-fatal — see above.
    }
  }, [interviewId]);

  /** Ends the session, flushes everything and releases every device. */
  const stop = useCallback(async () => {
    samplerRef.current?.stop();

    const segments = finalizedTurns(stateRef.current);
    await flush(segments, stateRef.current.interruptions);
    await sendDelivery();

    await clientRef.current?.stop();
    clientRef.current = null;

    for (const track of streamRef.current?.getTracks() ?? []) track.stop();
    streamRef.current = null;
    if (videoElRef.current) videoElRef.current.srcObject = null;

    dispatch({ type: "COMPLETED" });
  }, [flush, sendDelivery]);

  const toggleMic = useCallback(
    (muted: boolean) => clientRef.current?.setMuted(muted),
    [],
  );

  /** Silences the interviewer's voice. The session keeps running underneath. */
  const toggleSpeaker = useCallback(
    (muted: boolean) => clientRef.current?.setOutputMuted(muted),
    [],
  );

  const toggleCamera = useCallback((off: boolean) => {
    for (const track of streamRef.current?.getVideoTracks() ?? []) {
      track.enabled = !off;
    }
    // A disabled track still delivers frames, but they are black. Sampling
    // them would record a face that vanished for the rest of the interview.
    samplerRef.current?.setPaused(off);
    dispatch({ type: "TOGGLE_CAMERA", off });
  }, []);

  // The stop callback needs the latest state without re-creating itself on
  // every transcript tick, which would restart the flush interval.
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // Periodic transcript flush.
  useEffect(() => {
    const timer = setInterval(() => {
      const current = stateRef.current;
      void flush(finalizedTurns(current), current.interruptions);
    }, FLUSH_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [flush]);

  /**
   * Watches for devices disappearing mid-interview.
   *
   * Two signals, because they catch different failures: a track `ended` event
   * fires when the device this session is using goes away, while
   * `devicechange` catches the case where it comes back and can be recovered.
   */
  useEffect(() => {
    const stream = streamRef.current;
    if (!stream) return;

    const listeners: Array<() => void> = [];

    for (const track of stream.getTracks()) {
      const device = track.kind === "video" ? "camera" : "microphone";
      const onEnded = () => dispatch({ type: "DEVICE_LOST", device });
      track.addEventListener("ended", onEnded);
      listeners.push(() => track.removeEventListener("ended", onEnded));
    }

    return () => {
      for (const remove of listeners) remove();
    };
  }, [state.phase]);

  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices) return;

    const onChange = async () => {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const stream = streamRef.current;
      if (!stream) return;

      for (const track of stream.getTracks()) {
        const kind = track.kind === "video" ? "videoinput" : "audioinput";
        const device = track.kind === "video" ? "camera" : "microphone";
        const stillPresent = devices.some(
          (entry) => entry.kind === kind && entry.deviceId === track.getSettings().deviceId,
        );
        if (!stillPresent || track.readyState === "ended") {
          dispatch({ type: "DEVICE_LOST", device });
        } else if (track.readyState === "live") {
          dispatch({ type: "DEVICE_RESTORED", device });
        }
      }
    };

    navigator.mediaDevices.addEventListener("devicechange", onChange);
    return () => navigator.mediaDevices.removeEventListener("devicechange", onChange);
  }, []);

  /**
   * Release devices on unmount.
   *
   * Without this, navigating away mid-interview leaves the camera light on —
   * the browser keeps the tracks alive until the tab closes.
   */
  useEffect(() => {
    return () => {
      samplerRef.current?.stop();
      void clientRef.current?.stop();
      for (const track of streamRef.current?.getTracks() ?? []) track.stop();
    };
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      const client = clientRef.current;

      const videoTrack = streamRef.current?.getVideoTracks()[0];
      setCameraSnapshot((current) => {
        const snapshot: CameraSnapshot = {
          permission: stateRef.current.media.camera,
          hasTrack: Boolean(videoTrack),
          trackEnabled: videoTrack?.enabled ?? false,
          trackLive: videoTrack?.readyState === "live",
        };
        return current.permission === snapshot.permission &&
          current.hasTrack === snapshot.hasTrack &&
          current.trackEnabled === snapshot.trackEnabled &&
          current.trackLive === snapshot.trackLive
          ? current
          : snapshot;
      });

      if (!client) return;

      const pending = client.pendingQuestion;
      const next = {
        question: pending?.text ?? null,
        // A follow-up is anything the controller chose off the back of the
        // candidate's answer, as opposed to opening a new thread.
        isFollowUp:
          pending !== null &&
          pending.intent !== "NEW_TOPIC" &&
          pending.intent !== "OPENING",
        topic: pending?.topicLabel ?? null,
        phase: client.controllerState.phase,
        plannedPhases: [
          ...new Set(client.controllerState.plan.map((topic) => topic.phase)),
        ],
      };

      setInterview((current) =>
        current.question === next.question &&
        current.isFollowUp === next.isFollowUp &&
        current.topic === next.topic &&
        current.phase === next.phase &&
        current.plannedPhases.join() === next.plannedPhases.join()
          ? current
          : next,
      );
    }, 500);
    return () => clearInterval(timer);
  }, []);

  /** Interviewer loudness, sampled from an animation frame by the meter. */
  const outputLevel = useCallback(() => clientRef.current?.outputLevel() ?? 0, []);

  /**
   * The session trace, for diagnosing a bad run.
   *
   * A function rather than state, and never rendered: reading it costs nothing
   * until something asks, and wiring 300 entries through React would put
   * socket internals one careless JSX line away from the candidate's screen.
   * The client bounds the buffer, so this cannot grow without limit.
   */
  const devTrace = useCallback(() => clientRef.current?.devTrace ?? [], []);

  const elapsedMs = useMemo(
    () => (liveStartedAtMs === null ? 0 : Date.now() - liveStartedAtMs),
    [liveStartedAtMs],
  );

  return {
    state,
    interview,
    liveStartedAtMs,
    cameraState: cameraStateFrom(cameraSnapshot),
    outputLevel,
    elapsedMs,
    requestPermissions,
    attachPreview,
    devTrace,
    start,
    retry,
    stop,
    toggleMic,
    toggleSpeaker,
    toggleCamera,
  };
}
