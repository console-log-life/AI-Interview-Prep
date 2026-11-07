import { describe, expect, it } from "vitest";

import {
  MIC_AUDIBLE_LEVEL,
  blockingReason,
  cameraCheck,
  canJoin,
  classifyMediaError,
  connectionCheck,
  deviceLabel,
  environmentCheck,
  microphoneCheck,
  speakerCheck,
  videoEnabled,
  type DeviceCheckResult,
} from "@/lib/devices/checks";

/**
 * The device check.
 *
 * These tests are almost entirely about what the product refuses to claim. The
 * easy version of this feature ticks every box the moment a device is listed,
 * and the candidate discovers the truth mid-interview. Each case below pins one
 * of those false positives shut.
 */

const OK_CAMERA = { trackLive: true, framesSeen: 30 };
const OK_MIC = { trackLive: true, peakLevel: 40 };
const OK_SPEAKER = {
  attempted: true,
  played: true,
  confirmed: true,
  outputSelectionSupported: true,
};
const OK_CONNECTION = { online: true, probe: "ok" as const };

function allReady(): DeviceCheckResult[] {
  return [
    cameraCheck(OK_CAMERA),
    microphoneCheck(OK_MIC),
    speakerCheck(OK_SPEAKER),
    connectionCheck(OK_CONNECTION),
    environmentCheck({
      screenDetailsSupported: true,
      screenCount: 1,
      permission: "granted",
      videoInputs: 1,
      audioInputs: 1,
    }),
  ];
}

describe("camera", () => {
  it("is not ready merely because a track is live", () => {
    // The failure this exists for: a camera held by Zoom yields a live track
    // that never produces a picture.
    const result = cameraCheck({ trackLive: true, framesSeen: 0 });
    expect(result.status).toBe("FAILED");
    expect(result.recovery).toMatch(/another app/i);
  });

  it("is ready once frames actually arrive", () => {
    expect(cameraCheck(OK_CAMERA).status).toBe("READY");
  });

  it.each([
    ["denied", /permission/i],
    ["not-found", /no camera/i],
    ["in-use", /another application/i],
  ] as const)("explains a %s failure", (error, pattern) => {
    const result = cameraCheck({ trackLive: false, framesSeen: 0, error });
    expect(result.status).toBe("FAILED");
    expect(result.detail).toMatch(pattern);
    expect(result.recovery).toBeTruthy();
  });

  it("tells a candidate with no camera that audio-only is fine", () => {
    expect(
      cameraCheck({ trackLive: false, framesSeen: 0, error: "not-found" }).recovery,
    ).toMatch(/audio-only/i);
  });
});

describe("microphone", () => {
  it("does not pass on permission alone", () => {
    // A muted or dead microphone gives a perfectly healthy track.
    expect(microphoneCheck({ trackLive: true, peakLevel: 0 }).status).toBe("CHECKING");
  });

  it("keeps waiting when input is barely audible", () => {
    const result = microphoneCheck({ trackLive: true, peakLevel: MIC_AUDIBLE_LEVEL - 1 });
    expect(result.status).toBe("CHECKING");
    expect(result.recovery).toMatch(/closer|input level/i);
  });

  it("passes once speech is actually heard", () => {
    expect(microphoneCheck({ trackLive: true, peakLevel: MIC_AUDIBLE_LEVEL }).status).toBe(
      "READY",
    );
  });

  it("points a denied candidate at the chat interview", () => {
    const result = microphoneCheck({ trackLive: false, peakLevel: 0, error: "denied" });
    expect(result.status).toBe("FAILED");
    expect(result.recovery).toMatch(/chat interview/i);
  });
});

describe("speaker", () => {
  it("claims nothing before the candidate presses test", () => {
    const result = speakerCheck({
      attempted: false,
      played: false,
      confirmed: null,
      outputSelectionSupported: true,
    });
    expect(result.status).toBe("PENDING");
  });

  it("does not pass on playback alone", () => {
    // The browser can prove audio was played. Only the candidate knows whether
    // it was heard, and that difference is the whole point of this check.
    const result = speakerCheck({
      attempted: true,
      played: true,
      confirmed: null,
      outputSelectionSupported: true,
    });
    expect(result.status).toBe("CHECKING");
    expect(result.detail).toMatch(/did you hear/i);
  });

  it("fails when the candidate heard nothing", () => {
    expect(
      speakerCheck({
        attempted: true,
        played: true,
        confirmed: false,
        outputSelectionSupported: true,
      }).status,
    ).toBe("FAILED");
  });

  it("passes only on confirmation", () => {
    expect(speakerCheck(OK_SPEAKER).status).toBe("READY");
  });

  it("says so when the browser cannot switch outputs", () => {
    const result = speakerCheck({ ...OK_SPEAKER, outputSelectionSupported: false });
    expect(result.detail).toMatch(/limited by this browser/i);
    expect(result.browserLimited).toBe(true);
  });

  it("gives system-level advice when device selection is unavailable", () => {
    const result = speakerCheck({
      attempted: true,
      played: true,
      confirmed: false,
      outputSelectionSupported: false,
    });
    expect(result.recovery).toMatch(/system sound settings/i);
  });
});

describe("connection", () => {
  it("trusts an offline signal over any probe", () => {
    expect(connectionCheck({ online: false, probe: "ok" }).status).toBe("FAILED");
  });

  it("distinguishes an unconfigured deployment from an outage", () => {
    const unconfigured = connectionCheck({ online: true, probe: "unconfigured" });
    expect(unconfigured.detail).toMatch(/not available on this deployment/i);
    expect(unconfigured.recovery).toMatch(/chat interview/i);

    expect(connectionCheck({ online: true, probe: "failed" }).detail).toMatch(
      /did not respond/i,
    );
  });

  it("reports the measured round trip", () => {
    expect(connectionCheck({ online: true, probe: "ok", latencyMs: 240 }).detail).toContain(
      "240 ms",
    );
  });
});

describe("environment", () => {
  it("never reports a pass when the API is missing", () => {
    const result = environmentCheck({
      screenDetailsSupported: false,
      screenCount: null,
      permission: "unsupported",
      videoInputs: 2,
      audioInputs: 1,
    });
    expect(result.status).toBe("LIMITED");
    expect(result.detail).toMatch(/limited by browser privacy restrictions/i);
  });

  it("never claims a second monitor is absent", () => {
    // The claim this test forbids is "no external display" — the browser
    // cannot know that, and asserting it would be fabricated detection.
    for (const permission of ["granted", "denied", "prompt", "unsupported"] as const) {
      const result = environmentCheck({
        screenDetailsSupported: permission !== "unsupported",
        screenCount: permission === "granted" ? 1 : null,
        permission,
        videoInputs: 1,
        audioInputs: 1,
      });
      expect(result.detail).not.toMatch(/no (second|external|other)/i);
      expect(result.browserLimited).toBe(true);
    }
  });

  it("warns, without blocking, when several displays are detected", () => {
    const result = environmentCheck({
      screenDetailsSupported: true,
      screenCount: 3,
      permission: "granted",
      videoInputs: 1,
      audioInputs: 1,
    });
    expect(result.status).toBe("LIMITED");
    expect(result.detail).toMatch(/3 displays detected/);
    expect(result.detail).toMatch(/primary display/i);
  });

  it("reports the devices it did enumerate, pluralised", () => {
    expect(
      environmentCheck({
        screenDetailsSupported: false,
        screenCount: null,
        permission: "unsupported",
        videoInputs: 2,
        audioInputs: 1,
      }).detail,
    ).toContain("2 cameras and 1 microphone detected");
  });

  it("stays limited even with a single display", () => {
    // Absence of evidence is not evidence of absence: one screen visible to
    // the window system does not mean one screen in the room.
    const result = environmentCheck({
      screenDetailsSupported: true,
      screenCount: 1,
      permission: "granted",
      videoInputs: 1,
      audioInputs: 1,
    });
    expect(result.browserLimited).toBe(true);
    expect(result.detail).toMatch(/cannot verify anything beyond/i);
  });
});

describe("joining", () => {
  it("allows joining when the microphone and service are proven", () => {
    expect(canJoin(allReady())).toBe(true);
    expect(blockingReason(allReady())).toBeNull();
  });

  it("blocks on an unproven microphone", () => {
    const results = allReady().map((result) =>
      result.id === "microphone" ? microphoneCheck({ trackLive: true, peakLevel: 0 }) : result,
    );
    expect(canJoin(results)).toBe(false);
    expect(blockingReason(results)).toMatch(/speak for a moment/i);
  });

  it("blocks on an unreachable service", () => {
    const results = allReady().map((result) =>
      result.id === "connection"
        ? connectionCheck({ online: true, probe: "failed" })
        : result,
    );
    expect(canJoin(results)).toBe(false);
    expect(blockingReason(results)).toMatch(/not reachable/i);
  });

  it("does not require a camera", () => {
    // Audio-only is a supported mode, so a missing camera must not be a gate.
    const results = allReady().map((result) =>
      result.id === "camera"
        ? cameraCheck({ trackLive: false, framesSeen: 0, error: "not-found" })
        : result,
    );
    expect(canJoin(results)).toBe(true);
    expect(videoEnabled(results)).toBe(false);
  });

  it("does not let the environment check block anyone", () => {
    // It can never be conclusive, so it can never be a gate.
    const results = allReady().map((result) =>
      result.id === "environment"
        ? environmentCheck({
            screenDetailsSupported: true,
            screenCount: 4,
            permission: "granted",
            videoInputs: 1,
            audioInputs: 1,
          })
        : result,
    );
    expect(canJoin(results)).toBe(true);
  });
});

describe("device labels", () => {
  it("numbers an unlabelled device rather than describing it", () => {
    // Before permission the label is empty, and guessing built-in vs external
    // from a vendor string is exactly the fabrication to avoid.
    expect(deviceLabel({ deviceId: "a", label: "", kind: "videoinput" }, 0)).toBe("Camera 1");
    expect(deviceLabel({ deviceId: "b", label: "  ", kind: "audioinput" }, 1)).toBe(
      "Microphone 2",
    );
    expect(deviceLabel({ deviceId: "c", label: "", kind: "audiooutput" }, 2)).toBe("Speaker 3");
  });

  it("uses the real label when the browser gives one", () => {
    expect(
      deviceLabel({ deviceId: "a", label: "Logitech BRIO", kind: "videoinput" }, 0),
    ).toBe("Logitech BRIO");
  });
});

describe("media error classification", () => {
  it.each([
    ["NotAllowedError", "denied"],
    ["SecurityError", "denied"],
    ["NotFoundError", "not-found"],
    ["OverconstrainedError", "not-found"],
    ["NotReadableError", "in-use"],
    ["TypeError", "unsupported"],
    [undefined, "other"],
  ] as const)("maps %s", (name, expected) => {
    expect(classifyMediaError(name)).toBe(expected);
  });
});
