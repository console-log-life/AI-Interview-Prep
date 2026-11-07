import { describe, expect, it } from "vitest";

import { ServiceUnavailableError, ValidationError } from "@/lib/api/errors";
import {
  STT_UNAVAILABLE_MESSAGE,
  TTS_UNAVAILABLE_MESSAGE,
  getSttProvider,
  getTtsProvider,
  sttAvailable,
  ttsAvailable,
  validateAudioUpload,
} from "@/lib/voice";
import {
  FILLER_WORDS,
  PAUSE_THRESHOLD_SEC,
  analyzeSpeech,
  paceAssessment,
  type Word,
} from "@/lib/voice/metrics";
import { ALLOWED_AUDIO_TYPES, MAX_AUDIO_BYTES } from "@/lib/voice/types";

/**
 * The governing rule for voice: never invent data. If no provider is
 * configured there is no transcript; if the provider returned no word timings
 * there are no pause metrics. These tests hold that line.
 */

function words(pairs: Array<[string, number, number]>): Word[] {
  return pairs.map(([word, startSec, endSec]) => ({ word, startSec, endSec }));
}

describe("provider availability with nothing configured", () => {
  // The test environment has no VOICE_* variables set, which is exactly the
  // "unconfigured deployment" case the UI must handle.
  it("reports both providers as unavailable", () => {
    expect(sttAvailable()).toBe(false);
    expect(ttsAvailable()).toBe(false);
  });

  it("throws a typed 503 naming the env vars, not a generic error", () => {
    expect(() => getSttProvider()).toThrow(ServiceUnavailableError);
    try {
      getSttProvider();
    } catch (error) {
      expect((error as ServiceUnavailableError).message).toBe(
        STT_UNAVAILABLE_MESSAGE,
      );
      expect((error as ServiceUnavailableError).message).toContain(
        "VOICE_STT_PROVIDER",
      );
    }
  });

  it("does the same for text-to-speech", () => {
    expect(() => getTtsProvider()).toThrow(ServiceUnavailableError);
    try {
      getTtsProvider();
    } catch (error) {
      expect((error as ServiceUnavailableError).message).toBe(
        TTS_UNAVAILABLE_MESSAGE,
      );
    }
  });

  it("never mentions an API key value in the message", () => {
    expect(STT_UNAVAILABLE_MESSAGE).not.toMatch(/sk-|Bearer|=[A-Za-z0-9]{8}/);
    expect(TTS_UNAVAILABLE_MESSAGE).not.toMatch(/sk-|Bearer|=[A-Za-z0-9]{8}/);
  });
});

describe("validateAudioUpload", () => {
  function audioFile(
    bytes: number,
    type: string,
    name = "answer.webm",
  ): File {
    return new File([new Uint8Array(bytes)], name, { type });
  }

  it("accepts a normal recording", async () => {
    const result = await validateAudioUpload(audioFile(1024, "audio/webm"));
    expect(result.mimeType).toBe("audio/webm");
    expect(result.buffer.length).toBe(1024);
  });

  it("strips codec parameters from the declared type", async () => {
    const result = await validateAudioUpload(
      audioFile(512, "audio/webm;codecs=opus"),
    );
    expect(result.mimeType).toBe("audio/webm");
  });

  it("rejects an empty recording", async () => {
    await expect(
      validateAudioUpload(audioFile(0, "audio/webm")),
    ).rejects.toThrow(ValidationError);
  });

  it("rejects anything over the size ceiling", async () => {
    const oversized = {
      size: MAX_AUDIO_BYTES + 1,
      type: "audio/webm",
      arrayBuffer: async () => new ArrayBuffer(8),
    } as unknown as File;

    await expect(validateAudioUpload(oversized)).rejects.toThrow(
      ValidationError,
    );
  });

  it("rejects a disallowed format however it is named", async () => {
    await expect(
      validateAudioUpload(audioFile(1024, "application/zip", "answer.webm")),
    ).rejects.toThrow(ValidationError);
  });

  it("accepts every format on the allow-list", async () => {
    for (const type of ALLOWED_AUDIO_TYPES) {
      const result = await validateAudioUpload(audioFile(256, type));
      expect(result.mimeType).toBe(type);
    }
  });
});

describe("analyzeSpeech", () => {
  const transcript =
    "So um I basically built a service that um handles payments and it was like really fast";

  it("counts words and unambiguous fillers", () => {
    const metrics = analyzeSpeech({ transcript, durationSec: 30 });
    expect(metrics.wordCount).toBeGreaterThan(10);
    expect(metrics.fillerCount).toBeGreaterThan(0);
    expect(metrics.fillerBreakdown.some((row) => row.word === "um")).toBe(true);
  });

  it("computes words per minute from a real duration", () => {
    const metrics = analyzeSpeech({
      transcript: Array.from({ length: 120 }, () => "word").join(" "),
      durationSec: 60,
    });
    expect(metrics.wordsPerMinute).toBe(120);
  });

  it("reports words per minute as unavailable without a duration", () => {
    const metrics = analyzeSpeech({ transcript });
    expect(metrics.wordsPerMinute).toBeNull();
    expect(metrics.unavailable.join(" ")).toMatch(/pace|per minute|duration/i);
  });

  it("reports pause metrics as unavailable without word timings", () => {
    const metrics = analyzeSpeech({ transcript, durationSec: 30 });
    expect(metrics.longestPauseSec).toBeNull();
    expect(metrics.totalPauseSec).toBeNull();
    expect(metrics.pauseCount).toBeNull();
    expect(metrics.unavailable.join(" ")).toMatch(/pause/i);
  });

  it("computes pause metrics when word timings are present", () => {
    const metrics = analyzeSpeech({
      transcript: "one two three",
      durationSec: 10,
      words: words([
        ["one", 0, 0.4],
        // A 2 second gap — comfortably over the threshold.
        ["two", 2.4, 2.8],
        ["three", 2.9, 3.2],
      ]),
    });

    expect(metrics.pauseCount).toBe(1);
    expect(metrics.longestPauseSec).toBeCloseTo(2, 1);
    expect(metrics.unavailable.join(" ")).not.toMatch(/pause/i);
  });

  it("ignores gaps below the pause threshold", () => {
    const metrics = analyzeSpeech({
      transcript: "one two",
      durationSec: 5,
      words: words([
        ["one", 0, 0.4],
        ["two", 0.4 + PAUSE_THRESHOLD_SEC / 2, 1.2],
      ]),
    });
    expect(metrics.pauseCount).toBe(0);
  });

  it("handles an empty transcript without dividing by zero", () => {
    const metrics = analyzeSpeech({ transcript: "", durationSec: 10 });
    expect(metrics.wordCount).toBe(0);
    expect(metrics.fillerRate).toBe(0);
    expect(Number.isNaN(metrics.lexicalDiversity)).toBe(false);
  });

  it("keeps lexical diversity within 0-1", () => {
    const metrics = analyzeSpeech({
      transcript: "alpha beta gamma alpha beta alpha",
      durationSec: 10,
    });
    expect(metrics.lexicalDiversity).toBeGreaterThan(0);
    expect(metrics.lexicalDiversity).toBeLessThanOrEqual(1);
  });

  it("has a filler list with no duplicates", () => {
    expect(new Set(FILLER_WORDS).size).toBe(FILLER_WORDS.length);
  });
});

describe("paceAssessment", () => {
  it("returns null rather than a band when pace was not measured", () => {
    // Null propagates all the way to the UI, which then shows no pace badge.
    expect(paceAssessment(null)).toBeNull();
  });

  it("bands slow, comfortable and fast distinctly", () => {
    expect(paceAssessment(80)?.band).toBe("slow");
    expect(paceAssessment(140)?.band).toBe("comfortable");
    expect(paceAssessment(220)?.band).toBe("fast");
  });

  it("never makes a psychological claim", () => {
    for (const wpm of [70, 120, 190, 260]) {
      const result = paceAssessment(wpm);
      expect(`${result?.band} ${result?.note}`.toLowerCase()).not.toMatch(
        /nervous|anxious|confident|unsure|scared/,
      );
    }
  });
});
