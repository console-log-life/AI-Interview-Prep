import { describe, expect, it } from "vitest";

import {
  MIN_SAMPLES,
  YAW_TOWARD_CAMERA,
  emptyVisualSummary,
  summarizeVisual,
  type FaceObservation,
  type VisualSample,
} from "@/lib/interviews/visual";

/**
 * Visual presentation analysis.
 *
 * The requirement driving these tests is negative: the camera must produce
 * real findings or an honest silence, never a plausible-looking number. So
 * most of what follows checks that a figure is *withheld* — when the browser
 * cannot detect faces, when too few frames were seen, when landmarks were
 * missing — because that is the direction this feature fails in.
 */

function face(overrides: Partial<FaceObservation> = {}): FaceObservation {
  return {
    centerX: 0.5,
    centerY: 0.42,
    areaRatio: 0.12,
    yawRatio: 0,
    eyesVisible: true,
    ...overrides,
  };
}

function samples(
  count: number,
  build: (index: number) => Partial<VisualSample> = () => ({}),
): VisualSample[] {
  return Array.from({ length: count }, (_, index) => ({
    atMs: index * 500,
    luminance: 0.45,
    motion: 0.01,
    face: face(),
    ...build(index),
  }));
}

describe("when nothing could be measured", () => {
  it("reports unavailable with a reason", () => {
    const summary = summarizeVisual([], true);
    expect(summary.capability).toBe("UNAVAILABLE");
    expect(summary.limitations).toHaveLength(1);
    expect(summary.faceVisibleRatio).toBeNull();
  });

  it("builds an explicit empty summary for a camera-off interview", () => {
    const summary = emptyVisualSummary("Your camera was off.");
    expect(summary.capability).toBe("UNAVAILABLE");
    expect(summary.engagementBand).toBeNull();
    expect(summary.limitations).toContain("Your camera was off.");
  });
});

describe("when the browser has no face detector", () => {
  it("degrades to lighting and stability rather than guessing", () => {
    const summary = summarizeVisual(samples(120), false);

    expect(summary.capability).toBe("FRAME_ONLY");
    expect(summary.lightingBand).toBe("GOOD");
    expect(summary.stabilityBand).toBe("STEADY");

    // The critical part: no face-derived figure is invented from pixels.
    expect(summary.faceVisibleRatio).toBeNull();
    expect(summary.cameraEngagementRatio).toBeNull();
    expect(summary.engagementBand).toBeNull();
    expect(summary.framingBand).toBeNull();
    expect(summary.limitations.join(" ")).toMatch(/does not provide face detection/i);
  });

  it("does not confuse a missing API with an absent candidate", () => {
    // Same frames, same faces present. Only the detector differs, and the two
    // must not produce the same reading.
    const withDetector = summarizeVisual(samples(120), true);
    const without = summarizeVisual(samples(120), false);
    expect(withDetector.faceVisibleRatio).toBe(1);
    expect(without.faceVisibleRatio).toBeNull();
  });
});

describe("sample sufficiency", () => {
  it("withholds every ratio below the minimum sample count", () => {
    const summary = summarizeVisual(samples(MIN_SAMPLES - 1), true);
    expect(summary.capability).toBe("FULL");
    expect(summary.faceVisibleRatio).toBeNull();
    expect(summary.engagementBand).toBeNull();
    expect(summary.limitations.join(" ")).toMatch(/too few/i);
  });

  it("reports presence but not engagement when the face was rarely visible", () => {
    // Enough frames overall, but the candidate was mostly out of shot.
    const data = samples(200, (index) => ({ face: index < 10 ? face() : null }));
    const summary = summarizeVisual(data, true);

    expect(summary.faceVisibleRatio).toBeCloseTo(0.05, 5);
    expect(summary.engagementBand).toBeNull();
    expect(summary.limitations.join(" ")).toMatch(/not enough to assess camera engagement/i);
  });

  it("reports presence only when landmarks were unavailable", () => {
    const data = samples(120, () => ({ face: face({ yawRatio: null }) }));
    const summary = summarizeVisual(data, true);

    expect(summary.faceVisibleRatio).toBe(1);
    expect(summary.cameraEngagementRatio).toBeNull();
    expect(summary.limitations.join(" ")).toMatch(/landmarks were not available/i);
    expect(summary.observations.join(" ")).toMatch(/in frame for 100%/);
  });
});

describe("camera engagement", () => {
  it("is high when the candidate faces the camera throughout", () => {
    const summary = summarizeVisual(samples(120), true);
    expect(summary.engagementBand).toBe("CONSISTENT");
    expect(summary.cameraEngagementRatio).toBeCloseTo(1, 5);
  });

  it("falls when the head is consistently turned away", () => {
    const data = samples(120, () => ({
      face: face({ yawRatio: YAW_TOWARD_CAMERA + 0.4 }),
    }));
    const summary = summarizeVisual(data, true);
    expect(summary.engagementBand).toBe("FREQUENTLY_DIVERTED");
  });

  it("treats a turn in either direction the same", () => {
    const left = summarizeVisual(
      samples(120, () => ({ face: face({ yawRatio: -0.8 }) })),
      true,
    );
    const right = summarizeVisual(
      samples(120, () => ({ face: face({ yawRatio: 0.8 }) })),
      true,
    );
    expect(left.cameraEngagementRatio).toBe(right.cameraEngagementRatio);
  });

  it("is scaled down by time spent out of frame", () => {
    // Facing the camera whenever visible, but visible only two thirds of the
    // time, is not two-thirds-of-nothing — engagement must reflect absence.
    const data = samples(180, (index) => ({ face: index % 3 === 0 ? null : face() }));
    const summary = summarizeVisual(data, true);
    expect(summary.cameraEngagementRatio).toBeCloseTo(2 / 3, 2);
    expect(summary.observations.join(" ")).toMatch(/left the frame/i);
  });

  it("never claims a gaze measurement", () => {
    const summary = summarizeVisual(samples(120), true);
    const text = [...summary.observations, ...summary.limitations].join(" ");
    expect(text).toMatch(/not eye tracking/i);
    expect(text).not.toMatch(/eye contact/i);
  });
});

describe("framing", () => {
  it.each([
    ["TOO_CLOSE", { areaRatio: 0.6 }],
    ["TOO_FAR", { areaRatio: 0.01 }],
    ["OFF_CENTRE", { centerX: 0.9 }],
    ["WELL_FRAMED", {}],
  ] as const)("detects %s", (expected, overrides) => {
    const summary = summarizeVisual(
      samples(120, () => ({ face: face(overrides) })),
      true,
    );
    expect(summary.framingBand).toBe(expected);
  });
});

describe("lighting and stability", () => {
  it("flags a dark picture with advice", () => {
    const summary = summarizeVisual(
      samples(120, () => ({ luminance: 0.05 })),
      true,
    );
    expect(summary.lightingBand).toBe("DIM");
    expect(summary.observations.join(" ")).toMatch(/light facing you/i);
  });

  it("flags an overexposed picture", () => {
    const summary = summarizeVisual(
      samples(120, () => ({ luminance: 0.95 })),
      true,
    );
    expect(summary.lightingBand).toBe("OVEREXPOSED");
  });

  it("flags an unstable image", () => {
    const summary = summarizeVisual(
      samples(120, () => ({ motion: 0.4 })),
      true,
    );
    expect(summary.stabilityBand).toBe("UNSTABLE");
  });

  it("measures lighting even without a detector", () => {
    const summary = summarizeVisual(
      samples(120, () => ({ luminance: 0.05, face: null })),
      false,
    );
    expect(summary.lightingBand).toBe("DIM");
  });
});

describe("never interprets", () => {
  it("makes no claim about the candidate's state of mind", () => {
    const summary = summarizeVisual(
      samples(200, (index) => ({
        face: index % 2 === 0 ? null : face({ yawRatio: 0.9 }),
        motion: 0.3,
        luminance: 0.05,
      })),
      true,
    );
    const text = [...summary.observations, ...summary.limitations].join(" ");
    expect(text).not.toMatch(/nervous|anxious|confident|dishonest|stressed|uncomfortable/i);
  });
});
