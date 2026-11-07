/**
 * Visual presentation analysis — pure aggregation over sampled frames.
 *
 * The camera in a mock interview is not decoration, but what it can honestly
 * support is narrower than it first appears. This module exists to hold that
 * line. Three rules:
 *
 * 1. **Every number traces to a measurement.** Face visibility is the fraction
 *    of sampled frames in which a detector returned a face. Nothing here is
 *    inferred from "it looked like a normal interview".
 * 2. **Bands, not false precision.** "Eye contact 87.4%" implies a gaze
 *    estimate no browser API provides. What we have is head orientation from
 *    landmark geometry, which supports "mostly facing the camera" and not much
 *    more, so that is what is reported.
 * 3. **Observation is separated from interpretation.** "Your face left the
 *    frame in a third of samples" is measured. "You seemed nervous" is not
 *    measurable at all and is never produced.
 *
 * When the browser lacks face detection the summary degrades to lighting and
 * stability, and says so — rather than quietly reporting a weaker metric under
 * the same name.
 */

/** What the browser was actually able to measure. */
export type VisualCapability =
  /** Frames sampled and a face detector was available. */
  | "FULL"
  /** Frames sampled, but no face detection in this browser. */
  | "FRAME_ONLY"
  /** No usable frames: camera off, denied, or absent. */
  | "UNAVAILABLE";

export type FaceObservation = {
  /** Bounding-box centre, normalized 0-1 in frame coordinates. */
  centerX: number;
  centerY: number;
  /** Box area as a fraction of the frame. Proxy for distance from camera. */
  areaRatio: number;
  /**
   * Horizontal offset of the nose from the midpoint of the eyes, divided by
   * inter-eye distance. Zero is symmetric; larger magnitude means the head is
   * turned. A proxy for yaw, not a gaze estimate — null when the detector
   * returned no landmarks.
   */
  yawRatio: number | null;
  eyesVisible: boolean;
};

export type VisualSample = {
  /** Offset from session start. */
  atMs: number;
  /** Mean luminance 0-1 of the downscaled frame. */
  luminance: number;
  /** Mean absolute inter-frame difference 0-1. Camera or subject movement. */
  motion: number;
  /** Null when face detection is unavailable or found nothing this frame. */
  face: FaceObservation | null;
};

export type EngagementBand =
  | "CONSISTENT"
  | "MOSTLY_CONSISTENT"
  | "INCONSISTENT"
  | "FREQUENTLY_DIVERTED";

export type FramingBand = "WELL_FRAMED" | "OFF_CENTRE" | "TOO_CLOSE" | "TOO_FAR";
export type LightingBand = "GOOD" | "DIM" | "OVEREXPOSED";
export type StabilityBand = "STEADY" | "SOME_MOVEMENT" | "UNSTABLE";

export type VisualSummary = {
  capability: VisualCapability;
  /** Frames actually analysed. */
  samples: number;
  /** Span the samples cover. */
  durationMs: number;
  /** Fraction of samples containing a detected face. Null without detection. */
  faceVisibleRatio: number | null;
  /**
   * Of the frames where a face was found, the fraction where the head was
   * oriented roughly toward the camera. Null when landmarks were unavailable —
   * in that case face presence is reported but engagement is not.
   */
  cameraEngagementRatio: number | null;
  engagementBand: EngagementBand | null;
  framingBand: FramingBand | null;
  lightingBand: LightingBand | null;
  stabilityBand: StabilityBand | null;
  /** Descriptive, evidence-bearing lines. Never interpretive. */
  observations: string[];
  /** What could not be measured, and why. Always accurate, never empty-by-luck. */
  limitations: string[];
};

/**
 * Frames required before any face-derived figure is reported.
 *
 * At the 2 fps sampling rate this is about fifteen seconds of camera time.
 * Below it, a ratio is arithmetic rather than evidence: three frames out of
 * four is "75% engagement" and means nothing.
 */
export const MIN_SAMPLES = 30;

/**
 * Yaw magnitude beyond which the head is treated as turned away.
 *
 * Nose offset of a third of the inter-eye distance is a clearly visible turn,
 * well outside the jitter of a detector tracking a still head. Chosen to be
 * forgiving: the cost of a false "diverted" is telling a candidate off for
 * looking at their own notes once.
 */
export const YAW_TOWARD_CAMERA = 0.35;

const DIM_LUMINANCE = 0.18;
const BRIGHT_LUMINANCE = 0.82;
const MOTION_UNSTABLE = 0.12;
const MOTION_NOTICEABLE = 0.06;

export function emptyVisualSummary(reason: string): VisualSummary {
  return {
    capability: "UNAVAILABLE",
    samples: 0,
    durationMs: 0,
    faceVisibleRatio: null,
    cameraEngagementRatio: null,
    engagementBand: null,
    framingBand: null,
    lightingBand: null,
    stabilityBand: null,
    observations: [],
    limitations: [reason],
  };
}

/**
 * Reduces sampled frames to a reportable summary.
 *
 * `detectorAvailable` is passed separately from the samples because "no face
 * was found in any frame" and "this browser cannot look for faces" are
 * completely different findings, and collapsing them would let a missing API
 * masquerade as a candidate who never appeared on camera.
 */
export function summarizeVisual(
  samples: VisualSample[],
  detectorAvailable: boolean,
): VisualSummary {
  if (samples.length === 0) {
    return emptyVisualSummary(
      "No camera frames were analysed, so there is no visual analysis for this interview.",
    );
  }

  const durationMs =
    samples.length > 1 ? samples[samples.length - 1].atMs - samples[0].atMs : 0;
  const observations: string[] = [];
  const limitations: string[] = [];

  // --- lighting and stability: available from raw pixels alone -------------
  const meanLuminance = mean(samples.map((s) => s.luminance));
  const lightingBand: LightingBand =
    meanLuminance < DIM_LUMINANCE
      ? "DIM"
      : meanLuminance > BRIGHT_LUMINANCE
        ? "OVEREXPOSED"
        : "GOOD";

  const meanMotion = mean(samples.map((s) => s.motion));
  const stabilityBand: StabilityBand =
    meanMotion > MOTION_UNSTABLE
      ? "UNSTABLE"
      : meanMotion > MOTION_NOTICEABLE
        ? "SOME_MOVEMENT"
        : "STEADY";

  if (lightingBand === "DIM") {
    observations.push(
      "The picture was consistently dark. A light facing you, rather than behind you, makes a noticeable difference to how you come across on camera.",
    );
  } else if (lightingBand === "OVEREXPOSED") {
    observations.push(
      "The picture was very bright and washed out, which usually means a window or lamp directly behind the camera.",
    );
  }

  if (stabilityBand === "UNSTABLE") {
    observations.push(
      "The image changed a great deal between frames, which happens with a handheld device or a lot of movement.",
    );
  }

  if (!detectorAvailable) {
    limitations.push(
      "This browser does not provide face detection, so camera engagement and framing could not be measured. Lighting and image stability were measured from the video itself.",
    );
    return {
      capability: "FRAME_ONLY",
      samples: samples.length,
      durationMs,
      faceVisibleRatio: null,
      cameraEngagementRatio: null,
      engagementBand: null,
      framingBand: null,
      lightingBand,
      stabilityBand,
      observations,
      limitations,
    };
  }

  // --- face-derived figures ------------------------------------------------
  const faces = samples
    .map((s) => s.face)
    .filter((face): face is FaceObservation => face !== null);

  const faceVisibleRatio = faces.length / samples.length;

  if (samples.length < MIN_SAMPLES) {
    limitations.push(
      `Only ${samples.length} camera frames were analysed, which is too few to report on camera engagement. Leaving the camera on for longer would give a usable reading.`,
    );
    return {
      capability: "FULL",
      samples: samples.length,
      durationMs,
      faceVisibleRatio: null,
      cameraEngagementRatio: null,
      engagementBand: null,
      framingBand: null,
      lightingBand,
      stabilityBand,
      observations,
      limitations,
    };
  }

  if (faces.length < MIN_SAMPLES) {
    limitations.push(
      `Your face was visible in only ${percent(faceVisibleRatio)} of sampled frames, which is not enough to assess camera engagement. In a real interview, staying in frame matters as much as what you say.`,
    );
    return {
      capability: "FULL",
      samples: samples.length,
      durationMs,
      faceVisibleRatio,
      cameraEngagementRatio: null,
      engagementBand: null,
      framingBand: null,
      lightingBand,
      stabilityBand,
      observations,
      limitations,
    };
  }

  // Engagement needs landmarks. A detector can report a box without them, and
  // a box alone says the candidate was present, not that they were looking at
  // the interviewer.
  const withYaw = faces.filter((face) => face.yawRatio !== null);
  let cameraEngagementRatio: number | null = null;
  let engagementBand: EngagementBand | null = null;

  if (withYaw.length >= MIN_SAMPLES) {
    const toward = withYaw.filter(
      (face) => Math.abs(face.yawRatio as number) <= YAW_TOWARD_CAMERA,
    ).length;
    // Scaled by presence: a candidate facing the camera whenever they are in
    // frame, but out of frame half the time, is not engaged half the time.
    cameraEngagementRatio = (toward / withYaw.length) * faceVisibleRatio;
    engagementBand = bandFor(cameraEngagementRatio);

    observations.push(
      `Your face was in frame for ${percent(faceVisibleRatio)} of sampled frames, and oriented toward the camera in ${percent(
        toward / withYaw.length,
      )} of those.`,
    );
  } else {
    limitations.push(
      "Facial landmarks were not available often enough to estimate head orientation, so camera engagement is reported as face visibility only.",
    );
    observations.push(
      `Your face was in frame for ${percent(faceVisibleRatio)} of sampled frames.`,
    );
  }

  if (faceVisibleRatio < 0.7) {
    observations.push(
      `Your face left the frame in ${percent(1 - faceVisibleRatio)} of sampled frames. On a real call the interviewer sees that as looking away.`,
    );
  }

  // --- framing -------------------------------------------------------------
  const meanX = mean(faces.map((f) => f.centerX));
  const meanY = mean(faces.map((f) => f.centerY));
  const meanArea = mean(faces.map((f) => f.areaRatio));

  let framingBand: FramingBand;
  if (meanArea > 0.35) {
    framingBand = "TOO_CLOSE";
    observations.push(
      "You filled most of the frame. Sitting back a little gives a more natural head-and-shoulders framing.",
    );
  } else if (meanArea < 0.04) {
    framingBand = "TOO_FAR";
    observations.push(
      "You appeared small in the frame. Moving closer makes expression and eye direction readable to the interviewer.",
    );
  } else if (meanX < 0.35 || meanX > 0.65 || meanY < 0.2 || meanY > 0.65) {
    framingBand = "OFF_CENTRE";
    observations.push(
      "You sat noticeably off-centre in the frame for most of the interview.",
    );
  } else {
    framingBand = "WELL_FRAMED";
  }

  limitations.push(
    "Head orientation is estimated from facial landmark geometry. It is not eye tracking, and it cannot tell where on the screen you were looking.",
  );

  return {
    capability: "FULL",
    samples: samples.length,
    durationMs,
    faceVisibleRatio,
    cameraEngagementRatio,
    engagementBand,
    framingBand,
    lightingBand,
    stabilityBand,
    observations,
    limitations,
  };
}

function bandFor(ratio: number): EngagementBand {
  if (ratio >= 0.85) return "CONSISTENT";
  if (ratio >= 0.65) return "MOSTLY_CONSISTENT";
  if (ratio >= 0.4) return "INCONSISTENT";
  return "FREQUENTLY_DIVERTED";
}

export const ENGAGEMENT_LABEL: Record<EngagementBand, string> = {
  CONSISTENT: "Consistent",
  MOSTLY_CONSISTENT: "Mostly consistent",
  INCONSISTENT: "Inconsistent",
  FREQUENTLY_DIVERTED: "Frequently diverted",
};

export const FRAMING_LABEL: Record<FramingBand, string> = {
  WELL_FRAMED: "Well framed",
  OFF_CENTRE: "Off-centre",
  TOO_CLOSE: "Too close to the camera",
  TOO_FAR: "Too far from the camera",
};

export const LIGHTING_LABEL: Record<LightingBand, string> = {
  GOOD: "Adequate",
  DIM: "Dim",
  OVEREXPOSED: "Overexposed",
};

export const STABILITY_LABEL: Record<StabilityBand, string> = {
  STEADY: "Steady",
  SOME_MOVEMENT: "Some movement",
  UNSTABLE: "Unstable",
};

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function percent(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}
