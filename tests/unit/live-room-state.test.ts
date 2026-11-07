import { describe, expect, it } from "vitest";

import { NOT_STARTED, formatClock, interviewClock } from "@/lib/ai/live/clock";
import {
  CAMERA_STATUS_LABEL,
  cameraActionLabel,
  cameraIsRendering,
  cameraStateFrom,
  cameraToggleEnabled,
  type CameraSnapshot,
} from "@/lib/ai/live/media-state";
import {
  cleanTranscriptFragment,
  isNonSpeech,
  stripNonSpeech,
} from "@/lib/ai/live/noise";

/**
 * Regressions for defects observed in a real browser session.
 *
 * Each block reproduces something that was actually on screen, so a fix that
 * only moved the symptom would fail here.
 */

const MINUTE = 60_000;

describe("the interview clock (observed: 108:54 elapsed / 00:00 left)", () => {
  it("reproduces the bug when anchored on the interview row's creation", () => {
    // The row in the database was 111 minutes old with a 20-minute budget.
    // Anchoring there is what produced the screenshot.
    const rowCreated = Date.UTC(2026, 7, 19, 18, 41, 57);
    const now = rowCreated + 111 * MINUTE;

    const wrong = interviewClock({
      liveStartedAtMs: rowCreated,
      durationMin: 20,
      nowMs: now,
    });
    expect(Math.round(wrong.elapsedMs / MINUTE)).toBe(111);
    expect(wrong.remainingMs).toBe(0);
    expect(wrong.expired).toBe(true);
  });

  it("is correct when anchored on the moment the candidate joined", () => {
    // Same wall-clock instant, but the live session began 30 seconds ago.
    const rowCreated = Date.UTC(2026, 7, 19, 18, 41, 57);
    const now = rowCreated + 111 * MINUTE;
    const joined = now - 30_000;

    const clock = interviewClock({
      liveStartedAtMs: joined,
      durationMin: 20,
      nowMs: now,
    });
    expect(formatClock(clock.elapsedMs)).toBe("00:30");
    expect(formatClock(clock.remainingMs!)).toBe("19:30");
    expect(clock.expired).toBe(false);
  });

  it("counts up and down in step", () => {
    const joined = 1_000_000;
    const at = (seconds: number) =>
      interviewClock({ liveStartedAtMs: joined, durationMin: 30, nowMs: joined + seconds * 1000 });

    expect(formatClock(at(0).elapsedMs)).toBe("00:00");
    expect(formatClock(at(0).remainingMs!)).toBe("30:00");
    expect(formatClock(at(1).elapsedMs)).toBe("00:01");
    expect(formatClock(at(1).remainingMs!)).toBe("29:59");
  });

  it("never reaches zero remaining before the budget is spent", () => {
    // The explicit requirement: a 30-minute interview must not read 00:00 left
    // at any point in the first 30 minutes.
    const joined = 0;
    for (let minute = 0; minute < 30; minute += 1) {
      const clock = interviewClock({
        liveStartedAtMs: joined,
        durationMin: 30,
        nowMs: minute * MINUTE,
      });
      expect(clock.remainingMs, `at ${minute}m`).toBeGreaterThan(0);
      expect(clock.expired, `at ${minute}m`).toBe(false);
    }
    expect(
      interviewClock({ liveStartedAtMs: joined, durationMin: 30, nowMs: 30 * MINUTE })
        .expired,
    ).toBe(true);
  });

  it("reports not-running rather than inventing a time before the join", () => {
    const clock = interviewClock({
      liveStartedAtMs: null,
      durationMin: 20,
      nowMs: Date.now(),
    });
    expect(clock).toEqual(NOT_STARTED);
    expect(clock.anchored).toBe(false);
  });

  it("shows no countdown when the interview has no budget", () => {
    const clock = interviewClock({ liveStartedAtMs: 0, durationMin: null, nowMs: 5000 });
    expect(clock.remainingMs).toBeNull();
    expect(clock.expired).toBe(false);
  });

  it("does not run backwards when the client clock is behind the server", () => {
    const clock = interviewClock({
      liveStartedAtMs: 10_000,
      durationMin: 20,
      nowMs: 5_000,
    });
    expect(clock.elapsedMs).toBe(0);
  });
});

describe("camera state (observed: panel said off, control said on)", () => {
  const base: CameraSnapshot = {
    permission: "granted",
    hasTrack: true,
    trackEnabled: true,
    trackLive: true,
  };

  it("renders video when the track is live and enabled", () => {
    expect(cameraStateFrom(base)).toBe("CAMERA_ON");
    expect(cameraIsRendering("CAMERA_ON")).toBe(true);
  });

  it("is off — not unavailable — when the candidate disables the track", () => {
    expect(cameraStateFrom({ ...base, trackEnabled: false })).toBe("CAMERA_OFF");
  });

  it("becomes unavailable when the device is unplugged mid-interview", () => {
    // The track ends; a UI flag set earlier would still claim it works.
    expect(cameraStateFrom({ ...base, trackLive: false })).toBe("CAMERA_UNAVAILABLE");
    expect(cameraStateFrom({ ...base, hasTrack: false })).toBe("CAMERA_UNAVAILABLE");
  });

  it("distinguishes a pending prompt from a refusal", () => {
    expect(cameraStateFrom({ ...base, permission: "unknown" })).toBe("CAMERA_REQUESTING");
    expect(cameraStateFrom({ ...base, permission: "denied" })).toBe("CAMERA_ERROR");
    expect(cameraStateFrom({ ...base, permission: "unavailable" })).toBe(
      "CAMERA_UNAVAILABLE",
    );
  });

  it("never labels the state and the action with the same words", () => {
    // The exact contradiction seen on screen: the panel read "Camera off"
    // while the button beside it read "Camera on".
    for (const state of [
      "CAMERA_ON",
      "CAMERA_OFF",
      "CAMERA_REQUESTING",
      "CAMERA_ERROR",
      "CAMERA_UNAVAILABLE",
    ] as const) {
      expect(CAMERA_STATUS_LABEL[state]).not.toBe(cameraActionLabel(state));
    }
  });

  it("offers the toggle only when there is a track to toggle", () => {
    expect(cameraToggleEnabled("CAMERA_ON")).toBe(true);
    expect(cameraToggleEnabled("CAMERA_OFF")).toBe(true);
    expect(cameraToggleEnabled("CAMERA_UNAVAILABLE")).toBe(false);
    expect(cameraToggleEnabled("CAMERA_ERROR")).toBe(false);
    expect(cameraToggleEnabled("CAMERA_REQUESTING")).toBe(false);
  });

  it("only ever renders video in exactly one state", () => {
    const rendering = (
      ["CAMERA_ON", "CAMERA_OFF", "CAMERA_REQUESTING", "CAMERA_ERROR", "CAMERA_UNAVAILABLE"] as const
    ).filter(cameraIsRendering);
    expect(rendering).toEqual(["CAMERA_ON"]);
  });
});

describe("noise markers (observed: <noise> stored as an answer)", () => {
  it.each(["<noise>", "[noise]", "(noise)", "[BLANK_AUDIO]", "<silence>", "[inaudible]"])(
    "treats %p as non-speech",
    (text) => {
      expect(isNonSpeech(text)).toBe(true);
      expect(cleanTranscriptFragment(text)).toBe("");
    },
  );

  it.each(["...", "…", "  ", "--", "—"])("treats bare punctuation %p as non-speech", (text) => {
    expect(isNonSpeech(text)).toBe(true);
  });

  it("keeps the words either side of an annotation", () => {
    expect(stripNonSpeech("I think <noise> we could shard it")).toBe(
      "I think we could shard it",
    );
    // No doubled space left where the marker was.
    expect(stripNonSpeech("I think <noise> we could")).not.toMatch(/ {2}/);
  });

  it("never discards real speech", () => {
    const real = "I would use PostgreSQL because we need transactional consistency.";
    expect(isNonSpeech(real)).toBe(false);
    expect(cleanTranscriptFragment(real)).toBe(real);
  });

  it("does not mistake ordinary parentheses in speech for an annotation marker", () => {
    // A candidate genuinely saying a parenthetical must survive as speech.
    const spoken = "We used Redis (the managed one) for sessions";
    expect(isNonSpeech(spoken)).toBe(false);
    expect(cleanTranscriptFragment(spoken)).toContain("We used Redis");
  });

  it("collapses a turn of pure noise to nothing at all", () => {
    // Which is what makes it indistinguishable from silence downstream — no
    // answer, no evaluation, no follow-up.
    expect(cleanTranscriptFragment("<noise> [noise] ... <noise>")).toBe("");
  });

  /**
   * Deltas carry their own leading spaces and are joined with no separator, so
   * a fragment cleaner that trims is a word-boundary shredder. Observed:
   * "I chose it because we" + " needed transactions" assembling as
   * "…because weneeded transactions".
   */
  it("preserves the leading space a delta fragment arrives with", () => {
    expect(cleanTranscriptFragment(" needed transactions.")).toBe(
      " needed transactions.",
    );
    expect(cleanTranscriptFragment(" I")).toBe(" I");
  });

  it("keeps word boundaries when fragments are assembled", () => {
    const fragments = ["I chose it because we", " needed transactions", " between orders."];
    const joined = fragments.map(cleanTranscriptFragment).join("");
    expect(joined).toBe("I chose it because we needed transactions between orders.");
  });

  it("still drops a fragment that is only whitespace around a marker", () => {
    expect(cleanTranscriptFragment(" <noise> ")).toBe("");
  });
});
