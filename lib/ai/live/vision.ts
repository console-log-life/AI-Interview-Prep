"use client";

import type { FaceObservation, VisualSample } from "@/lib/interviews/visual";

/**
 * Browser-side visual sampling for the interview room.
 *
 * Frames are drawn to a small offscreen canvas, measured, and discarded. No
 * image ever leaves the machine and none is retained — what the server
 * eventually receives is a handful of numbers. That constraint is what makes
 * a camera-on interview defensible rather than surveillance, and it is why the
 * analysis lives here instead of in a route handler.
 *
 * Face detection uses the Shape Detection API where the browser provides it.
 * It very often does not — it is unshipped in Firefox and Safari and gated on
 * several Chrome builds — so the sampler reports its own capability rather
 * than assuming, and the summary degrades to lighting and stability instead of
 * quietly reporting something weaker under the same name.
 */

/**
 * Sampling rate.
 *
 * Two frames a second. Visual presentation changes on the scale of seconds,
 * and a 30-minute interview at this rate is ~3600 samples — enough for stable
 * ratios, small enough that the analysis never competes with audio for the
 * main thread.
 */
const SAMPLE_INTERVAL_MS = 500;

/** Downscaled analysis size. Large enough for a face box, cheap to read back. */
const ANALYSIS_WIDTH = 160;
const ANALYSIS_HEIGHT = 120;

/** Ceiling on retained samples, so a very long session cannot grow unbounded. */
const MAX_SAMPLES = 5000;

// --- Shape Detection API ----------------------------------------------------
// Not in lib.dom, so the minimum surface used here is declared locally rather
// than pulling in a dependency for two method signatures.

type DetectedLandmark = {
  type?: "eye" | "mouth" | "nose";
  locations: Array<{ x: number; y: number }>;
};

type DetectedFace = {
  boundingBox: { x: number; y: number; width: number; height: number };
  landmarks?: DetectedLandmark[];
};

type FaceDetectorLike = {
  detect(source: CanvasImageSource): Promise<DetectedFace[]>;
};

type FaceDetectorConstructor = new (options?: {
  fastMode?: boolean;
  maxDetectedFaces?: number;
}) => FaceDetectorLike;

function faceDetectorConstructor(): FaceDetectorConstructor | null {
  if (typeof window === "undefined") return null;
  const candidate = (window as unknown as Record<string, unknown>).FaceDetector;
  return typeof candidate === "function" ? (candidate as FaceDetectorConstructor) : null;
}

export class VisualSampler {
  private readonly samples: VisualSample[] = [];
  private canvas: HTMLCanvasElement | null = null;
  private context: CanvasRenderingContext2D | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private previousLuma: Float32Array | null = null;
  private detector: FaceDetectorLike | null = null;
  private detectorAvailable = false;
  /** Guards against overlapping detections when a frame takes too long. */
  private detecting = false;
  private startedAtMs = 0;
  /** Paused while the candidate has the camera off. */
  private paused = false;

  /**
   * Starts sampling.
   *
   * Failing to construct a detector is not an error — it is the common case,
   * and it simply lowers the capability the summary will report.
   */
  start(video: HTMLVideoElement, startedAtMs: number): void {
    this.stop();
    this.startedAtMs = startedAtMs;

    const Detector = faceDetectorConstructor();
    if (Detector) {
      try {
        this.detector = new Detector({ fastMode: true, maxDetectedFaces: 1 });
        this.detectorAvailable = true;
      } catch {
        this.detector = null;
        this.detectorAvailable = false;
      }
    }

    this.canvas = document.createElement("canvas");
    this.canvas.width = ANALYSIS_WIDTH;
    this.canvas.height = ANALYSIS_HEIGHT;
    // `willReadFrequently` matters here: without it browsers keep the canvas on
    // the GPU and every getImageData becomes a stall.
    this.context = this.canvas.getContext("2d", { willReadFrequently: true });

    this.timer = setInterval(() => {
      void this.sample(video);
    }, SAMPLE_INTERVAL_MS);
  }

  /** Suspends sampling without discarding what has been measured. */
  setPaused(paused: boolean): void {
    this.paused = paused;
    // Motion is a frame-to-frame difference, so the frame either side of a gap
    // would read as a huge jump. Dropping the reference avoids that artefact.
    if (paused) this.previousLuma = null;
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.previousLuma = null;
    this.canvas = null;
    this.context = null;
  }

  get collected(): VisualSample[] {
    return this.samples;
  }

  get hasDetector(): boolean {
    return this.detectorAvailable;
  }

  private async sample(video: HTMLVideoElement): Promise<void> {
    if (this.paused || !this.context || !this.canvas) return;
    // readyState below HAVE_CURRENT_DATA means there is no frame to draw; a
    // zero dimension means the track is live but producing nothing.
    if (video.readyState < 2 || video.videoWidth === 0) return;
    if (this.samples.length >= MAX_SAMPLES) return;

    this.context.drawImage(video, 0, 0, ANALYSIS_WIDTH, ANALYSIS_HEIGHT);

    let pixels: ImageData;
    try {
      pixels = this.context.getImageData(0, 0, ANALYSIS_WIDTH, ANALYSIS_HEIGHT);
    } catch {
      // A tainted canvas cannot be read. Nothing to measure, and nothing worth
      // reporting as a failure to the candidate.
      return;
    }

    const luma = new Float32Array(ANALYSIS_WIDTH * ANALYSIS_HEIGHT);
    let luminanceSum = 0;
    for (let i = 0, p = 0; i < luma.length; i += 1, p += 4) {
      // Rec. 601 luma — the standard weighting for perceived brightness.
      const value =
        (0.299 * pixels.data[p] + 0.587 * pixels.data[p + 1] + 0.114 * pixels.data[p + 2]) /
        255;
      luma[i] = value;
      luminanceSum += value;
    }

    let motion = 0;
    if (this.previousLuma) {
      let diff = 0;
      for (let i = 0; i < luma.length; i += 1) {
        diff += Math.abs(luma[i] - this.previousLuma[i]);
      }
      motion = diff / luma.length;
    }
    this.previousLuma = luma;

    const sample: VisualSample = {
      atMs: Date.now() - this.startedAtMs,
      luminance: luminanceSum / luma.length,
      motion,
      face: null,
    };

    if (this.detector && !this.detecting) {
      this.detecting = true;
      try {
        const faces = await this.detector.detect(this.canvas);
        sample.face = faces.length > 0 ? toObservation(faces[0]) : null;
      } catch {
        // A detection failure on one frame is a missing sample, not an outage.
      } finally {
        this.detecting = false;
      }
    }

    this.samples.push(sample);
  }
}

/**
 * Converts a detected face into normalized measurements.
 *
 * The yaw proxy is the only inference here, and it is a modest one: with both
 * eyes and a nose located, the nose sits midway between the eyes when the head
 * faces the camera and shifts toward one eye as the head turns. Dividing that
 * shift by the inter-eye distance makes it independent of how close the
 * candidate is sitting. It is not gaze — it cannot tell where on the screen
 * someone is looking — and the report says so.
 */
function toObservation(face: DetectedFace): FaceObservation {
  const box = face.boundingBox;
  const centerX = (box.x + box.width / 2) / ANALYSIS_WIDTH;
  const centerY = (box.y + box.height / 2) / ANALYSIS_HEIGHT;
  const areaRatio = (box.width * box.height) / (ANALYSIS_WIDTH * ANALYSIS_HEIGHT);

  const eyes = (face.landmarks ?? []).filter((landmark) => landmark.type === "eye");
  const nose = (face.landmarks ?? []).find((landmark) => landmark.type === "nose");

  let yawRatio: number | null = null;
  const eyesVisible = eyes.length >= 2;

  if (eyesVisible && nose && nose.locations.length > 0) {
    const left = centroid(eyes[0].locations);
    const right = centroid(eyes[1].locations);
    const interEye = Math.abs(right.x - left.x);
    if (interEye > 1) {
      const midpoint = (left.x + right.x) / 2;
      yawRatio = (centroid(nose.locations).x - midpoint) / interEye;
    }
  }

  return {
    centerX: clamp01(centerX),
    centerY: clamp01(centerY),
    areaRatio: clamp01(areaRatio),
    yawRatio,
    eyesVisible,
  };
}

function centroid(points: Array<{ x: number; y: number }>): { x: number; y: number } {
  const sum = points.reduce(
    (acc, point) => ({ x: acc.x + point.x, y: acc.y + point.y }),
    { x: 0, y: 0 },
  );
  return { x: sum.x / points.length, y: sum.y / points.length };
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
