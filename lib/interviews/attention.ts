import {
  MIN_SAMPLES,
  YAW_TOWARD_CAMERA,
  type VisualSample,
} from "@/lib/interviews/visual";

/**
 * Attention feedback — pure aggregation, extending the existing visual samples.
 *
 * This deliberately builds on `VisualSample` rather than starting a second
 * capture pipeline: the sampler already draws frames to an offscreen canvas at
 * 2 fps, measures them and throws them away, and duplicating that would double
 * the CPU cost for the same numbers.
 *
 * The rules `visual.ts` sets out apply here unchanged, and one more is added.
 *
 * **Episodes, not frames.** A per-frame ratio is honest but useless as
 * feedback: a blink, a glance at notes, or one bad detection becomes a
 * statistic. Nothing is reported as "looking away" until it has lasted
 * `LOOK_AWAY_MIN_MS`, so what the candidate sees corresponds to something they
 * would recognise doing.
 *
 * **This is not proctoring.** It cannot tell where on a screen someone is
 * looking, it does not know who the extra face belongs to, and a tab switch is
 * not evidence of anything. The output is phrased as coaching throughout, and
 * the wording is part of the contract — `attentionFeedback` is tested for it.
 */

/**
 * How long a look-away must last before it counts.
 *
 * 1.5s is comfortably longer than a blink or a glance down at a notepad, and
 * short enough to catch someone reading from a second screen. Erring long is
 * deliberate: a false "you looked away" is worse than a missed one, because the
 * candidate cannot check it against anything.
 */
export const LOOK_AWAY_MIN_MS = 1500;

/** Assumed gap between samples when the stream cannot say. Matches the sampler. */
export const DEFAULT_SAMPLE_INTERVAL_MS = 500;

/** Non-camera signals, collected from browser events rather than frames. */
export type AttentionEvents = {
  /** Times the tab was hidden or the window lost focus. */
  tabSwitches: number;
  /** Times fullscreen was left, when the interview began in fullscreen. */
  fullscreenExits: number;
};

export const NO_ATTENTION_EVENTS: AttentionEvents = {
  tabSwitches: 0,
  fullscreenExits: 0,
};

export type AttentionSummary = {
  /** False when the camera signals could not be measured at all. */
  cameraMeasured: boolean;
  /** Why the camera figures are absent. Null when they are present. */
  cameraUnavailableReason: string | null;
  /**
   * Fraction of *all* sampled camera time with a face present and oriented
   * toward the screen.
   *
   * Deliberately a different denominator from `VisualSummary.cameraEngagementRatio`,
   * which divides by frames containing a face. Here a frame with no face counts
   * against the ratio, because from the candidate's point of view leaving the
   * frame and turning away are the same thing: not looking at the interviewer.
   */
  lookingAtScreenRatio: number | null;
  /** Look-aways that lasted at least `LOOK_AWAY_MIN_MS`. */
  lookAwayCount: number;
  longestLookAwayMs: number;
  tabSwitches: number;
  fullscreenExits: number;
  /**
   * Most faces seen in any single frame, or null without detection.
   *
   * One is the expected value. More than one is reported as an observation and
   * never as a finding: a person walking behind the candidate is not cheating,
   * and this cannot tell the difference.
   */
  maxFacesSeen: number | null;
};

export function unavailableAttention(
  reason: string,
  events: AttentionEvents = NO_ATTENTION_EVENTS,
): AttentionSummary {
  return {
    cameraMeasured: false,
    cameraUnavailableReason: reason,
    lookingAtScreenRatio: null,
    lookAwayCount: 0,
    longestLookAwayMs: 0,
    tabSwitches: events.tabSwitches,
    fullscreenExits: events.fullscreenExits,
    maxFacesSeen: null,
  };
}

/** Was the candidate attending to the screen in this frame? */
function isAttentive(sample: VisualSample): boolean {
  const face = sample.face;
  if (!face) return false;
  // Null yaw means the detector found a face but no landmarks. The face being
  // present is the stronger signal, so it counts rather than being discarded.
  if (face.yawRatio === null) return true;
  return Math.abs(face.yawRatio) <= YAW_TOWARD_CAMERA;
}

/**
 * Reduces samples and browser events to attention feedback.
 *
 * `detectorAvailable` is separate from the samples for the same reason it is in
 * `summarizeVisual`: "no face was found" and "this browser cannot look for
 * faces" are different findings, and collapsing them would let a missing API
 * read as a candidate who was never on camera.
 */
export function summarizeAttention(input: {
  samples: readonly VisualSample[];
  detectorAvailable: boolean;
  events?: AttentionEvents;
  sampleIntervalMs?: number;
}): AttentionSummary {
  const events = input.events ?? NO_ATTENTION_EVENTS;
  const interval = input.sampleIntervalMs ?? DEFAULT_SAMPLE_INTERVAL_MS;
  const samples = input.samples;

  if (!input.detectorAvailable) {
    return unavailableAttention(
      "This browser does not provide face detection, so attention could not be measured. Everything else in your report is unaffected.",
      events,
    );
  }

  if (samples.length === 0) {
    return unavailableAttention(
      "Your camera was off for this interview, so there is no attention feedback.",
      events,
    );
  }

  if (samples.length < MIN_SAMPLES) {
    return unavailableAttention(
      "There was not enough camera time to measure attention reliably, so no figures are shown rather than figures you could not trust.",
      events,
    );
  }

  let attentive = 0;
  let maxFacesSeen = 0;
  let lookAwayCount = 0;
  let longestLookAwayMs = 0;

  /** Start time of the run of inattentive frames currently open. */
  let runStartMs: number | null = null;

  const closeRun = (endMs: number): void => {
    if (runStartMs === null) return;
    const duration = endMs - runStartMs;
    if (duration >= LOOK_AWAY_MIN_MS) {
      lookAwayCount += 1;
      longestLookAwayMs = Math.max(longestLookAwayMs, duration);
    }
    runStartMs = null;
  };

  for (const [index, sample] of samples.entries()) {
    maxFacesSeen = Math.max(maxFacesSeen, sample.faceCount ?? (sample.face ? 1 : 0));

    if (isAttentive(sample)) {
      attentive += 1;
      // The run ended when this attentive frame began.
      closeRun(sample.atMs);
      continue;
    }

    if (runStartMs === null) runStartMs = sample.atMs;

    // A run still open on the last sample is closed at the end of that
    // sample's interval, not at its timestamp — otherwise a look-away lasting
    // to the end of the interview is measured as one interval shorter than it
    // was, and a single final frame measures as zero.
    if (index === samples.length - 1) closeRun(sample.atMs + interval);
  }

  return {
    cameraMeasured: true,
    cameraUnavailableReason: null,
    lookingAtScreenRatio: attentive / samples.length,
    lookAwayCount,
    longestLookAwayMs,
    tabSwitches: events.tabSwitches,
    fullscreenExits: events.fullscreenExits,
    maxFacesSeen,
  };
}

export type AttentionFeedback = {
  /** One line of measured fact, or the honest reason there is none. */
  facts: string[];
  /** Coaching. Empty when there is nothing worth suggesting. */
  coaching: string[];
};

function seconds(ms: number): string {
  const value = ms / 1000;
  return value >= 10 ? `${Math.round(value)}s` : `${value.toFixed(1)}s`;
}

function plural(count: number, one: string, many: string): string {
  return count === 1 ? one : many;
}

/**
 * Turns the summary into sentences for the report.
 *
 * Separated from the aggregation so the wording can be tested directly. What is
 * being tested is not phrasing taste — it is that nothing here accuses the
 * candidate of anything, that a missing measurement is stated rather than
 * rounded to zero, and that an extra face is never described as cheating.
 */
export function attentionFeedback(summary: AttentionSummary): AttentionFeedback {
  const facts: string[] = [];
  const coaching: string[] = [];

  if (!summary.cameraMeasured) {
    facts.push(summary.cameraUnavailableReason ?? "Attention was not measured.");
  } else {
    const percent = Math.round((summary.lookingAtScreenRatio ?? 0) * 100);
    facts.push(`Looking at the screen: ${percent}% of the time.`);

    if (summary.lookAwayCount === 0) {
      facts.push("You stayed with the camera throughout — no sustained look-aways.");
    } else {
      facts.push(
        `Looked away ${summary.lookAwayCount} ${plural(summary.lookAwayCount, "time", "times")} for more than ${seconds(LOOK_AWAY_MIN_MS)} (longest ${seconds(summary.longestLookAwayMs)}).`,
      );
    }

    if (summary.maxFacesSeen !== null && summary.maxFacesSeen > 1) {
      facts.push(
        `More than one face was visible at some point (up to ${summary.maxFacesSeen}). Worth knowing if you are interviewing from a shared room.`,
      );
    } else if (summary.maxFacesSeen === 1) {
      facts.push("Only you were visible in frame.");
    }

    if (percent < 70) {
      coaching.push(
        "Try to keep your eyes on the camera while you answer. It is the one habit that most changes how present you seem on a video call, and it is worth practising even when the answer is in your notes.",
      );
    }
    if (summary.longestLookAwayMs >= 10_000) {
      coaching.push(
        `One look-away ran to ${seconds(summary.longestLookAwayMs)}. If you need a moment to think, saying so out loud reads far better than going quiet and looking away.`,
      );
    }
  }

  if (summary.tabSwitches > 0) {
    facts.push(
      `Switched away from the interview tab ${summary.tabSwitches} ${plural(summary.tabSwitches, "time", "times")}.`,
    );
    coaching.push(
      "Closing other tabs before you start removes the temptation, and means a notification cannot pull your attention mid-answer.",
    );
  }

  if (summary.fullscreenExits > 0) {
    facts.push(
      `Left fullscreen ${summary.fullscreenExits} ${plural(summary.fullscreenExits, "time", "times")}.`,
    );
  }

  return { facts, coaching };
}
