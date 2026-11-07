"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { apiPost } from "@/lib/api/client";
import {
  cameraCheck,
  classifyMediaError,
  connectionCheck,
  environmentCheck,
  microphoneCheck,
  speakerCheck,
  type CameraObservation,
  type ConnectionObservation,
  type DeviceCheckResult,
  type DeviceOption,
  type EnvironmentObservation,
  type MicrophoneObservation,
  type SpeakerObservation,
} from "@/lib/devices/checks";
import { buildTestTone } from "@/lib/devices/test-tone";

/**
 * Runs the pre-interview device and environment check.
 *
 * Every effect in here exists to produce one *observation*; what an
 * observation means is decided by the pure functions in `lib/devices/checks`.
 * That split is deliberate — the interesting part of this feature is the
 * honesty of the verdicts, and verdicts trapped inside a hook cannot be tested
 * without a browser.
 *
 * The hook also owns the preview stream for the whole screen. Opening a second
 * capture for the level meter is the usual way this ends up leaving a camera
 * light on after navigation.
 */

/** Frames the camera must deliver before it counts as working. */
const FRAMES_REQUIRED = 1;

type MediaErrorName = CameraObservation["error"];

export type DeviceCheckState = {
  results: DeviceCheckResult[];
  cameras: DeviceOption[];
  microphones: DeviceOption[];
  speakers: DeviceOption[];
  selectedCamera: string | null;
  selectedMicrophone: string | null;
  selectedSpeaker: string | null;
  level: number;
  speakerTesting: boolean;
  outputSelectionSupported: boolean;
  screenDetailsSupported: boolean;
  started: boolean;
};

export function useDeviceCheck(interviewId: string) {
  const [cameras, setCameras] = useState<DeviceOption[]>([]);
  const [microphones, setMicrophones] = useState<DeviceOption[]>([]);
  const [speakers, setSpeakers] = useState<DeviceOption[]>([]);
  const [selectedCamera, setSelectedCamera] = useState<string | null>(null);
  const [selectedMicrophone, setSelectedMicrophone] = useState<string | null>(null);
  const [selectedSpeaker, setSelectedSpeaker] = useState<string | null>(null);

  const [camera, setCamera] = useState<CameraObservation>({
    trackLive: false,
    framesSeen: 0,
  });
  const [microphone, setMicrophone] = useState<MicrophoneObservation>({
    trackLive: false,
    peakLevel: 0,
  });
  const [speaker, setSpeaker] = useState<SpeakerObservation>({
    attempted: false,
    played: false,
    confirmed: null,
    outputSelectionSupported: false,
  });
  const [connection, setConnection] = useState<ConnectionObservation>({
    online: true,
    probe: "idle",
  });
  const [environment, setEnvironment] = useState<EnvironmentObservation>({
    screenDetailsSupported: false,
    screenCount: null,
    permission: "unsupported",
    videoInputs: 0,
    audioInputs: 0,
  });

  const [level, setLevel] = useState(0);
  const [speakerTesting, setSpeakerTesting] = useState(false);
  const [started, setStarted] = useState(false);

  const streamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const rafRef = useRef(0);
  const frameStopRef = useRef<(() => void) | null>(null);
  const toneUrlRef = useRef<string | null>(null);

  const outputSelectionSupported = useMemo(
    () =>
      typeof window !== "undefined" &&
      typeof HTMLMediaElement !== "undefined" &&
      "setSinkId" in HTMLMediaElement.prototype,
    [],
  );

  const screenDetailsSupported = useMemo(
    () => typeof window !== "undefined" && "getScreenDetails" in window,
    [],
  );

  // --- device enumeration --------------------------------------------------

  const enumerate = useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.enumerateDevices) {
      return;
    }
    const devices = await navigator.mediaDevices.enumerateDevices();
    const pick = (kind: DeviceOption["kind"]) =>
      devices
        .filter((device) => device.kind === kind)
        .map((device) => ({
          deviceId: device.deviceId,
          label: device.label,
          kind,
        }));

    const video = pick("videoinput");
    const audioIn = pick("audioinput");
    const audioOut = pick("audiooutput");

    setCameras(video);
    setMicrophones(audioIn);
    setSpeakers(audioOut);
    setEnvironment((current) => ({
      ...current,
      videoInputs: video.length,
      audioInputs: audioIn.length,
    }));
  }, []);

  // --- media ---------------------------------------------------------------

  const releaseStream = useCallback(() => {
    frameStopRef.current?.();
    frameStopRef.current = null;
    cancelAnimationFrame(rafRef.current);
    for (const track of streamRef.current?.getTracks() ?? []) track.stop();
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  /**
   * Counts frames actually delivered.
   *
   * A live track is not a working camera: one held by another application
   * commonly yields a track that never produces a frame, which is exactly the
   * case that must not read as "Ready". `requestVideoFrameCallback` reports
   * real presented frames; where it is missing, an advancing `currentTime` is
   * the next best evidence.
   */
  const countFrames = useCallback((video: HTMLVideoElement) => {
    frameStopRef.current?.();

    type WithRvfc = HTMLVideoElement & {
      requestVideoFrameCallback?: (cb: () => void) => number;
      cancelVideoFrameCallback?: (handle: number) => void;
    };
    const element = video as WithRvfc;

    if (typeof element.requestVideoFrameCallback === "function") {
      let handle = 0;
      let cancelled = false;
      const tick = () => {
        if (cancelled) return;
        setCamera((current) => ({ ...current, framesSeen: current.framesSeen + 1 }));
        handle = element.requestVideoFrameCallback!(tick);
      };
      handle = element.requestVideoFrameCallback(tick);
      frameStopRef.current = () => {
        cancelled = true;
        element.cancelVideoFrameCallback?.(handle);
      };
      return;
    }

    let lastTime = -1;
    const timer = setInterval(() => {
      if (video.currentTime > lastTime) {
        lastTime = video.currentTime;
        setCamera((current) => ({ ...current, framesSeen: current.framesSeen + 1 }));
      }
    }, 250);
    frameStopRef.current = () => clearInterval(timer);
  }, []);

  /** Live input meter, so "microphone working" is demonstrated, not asserted. */
  const meter = useCallback((stream: MediaStream) => {
    cancelAnimationFrame(rafRef.current);
    const context = audioContextRef.current ?? new AudioContext();
    audioContextRef.current = context;

    const analyser = context.createAnalyser();
    analyser.fftSize = 512;
    context.createMediaStreamSource(stream).connect(analyser);

    const data = new Uint8Array(analyser.frequencyBinCount);
    const tick = () => {
      analyser.getByteTimeDomainData(data);
      let peak = 0;
      for (const value of data) peak = Math.max(peak, Math.abs(value - 128));
      const normalized = Math.min(100, (peak / 128) * 200);
      setLevel(normalized);
      // Peak is retained, not sampled: the check asks "have we ever heard
      // you", and a level that has dropped back to zero between words must not
      // undo a microphone that already proved itself.
      setMicrophone((current) =>
        normalized > current.peakLevel ? { ...current, peakLevel: normalized } : current,
      );
      rafRef.current = requestAnimationFrame(tick);
    };
    tick();
  }, []);

  const openDevices = useCallback(
    async (options?: { cameraId?: string | null; microphoneId?: string | null }) => {
      setStarted(true);
      releaseStream();
      setCamera({ trackLive: false, framesSeen: 0 });
      setMicrophone({ trackLive: false, peakLevel: 0 });

      if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
        setCamera({ trackLive: false, framesSeen: 0, error: "unsupported" });
        setMicrophone({ trackLive: false, peakLevel: 0, error: "unsupported" });
        return;
      }

      const cameraId = options?.cameraId ?? selectedCamera;
      const microphoneId = options?.microphoneId ?? selectedMicrophone;

      // Audio and video are requested separately, so a candidate with no
      // camera still gets a working microphone rather than one rejection that
      // takes both down.
      let audioError: MediaErrorName;
      let stream: MediaStream | null = null;

      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            ...(microphoneId ? { deviceId: { exact: microphoneId } } : {}),
          },
        });
      } catch (error) {
        audioError = classifyMediaError((error as DOMException | undefined)?.name);
      }

      let videoError: MediaErrorName;
      try {
        const video = await navigator.mediaDevices.getUserMedia({
          video: cameraId
            ? { deviceId: { exact: cameraId }, width: { ideal: 640 } }
            : { width: { ideal: 640 }, facingMode: "user" },
        });
        if (stream) {
          for (const track of video.getVideoTracks()) stream.addTrack(track);
        } else {
          stream = video;
        }
      } catch (error) {
        videoError = classifyMediaError((error as DOMException | undefined)?.name);
      }

      streamRef.current = stream;

      setMicrophone({
        trackLive: (stream?.getAudioTracks().length ?? 0) > 0,
        peakLevel: 0,
        error: audioError,
      });
      setCamera({
        trackLive: (stream?.getVideoTracks().length ?? 0) > 0,
        framesSeen: 0,
        error: videoError,
      });

      if (!stream) return;

      // Labels are only populated once permission has been granted, so the
      // device lists are worth rebuilding now.
      await enumerate();

      const activeAudio = stream.getAudioTracks()[0]?.getSettings().deviceId;
      const activeVideo = stream.getVideoTracks()[0]?.getSettings().deviceId;
      if (activeAudio) setSelectedMicrophone(activeAudio);
      if (activeVideo) setSelectedCamera(activeVideo);

      if (stream.getAudioTracks().length > 0) meter(stream);

      if (videoRef.current && stream.getVideoTracks().length > 0) {
        videoRef.current.srcObject = stream;
        videoRef.current.muted = true;
        await videoRef.current.play().catch(() => undefined);
        countFrames(videoRef.current);
      }
    },
    [countFrames, enumerate, meter, releaseStream, selectedCamera, selectedMicrophone],
  );

  const attachPreview = useCallback((element: HTMLVideoElement | null) => {
    videoRef.current = element;
    if (element && streamRef.current) {
      element.srcObject = streamRef.current;
      element.muted = true;
      void element.play().catch(() => undefined);
    }
  }, []);

  // --- speaker -------------------------------------------------------------

  const testSpeaker = useCallback(async () => {
    setSpeakerTesting(true);
    setSpeaker((current) => ({
      ...current,
      attempted: true,
      played: false,
      confirmed: null,
      outputSelectionSupported,
    }));

    try {
      if (!toneUrlRef.current) {
        toneUrlRef.current = URL.createObjectURL(buildTestTone());
      }
      const audio = new Audio(toneUrlRef.current);

      type WithSink = HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> };
      if (selectedSpeaker && typeof (audio as WithSink).setSinkId === "function") {
        await (audio as WithSink).setSinkId!(selectedSpeaker).catch(() => undefined);
      }

      await new Promise<void>((resolve, reject) => {
        audio.onended = () => resolve();
        audio.onerror = () => reject(new Error("playback failed"));
        void audio.play().catch(reject);
      });

      setSpeaker((current) => ({ ...current, played: true }));
    } catch {
      setSpeaker((current) => ({ ...current, played: false }));
    } finally {
      setSpeakerTesting(false);
    }
  }, [outputSelectionSupported, selectedSpeaker]);

  const confirmSpeaker = useCallback((heard: boolean) => {
    setSpeaker((current) => ({ ...current, confirmed: heard }));
  }, []);

  // --- connection ----------------------------------------------------------

  const testConnection = useCallback(async () => {
    setConnection((current) => ({ ...current, probe: "checking" }));
    try {
      const result = await apiPost<{
        configured: boolean;
        reachable: boolean;
        latencyMs: number | null;
      }>(`/api/interviews/${interviewId}/live/probe`);

      setConnection({
        online: navigator.onLine,
        probe: !result.configured ? "unconfigured" : result.reachable ? "ok" : "failed",
        latencyMs: result.latencyMs ?? undefined,
      });
    } catch {
      setConnection({ online: navigator.onLine, probe: "failed" });
    }
  }, [interviewId]);

  // --- environment ---------------------------------------------------------

  /**
   * Asks the window system how many displays it knows about.
   *
   * Requires a user gesture and an explicit permission, and is unavailable
   * outside Chromium. All three of those outcomes are reported as *limited*
   * rather than as a pass, because the browser genuinely does not know.
   */
  const checkDisplays = useCallback(async () => {
    if (!screenDetailsSupported) {
      setEnvironment((current) => ({ ...current, permission: "unsupported" }));
      return;
    }
    try {
      type WithScreens = Window & {
        getScreenDetails: () => Promise<{ screens: unknown[] }>;
      };
      const details = await (window as unknown as WithScreens).getScreenDetails();
      setEnvironment((current) => ({
        ...current,
        screenDetailsSupported: true,
        permission: "granted",
        screenCount: details.screens.length,
      }));
    } catch {
      setEnvironment((current) => ({
        ...current,
        screenDetailsSupported: true,
        permission: "denied",
        screenCount: null,
      }));
    }
  }, [screenDetailsSupported]);

  // --- lifecycle -----------------------------------------------------------

  useEffect(() => {
    setEnvironment((current) => ({
      ...current,
      screenDetailsSupported,
      permission: screenDetailsSupported ? "prompt" : "unsupported",
    }));
    setSpeaker((current) => ({ ...current, outputSelectionSupported }));
    setConnection((current) => ({ ...current, online: navigator.onLine }));
    void enumerate();
  }, [enumerate, outputSelectionSupported, screenDetailsSupported]);

  // Devices coming and going while the candidate is on this screen.
  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices) return;
    const onChange = () => void enumerate();
    navigator.mediaDevices.addEventListener("devicechange", onChange);
    return () => navigator.mediaDevices.removeEventListener("devicechange", onChange);
  }, [enumerate]);

  useEffect(() => {
    const update = () => setConnection((current) => ({ ...current, online: navigator.onLine }));
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  useEffect(
    () => () => {
      releaseStream();
      void audioContextRef.current?.close().catch(() => undefined);
      if (toneUrlRef.current) URL.revokeObjectURL(toneUrlRef.current);
    },
    [releaseStream],
  );

  const results = useMemo<DeviceCheckResult[]>(
    () => [
      cameraCheck({ ...camera, framesSeen: Math.min(camera.framesSeen, 9999) }),
      microphoneCheck(microphone),
      speakerCheck(speaker),
      connectionCheck(connection),
      environmentCheck(environment),
    ],
    [camera, microphone, speaker, connection, environment],
  );

  return {
    state: {
      results,
      cameras,
      microphones,
      speakers,
      selectedCamera,
      selectedMicrophone,
      selectedSpeaker,
      level,
      speakerTesting,
      outputSelectionSupported,
      screenDetailsSupported,
      started,
    } satisfies DeviceCheckState,
    attachPreview,
    openDevices,
    selectCamera: (deviceId: string) => {
      setSelectedCamera(deviceId);
      void openDevices({ cameraId: deviceId });
    },
    selectMicrophone: (deviceId: string) => {
      setSelectedMicrophone(deviceId);
      void openDevices({ microphoneId: deviceId });
    },
    selectSpeaker: setSelectedSpeaker,
    testSpeaker,
    confirmSpeaker,
    testConnection,
    checkDisplays,
    releaseStream,
    framesRequired: FRAMES_REQUIRED,
  };
}
