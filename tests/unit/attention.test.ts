import { describe, expect, it } from "vitest";

import {
  LOOK_AWAY_MIN_MS,
  attentionFeedback,
  summarizeAttention,
  unavailableAttention,
  type AttentionSummary,
} from "@/lib/interviews/attention";
import { MIN_SAMPLES, YAW_TOWARD_CAMERA, type VisualSample } from "@/lib/interviews/visual";

/**
 * Attention feedback.
 *
 * Two things are being protected. The first is the smoothing: a per-frame ratio
 * would turn a blink into a statistic, so nothing counts as a look-away until
 * it has lasted `LOOK_AWAY_MIN_MS`. The second is the wording — this feature
 * is one careless sentence away from reading as proctoring, so the phrasing is
 * asserted, not left to review.
 */

const INTERVAL = 500;

type FrameKind = "at-screen" | "away" | "no-face";

/** Builds a sample stream from a shorthand description of each frame. */
function stream(kinds: FrameKind[], faceCounts?: number[]): VisualSample[] {
  return kinds.map((kind, index) => ({
    atMs: index * INTERVAL,
    luminance: 0.5,
    motion: 0.01,
    faceCount: faceCounts?.[index],
    face:
      kind === "no-face"
        ? null
        : {
            centerX: 0.5,
            centerY: 0.5,
            areaRatio: 0.1,
            // Comfortably inside or outside the threshold, never on it.
            yawRatio: kind === "at-screen" ? 0 : YAW_TOWARD_CAMERA + 0.3,
            eyesVisible: true,
          },
  }));
}

/** A stream long enough to clear MIN_SAMPLES, all frames at the screen. */
function attentiveStream(length = MIN_SAMPLES + 10): VisualSample[] {
  return stream(Array.from({ length }, () => "at-screen" as FrameKind));
}

function summarize(samples: VisualSample[], events?: { tabSwitches: number; fullscreenExits: number }) {
  return summarizeAttention({
    samples,
    detectorAvailable: true,
    events,
    sampleIntervalMs: INTERVAL,
  });
}

describe("summarizeAttention — when it refuses to report", () => {
  it("reports nothing when the browser has no face detection", () => {
    const summary = summarizeAttention({
      samples: attentiveStream(),
      detectorAvailable: false,
    });
    expect(summary.cameraMeasured).toBe(false);
    expect(summary.lookingAtScreenRatio).toBeNull();
    expect(summary.cameraUnavailableReason).toMatch(/face detection/i);
  });

  it("reports nothing when the camera was off", () => {
    const summary = summarize([]);
    expect(summary.cameraMeasured).toBe(false);
    expect(summary.cameraUnavailableReason).toMatch(/camera was off/i);
  });

  it("refuses to report on too little camera time rather than guessing", () => {
    // A ratio over a handful of frames is arithmetic, not evidence.
    const summary = summarize(stream(["at-screen", "away", "at-screen"]));
    expect(summary.cameraMeasured).toBe(false);
    expect(summary.lookingAtScreenRatio).toBeNull();
    expect(summary.cameraUnavailableReason).toMatch(/not enough camera time/i);
  });

  it("still reports non-camera signals when the camera is unavailable", () => {
    // A tab switch is not a camera measurement, so a camera failure must not
    // silently zero it.
    const summary = summarize([], { tabSwitches: 2, fullscreenExits: 1 });
    expect(summary.cameraMeasured).toBe(false);
    expect(summary.tabSwitches).toBe(2);
    expect(summary.fullscreenExits).toBe(1);
  });

  it("never reports a face count it did not measure", () => {
    expect(unavailableAttention("off").maxFacesSeen).toBeNull();
  });
});

describe("summarizeAttention — the look-away threshold", () => {
  /** Puts a run of `length` inattentive frames in the middle of a long stream. */
  function withRun(length: number, kind: FrameKind = "away"): VisualSample[] {
    const kinds: FrameKind[] = Array.from(
      { length: MIN_SAMPLES + 20 },
      () => "at-screen" as FrameKind,
    );
    for (let i = 0; i < length; i += 1) kinds[10 + i] = kind;
    return stream(kinds);
  }

  it("ignores a single-frame glance", () => {
    // 500ms. A blink or a glance at a notepad must not become a statistic.
    const summary = summarize(withRun(1));
    expect(summary.lookAwayCount).toBe(0);
    expect(summary.longestLookAwayMs).toBe(0);
  });

  it("ignores a run just under the threshold", () => {
    // Two frames = 1000ms of gap between the attentive frames either side.
    expect(summarize(withRun(2)).lookAwayCount).toBe(0);
  });

  it("counts a run that reaches the threshold", () => {
    // Three away frames: the attentive frame after them starts 1500ms later.
    const summary = summarize(withRun(3));
    expect(summary.lookAwayCount).toBe(1);
    expect(summary.longestLookAwayMs).toBeGreaterThanOrEqual(LOOK_AWAY_MIN_MS);
  });

  it("treats leaving the frame the same as turning away", () => {
    // From the candidate's point of view both are "not looking at the
    // interviewer", so both must count.
    const summary = summarize(withRun(4, "no-face"));
    expect(summary.lookAwayCount).toBe(1);
  });

  it("counts separate episodes separately", () => {
    const kinds: FrameKind[] = Array.from(
      { length: MIN_SAMPLES + 30 },
      () => "at-screen" as FrameKind,
    );
    for (let i = 0; i < 4; i += 1) kinds[5 + i] = "away";
    for (let i = 0; i < 6; i += 1) kinds[25 + i] = "away";
    const summary = summarize(stream(kinds));

    expect(summary.lookAwayCount).toBe(2);
    // The longest is the second run, not the sum of both.
    expect(summary.longestLookAwayMs).toBe(6 * INTERVAL);
  });

  it("measures a look-away still running at the end of the interview", () => {
    // Closing the run at the last timestamp would under-measure it by one
    // interval, and a single trailing frame would measure as zero.
    const kinds: FrameKind[] = Array.from(
      { length: MIN_SAMPLES + 10 },
      () => "at-screen" as FrameKind,
    );
    for (let i = kinds.length - 5; i < kinds.length; i += 1) kinds[i] = "away";
    const summary = summarize(stream(kinds));

    expect(summary.lookAwayCount).toBe(1);
    expect(summary.longestLookAwayMs).toBe(5 * INTERVAL);
  });

  it("counts a face with no landmarks as present rather than away", () => {
    // Face found, landmarks missing. Presence is the stronger signal, and
    // discarding it would punish a weaker detector.
    const samples = attentiveStream();
    for (const sample of samples) {
      if (sample.face) sample.face.yawRatio = null;
    }
    const summary = summarize(samples);
    expect(summary.lookingAtScreenRatio).toBe(1);
    expect(summary.lookAwayCount).toBe(0);
  });
});

describe("summarizeAttention — ratios and counts", () => {
  it("counts absent frames against the ratio, not out of it", () => {
    // Half the frames have no face at all. 50%, not 100% of the frames that
    // happened to contain one.
    const kinds: FrameKind[] = [];
    for (let i = 0; i < MIN_SAMPLES + 10; i += 1) {
      kinds.push(i % 2 === 0 ? "at-screen" : "no-face");
    }
    const summary = summarize(stream(kinds));
    expect(summary.lookingAtScreenRatio).toBeCloseTo(0.5, 1);
  });

  it("reports a full ratio for an attentive interview", () => {
    expect(summarize(attentiveStream()).lookingAtScreenRatio).toBe(1);
  });

  it("reports the highest face count seen in any frame", () => {
    const counts = Array.from({ length: MIN_SAMPLES + 10 }, () => 1);
    counts[7] = 2;
    const summary = summarize(attentiveStream(MIN_SAMPLES + 10));
    expect(summary.maxFacesSeen).toBe(1);

    const withExtra = summarize(
      stream(
        Array.from({ length: MIN_SAMPLES + 10 }, () => "at-screen" as FrameKind),
        counts,
      ),
    );
    expect(withExtra.maxFacesSeen).toBe(2);
  });

  it("falls back to face presence when a sample carries no count", () => {
    // Samples written before faceCount existed must not read as zero faces.
    expect(summarize(attentiveStream()).maxFacesSeen).toBe(1);
  });

  it("passes browser events through unchanged", () => {
    const summary = summarize(attentiveStream(), { tabSwitches: 3, fullscreenExits: 2 });
    expect(summary.tabSwitches).toBe(3);
    expect(summary.fullscreenExits).toBe(2);
  });
});

describe("attentionFeedback — wording", () => {
  const measured = (overrides: Partial<AttentionSummary> = {}): AttentionSummary => ({
    cameraMeasured: true,
    cameraUnavailableReason: null,
    lookingAtScreenRatio: 0.78,
    lookAwayCount: 4,
    longestLookAwayMs: 6000,
    tabSwitches: 1,
    fullscreenExits: 0,
    maxFacesSeen: 1,
    ...overrides,
  });

  it("states the percentage and the look-aways", () => {
    const { facts } = attentionFeedback(measured());
    expect(facts.join(" ")).toContain("78%");
    expect(facts.join(" ")).toMatch(/Looked away 4 times/);
    expect(facts.join(" ")).toContain("6.0s");
  });

  it("says only you were visible when that is what was measured", () => {
    expect(attentionFeedback(measured()).facts.join(" ")).toMatch(/only you were visible/i);
  });

  it("describes an extra face without implying cheating", () => {
    const text = attentionFeedback(measured({ maxFacesSeen: 2 })).facts.join(" ");
    expect(text).toMatch(/more than one face/i);
    expect(text).not.toMatch(/cheat|suspicious|violation|malpractice|caught|proctor/i);
  });

  it("never accuses, at any value", () => {
    // The sentence that would turn coaching into proctoring.
    const worst = attentionFeedback(
      measured({
        lookingAtScreenRatio: 0.1,
        lookAwayCount: 20,
        longestLookAwayMs: 60_000,
        tabSwitches: 9,
        fullscreenExits: 4,
        maxFacesSeen: 3,
      }),
    );
    const all = [...worst.facts, ...worst.coaching].join(" ");
    expect(all).not.toMatch(
      /cheat|suspicious|violation|malpractice|dishonest|caught|disqualif|fail/i,
    );
  });

  it("coaches when eye contact was low", () => {
    const { coaching } = attentionFeedback(measured({ lookingAtScreenRatio: 0.4 }));
    expect(coaching.join(" ")).toMatch(/keep your eyes on the camera/i);
  });

  it("does not coach when there is nothing to improve", () => {
    const { coaching } = attentionFeedback(
      measured({
        lookingAtScreenRatio: 0.95,
        lookAwayCount: 0,
        longestLookAwayMs: 0,
        tabSwitches: 0,
      }),
    );
    expect(coaching).toEqual([]);
  });

  it("praises an interview with no sustained look-aways", () => {
    const { facts } = attentionFeedback(measured({ lookAwayCount: 0, longestLookAwayMs: 0 }));
    expect(facts.join(" ")).toMatch(/stayed with the camera/i);
  });

  it("states the reason and shows no numbers when the camera was off", () => {
    const { facts, coaching } = attentionFeedback(
      unavailableAttention("Your camera was off for this interview."),
    );
    expect(facts).toEqual(["Your camera was off for this interview."]);
    expect(facts.join(" ")).not.toMatch(/\d+%/);
    expect(coaching).toEqual([]);
  });

  it("still reports a tab switch when the camera was unavailable", () => {
    const { facts } = attentionFeedback(
      unavailableAttention("Camera off.", { tabSwitches: 2, fullscreenExits: 0 }),
    );
    expect(facts.join(" ")).toMatch(/Switched away from the interview tab 2 times/);
  });

  it("uses the singular for one of anything", () => {
    const text = attentionFeedback(
      measured({ lookAwayCount: 1, tabSwitches: 1, fullscreenExits: 1 }),
    ).facts.join(" ");
    expect(text).toMatch(/Looked away 1 time for/);
    expect(text).toMatch(/tab 1 time\./);
    expect(text).toMatch(/fullscreen 1 time\./);
  });
});
