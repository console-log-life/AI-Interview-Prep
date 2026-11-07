import type { MediaPermission } from "@/lib/ai/live/types";

/**
 * Camera state — one derivation, used by every part of the room.
 *
 * This exists because a browser session showed the preview panel saying
 * "Camera off" while the control below it said "Camera on" and the URL said
 * `video=on`. Three places were each deciding what the camera was doing from
 * different inputs, and one of them was labelled with the *action* while
 * another was labelled with the *state*.
 *
 * So: a single function, derived from the actual track, and one labelling
 * convention. The panel and the badge state what IS; the button states what
 * pressing it WILL DO. Those are different strings on purpose, and the type
 * makes it impossible for them to disagree about the underlying fact.
 */

export type CameraState =
  /** Permission resolved, track live and enabled. Video should render. */
  | "CAMERA_ON"
  /** Track exists but the candidate switched it off. */
  | "CAMERA_OFF"
  /** getUserMedia is still in flight. */
  | "CAMERA_REQUESTING"
  /** Permission denied. */
  | "CAMERA_ERROR"
  /** No camera on the device, or the track ended. */
  | "CAMERA_UNAVAILABLE";

/**
 * What the room knows about the video track right now.
 *
 * Deliberately a snapshot of real track properties rather than a UI flag: a
 * camera unplugged mid-interview ends its track, and any state derived from a
 * boolean the UI set earlier would keep claiming the camera works.
 */
export type CameraSnapshot = {
  permission: MediaPermission;
  /** A video track is attached to the session's stream. */
  hasTrack: boolean;
  /** `track.enabled` — false when the candidate turned the camera off. */
  trackEnabled: boolean;
  /** `track.readyState === "live"`. False once the device goes away. */
  trackLive: boolean;
};

export function cameraStateFrom(snapshot: CameraSnapshot): CameraState {
  if (snapshot.permission === "unknown") return "CAMERA_REQUESTING";
  if (snapshot.permission === "denied") return "CAMERA_ERROR";
  if (snapshot.permission === "unavailable") return "CAMERA_UNAVAILABLE";

  // Granted, but the hardware may still have gone away since.
  if (!snapshot.hasTrack || !snapshot.trackLive) return "CAMERA_UNAVAILABLE";
  return snapshot.trackEnabled ? "CAMERA_ON" : "CAMERA_OFF";
}

/** Whether the `<video>` element should be showing a picture. */
export function cameraIsRendering(state: CameraState): boolean {
  return state === "CAMERA_ON";
}

/** What the camera IS. Used by the panel and the name plate. */
export const CAMERA_STATUS_LABEL: Record<CameraState, string> = {
  CAMERA_ON: "Camera on",
  CAMERA_OFF: "Camera off",
  CAMERA_REQUESTING: "Starting camera…",
  CAMERA_ERROR: "Camera blocked",
  CAMERA_UNAVAILABLE: "Camera unavailable",
};

/** Why, in one line, when the picture is missing. Empty when it is showing. */
export const CAMERA_STATUS_DETAIL: Record<CameraState, string> = {
  CAMERA_ON: "",
  CAMERA_OFF: "Your interview continues in audio.",
  CAMERA_REQUESTING: "Waiting for camera access…",
  CAMERA_ERROR:
    "Allow camera access in your browser to turn the camera on. The interview continues in audio.",
  CAMERA_UNAVAILABLE: "The interview continues in audio only.",
};

/**
 * What pressing the button WILL DO.
 *
 * The opposite of the status label, and never the same string — a control that
 * reads "Camera off" beside a panel that reads "Camera off" is unreadable,
 * because one is a state and the other is an instruction.
 */
export function cameraActionLabel(state: CameraState): string {
  return state === "CAMERA_ON" ? "Turn camera off" : "Turn camera on";
}

/** The control is only meaningful when there is a track to toggle. */
export function cameraToggleEnabled(state: CameraState): boolean {
  return state === "CAMERA_ON" || state === "CAMERA_OFF";
}
