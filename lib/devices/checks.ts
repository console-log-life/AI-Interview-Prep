/**
 * Device and environment check — pure logic, no browser APIs.
 *
 * The rule that shapes this file: **a check reports what was observed, never
 * what was assumed.** "A camera device is listed" is not "the camera works";
 * only frames actually arriving proves that. And where the browser genuinely
 * cannot answer a question — how many monitors are attached, which physical
 * device a label refers to — the honest result is a *limited* one, not a
 * confident one. A check that reassures the candidate falsely is worse than no
 * check at all, because they only find out during the interview.
 *
 * Effects (getUserMedia, enumerateDevices, playback) live in the hook; this
 * module decides what those observations mean.
 */

export type CheckStatus =
  /** Not run yet. */
  | "PENDING"
  /** Running, or waiting on the candidate to do something. */
  | "CHECKING"
  /** Observed working. */
  | "READY"
  /** Observed not working. */
  | "FAILED"
  /** The browser cannot verify this. Not a pass and not a failure. */
  | "LIMITED";

export type DeviceCheckId =
  | "camera"
  | "microphone"
  | "speaker"
  | "connection"
  | "environment";

export type DeviceCheckResult = {
  id: DeviceCheckId;
  status: CheckStatus;
  /** One line the candidate reads. Specific, never reassuring by default. */
  detail: string;
  /** Concrete next step when something failed. */
  recovery?: string;
  /** True when the status is LIMITED because the browser withheld information. */
  browserLimited?: boolean;
};

export const CHECK_LABEL: Record<DeviceCheckId, string> = {
  camera: "Camera",
  microphone: "Microphone",
  speaker: "Speaker",
  connection: "Connection",
  environment: "Display & environment",
};

/** A device as the browser exposes it. Labels are empty until permission is granted. */
export type DeviceOption = {
  deviceId: string;
  label: string;
  kind: "videoinput" | "audioinput" | "audiooutput";
};

/**
 * Display name for a device.
 *
 * Before permission is granted browsers return an empty label, and even
 * afterwards the label is a vendor string that does not reliably distinguish a
 * built-in webcam from an external one. Guessing at that distinction is
 * exactly the fabricated detection this feature must not do, so an unlabelled
 * device is numbered rather than described.
 */
export function deviceLabel(device: DeviceOption, index: number): string {
  const label = device.label.trim();
  if (label) return label;
  const noun =
    device.kind === "videoinput"
      ? "Camera"
      : device.kind === "audioinput"
        ? "Microphone"
        : "Speaker";
  return `${noun} ${index + 1}`;
}

// ---------------------------------------------------------------------------
// Individual checks
// ---------------------------------------------------------------------------

export type MediaError = "denied" | "not-found" | "in-use" | "unsupported" | "other";

export type CameraObservation = {
  /** Did getUserMedia resolve with a live video track? */
  trackLive: boolean;
  /** Frames actually painted from the stream. Zero means a black preview. */
  framesSeen: number;
  /** Set when getUserMedia rejected. */
  error?: MediaError;
};

/**
 * Camera.
 *
 * Requires frames, not a track. A camera claimed by another application often
 * yields a live-looking track that never produces a frame, and that is the
 * failure candidates hit most in practice.
 */
export function cameraCheck(observation: CameraObservation): DeviceCheckResult {
  if (observation.error) {
    return {
      id: "camera",
      status: "FAILED",
      detail: CAMERA_ERROR_DETAIL[observation.error],
      recovery: CAMERA_ERROR_RECOVERY[observation.error],
    };
  }

  if (!observation.trackLive) {
    return {
      id: "camera",
      status: "FAILED",
      detail: "No camera stream.",
      recovery: "Select a different camera, or continue without video.",
    };
  }

  if (observation.framesSeen === 0) {
    return {
      id: "camera",
      status: "FAILED",
      detail: "The camera opened but sent no picture.",
      recovery:
        "Another app may be holding the camera. Close Zoom, Teams or Meet, then re-check.",
    };
  }

  return {
    id: "camera",
    status: "READY",
    detail: `Receiving video (${observation.framesSeen} frames seen).`,
  };
}

const CAMERA_ERROR_DETAIL: Record<MediaError, string> = {
  denied: "Camera permission was denied.",
  "not-found": "No camera was found on this device.",
  "in-use": "The camera is being used by another application.",
  unsupported: "This browser cannot open a camera.",
  other: "The camera could not be started.",
};

const CAMERA_ERROR_RECOVERY: Record<MediaError, string> = {
  denied:
    "Open the padlock in the address bar, allow camera access, then re-check. The interview can also run audio-only.",
  "not-found": "The interview will run audio-only, which is fully supported.",
  "in-use": "Close Zoom, Teams, Meet or any other app using the camera, then re-check.",
  unsupported: "Try a recent Chrome, Edge or Safari, or continue audio-only.",
  other: "Re-check, pick a different camera, or continue audio-only.",
};

export type MicrophoneObservation = {
  trackLive: boolean;
  /** Highest input level seen, 0-100. Zero means a connected but silent mic. */
  peakLevel: number;
  error?: MediaError;
};

/** Peak level, 0-100, above which input is loud enough to rely on. */
export const MIC_AUDIBLE_LEVEL = 8;

/**
 * Microphone.
 *
 * READY needs measured input. A muted or dead microphone produces a perfectly
 * healthy-looking track, so "permission granted" alone would admit a candidate
 * to an interview that cannot hear them — the worst failure this screen exists
 * to prevent.
 */
export function microphoneCheck(observation: MicrophoneObservation): DeviceCheckResult {
  if (observation.error) {
    return {
      id: "microphone",
      status: "FAILED",
      detail: MIC_ERROR_DETAIL[observation.error],
      recovery: MIC_ERROR_RECOVERY[observation.error],
    };
  }

  if (!observation.trackLive) {
    return {
      id: "microphone",
      status: "FAILED",
      detail: "No microphone stream.",
      recovery: "Select a different microphone and re-check.",
    };
  }

  if (observation.peakLevel <= 0) {
    return {
      id: "microphone",
      status: "CHECKING",
      detail: "Connected — say something so we can confirm we hear you.",
    };
  }

  if (observation.peakLevel < MIC_AUDIBLE_LEVEL) {
    return {
      id: "microphone",
      status: "CHECKING",
      detail: "We can hear something, but it is very quiet. Keep speaking.",
      recovery:
        "Move closer to the microphone, or raise the input level in your system sound settings.",
    };
  }

  return { id: "microphone", status: "READY", detail: "We can hear you." };
}

const MIC_ERROR_DETAIL: Record<MediaError, string> = {
  denied: "Microphone permission was denied.",
  "not-found": "No microphone was found on this device.",
  "in-use": "The microphone is being used by another application.",
  unsupported: "This browser cannot open a microphone.",
  other: "The microphone could not be started.",
};

const MIC_ERROR_RECOVERY: Record<MediaError, string> = {
  denied:
    "Open the padlock in the address bar, allow microphone access, then re-check. Without it, use the chat interview.",
  "not-found":
    "Plug in a microphone or headset, then re-check. The chat interview needs no microphone.",
  "in-use": "Close any other app using the microphone, then re-check.",
  unsupported: "Try a recent Chrome, Edge or Safari, or use the chat interview.",
  other: "Re-check, pick a different microphone, or use the chat interview.",
};

export type SpeakerObservation = {
  /** Did the candidate press Test? Nothing is claimed until they do. */
  attempted: boolean;
  /** Did playback actually run without throwing? */
  played: boolean;
  /** Did the candidate confirm they heard it? Null while unanswered. */
  confirmed: boolean | null;
  /** Whether this browser exposes setSinkId for output-device selection. */
  outputSelectionSupported: boolean;
};

/**
 * Speaker.
 *
 * The browser can prove audio was *played*; only the candidate can confirm it
 * was *heard*. So playback alone is not a pass — READY requires the candidate
 * to say yes. Claiming a working speaker on the strength of a promise that did
 * not reject is precisely the fabrication to avoid.
 */
export function speakerCheck(observation: SpeakerObservation): DeviceCheckResult {
  const limitNote = observation.outputSelectionSupported
    ? ""
    : " Speaker device selection is limited by this browser.";

  if (!observation.attempted) {
    return {
      id: "speaker",
      status: "PENDING",
      detail: `Play the test sound to check your speakers.${limitNote}`,
    };
  }

  if (!observation.played) {
    return {
      id: "speaker",
      status: "FAILED",
      detail: "The test sound could not be played.",
      recovery:
        "Check your system volume and output device, then test again. Some browsers block audio until you interact with the page.",
    };
  }

  if (observation.confirmed === null) {
    return {
      id: "speaker",
      status: "CHECKING",
      detail: `Test sound played — did you hear it?${limitNote}`,
    };
  }

  if (!observation.confirmed) {
    return {
      id: "speaker",
      status: "FAILED",
      detail: "You reported not hearing the test sound.",
      recovery: observation.outputSelectionSupported
        ? "Pick a different output device and test again, or raise your system volume."
        : "This browser cannot switch output devices. Change your default output in your system sound settings, then test again.",
    };
  }

  return {
    id: "speaker",
    status: "READY",
    detail: `You confirmed you heard the test sound.${limitNote}`,
    browserLimited: !observation.outputSelectionSupported,
  };
}

export type ConnectionObservation = {
  /** navigator.onLine. False is conclusive; true is not. */
  online: boolean;
  probe: "idle" | "checking" | "ok" | "failed" | "unconfigured";
  /** Round trip of the probe, when it succeeded. */
  latencyMs?: number;
};

/**
 * Realtime connection.
 *
 * The probe asks the server to mint a real short-lived credential against the
 * live service, so READY means the service actually answered — not that a
 * config flag is set somewhere.
 */
export function connectionCheck(observation: ConnectionObservation): DeviceCheckResult {
  if (!observation.online) {
    return {
      id: "connection",
      status: "FAILED",
      detail: "This device reports it is offline.",
      recovery: "Reconnect to the internet and check again.",
    };
  }

  switch (observation.probe) {
    case "idle":
      return { id: "connection", status: "PENDING", detail: "Not checked yet." };
    case "checking":
      return {
        id: "connection",
        status: "CHECKING",
        detail: "Contacting the interview service…",
      };
    case "unconfigured":
      return {
        id: "connection",
        status: "FAILED",
        detail: "Realtime interviews are not available on this deployment.",
        recovery: "Use the chat interview instead — it needs no realtime connection.",
      };
    case "failed":
      return {
        id: "connection",
        status: "FAILED",
        detail: "The interview service did not respond.",
        recovery: "Retry, or use the chat interview instead.",
      };
    case "ok":
      return {
        id: "connection",
        status: "READY",
        detail:
          observation.latencyMs === undefined
            ? "Interview service reachable."
            : `Interview service reachable (${observation.latencyMs} ms).`,
      };
  }
}

export type EnvironmentObservation = {
  /** Window Management API present. Absent on Firefox and Safari. */
  screenDetailsSupported: boolean;
  /** Screens reported, when permission was granted. Null means not known. */
  screenCount: number | null;
  /** Permission outcome for window management, when it was requested. */
  permission: "granted" | "denied" | "prompt" | "unsupported";
  videoInputs: number;
  audioInputs: number;
};

/**
 * Display and environment.
 *
 * Deliberately weak, and says so. A browser cannot enumerate the physical
 * hardware in a room; with permission it can report how many displays the
 * window system knows about, and that is all. Anything further — "no second
 * monitor", "no phone on the desk" — would be a claim the platform cannot
 * support, so it is never made. The status stays LIMITED whenever the browser
 * withheld information, and even the single-display case is marked limited
 * because absence of evidence is not evidence of absence.
 */
export function environmentCheck(observation: EnvironmentObservation): DeviceCheckResult {
  const devices = `${observation.videoInputs} camera${
    observation.videoInputs === 1 ? "" : "s"
  } and ${observation.audioInputs} microphone${
    observation.audioInputs === 1 ? "" : "s"
  } detected.`;

  if (!observation.screenDetailsSupported || observation.permission === "unsupported") {
    return {
      id: "environment",
      status: "LIMITED",
      detail: `${devices} Display verification is limited by browser privacy restrictions.`,
      browserLimited: true,
    };
  }

  if (observation.permission === "denied") {
    return {
      id: "environment",
      status: "LIMITED",
      detail: `${devices} Display permission was declined, so the number of screens is unknown.`,
      browserLimited: true,
    };
  }

  if (observation.permission === "prompt" || observation.screenCount === null) {
    return {
      id: "environment",
      status: "LIMITED",
      detail: `${devices} Screen count not checked.`,
      browserLimited: true,
    };
  }

  if (observation.screenCount > 1) {
    return {
      id: "environment",
      status: "LIMITED",
      detail: `${devices} ${observation.screenCount} displays detected. For a realistic interview, keep the interview on your primary display and avoid using other screens.`,
      browserLimited: true,
    };
  }

  return {
    id: "environment",
    status: "READY",
    detail: `${devices} One display detected. The browser cannot verify anything beyond what it can see.`,
    browserLimited: true,
  };
}

// ---------------------------------------------------------------------------
// Aggregate
// ---------------------------------------------------------------------------

/**
 * Whether the candidate may join.
 *
 * Two things are genuinely required: a microphone that has been heard, and a
 * reachable service. A camera is optional because audio-only is a real
 * supported mode, and the environment check is advisory by construction — it
 * can never be a gate, because it can never be conclusive.
 */
export function canJoin(results: DeviceCheckResult[]): boolean {
  const status = (id: DeviceCheckId) => results.find((r) => r.id === id)?.status;
  return status("microphone") === "READY" && status("connection") === "READY";
}

/** Why the join button is disabled, phrased as the next thing to do. */
export function blockingReason(results: DeviceCheckResult[]): string | null {
  const find = (id: DeviceCheckId) => results.find((r) => r.id === id);

  const mic = find("microphone");
  if (mic?.status !== "READY") {
    return mic?.status === "FAILED"
      ? "A working microphone is required for a mock interview."
      : "Speak for a moment so we can confirm your microphone works.";
  }

  const connection = find("connection");
  if (connection?.status !== "READY") {
    return connection?.status === "FAILED"
      ? "The interview service is not reachable."
      : "Checking the interview service…";
  }

  return null;
}

/** Whether the room should be entered with video on. */
export function videoEnabled(results: DeviceCheckResult[]): boolean {
  return results.find((r) => r.id === "camera")?.status === "READY";
}

/** Maps a DOMException from getUserMedia onto our vocabulary. */
export function classifyMediaError(name: string | undefined): MediaError {
  switch (name) {
    case "NotAllowedError":
    case "SecurityError":
      return "denied";
    case "NotFoundError":
    case "OverconstrainedError":
      return "not-found";
    case "NotReadableError":
    case "AbortError":
      return "in-use";
    case "TypeError":
      return "unsupported";
    default:
      return "other";
  }
}
