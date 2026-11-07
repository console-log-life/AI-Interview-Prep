import { describe, expect, it } from "vitest";

import {
  TRANSCRIPT_MAX_WAIT_MS,
  TRANSCRIPT_POST_FLUSH_GRACE_MS,
  TRANSCRIPT_STABLE_MS,
} from "@/lib/ai/live/config";
import {
  appendFragment,
  assembled,
  resetBuffer,
  transcriptOutcome,
  type TranscriptBuffer,
} from "@/lib/ai/live/transcript-buffer";
import { DEFAULT_TURN_CONFIG } from "@/lib/ai/live/turn-taking";

/**
 * Input-transcription accumulation.
 *
 * These tests replay sequences captured from the real Live API, including the
 * fragment that arrives *after* `activityEnd`. That late tail is what made
 * every answer lose its final clause, so it is reproduced here exactly rather
 * than approximated — a regression would otherwise only be visible with a
 * microphone.
 */

const CONFIG = {
  stableMs: TRANSCRIPT_STABLE_MS,
  postFlushGraceMs: TRANSCRIPT_POST_FLUSH_GRACE_MS,
  maxWaitMs: TRANSCRIPT_MAX_WAIT_MS,
};

/** `activityEnd` in the captured run. The stabilization wait starts here. */
const FLUSH_AT_MS = 6894;

/** Feeds fragments at given offsets, returning the buffer. */
function feed(
  fragments: Array<[atMs: number, text: string]>,
  from: TranscriptBuffer = resetBuffer(),
): TranscriptBuffer {
  return fragments.reduce(
    (buffer, [atMs, text]) => appendFragment(buffer, text, atMs),
    from,
  );
}

/**
 * The exact sequence observed for
 * "I am a software engineering student preparing for technical interviews."
 *
 * Offsets are the measured arrival times. Everything up to and including
 * "PARING" arrived before `activityEnd` at 6894ms; " FOR TECHNICAL INTERVIEWS."
 * arrived after it.
 */
const OBSERVED_BEFORE_FLUSH: Array<[number, string]> = [
  [3170, " I"],
  [3441, " AM"],
  [3761, " A"],
  [3911, " SO"],
  [4079, "FTWA"],
  [4270, "RE"],
  [4534, " ENG"],
  [4618, "INE"],
  [4793, "ERING"],
  [4947, " STU"],
  [5114, "DENT"],
  [5498, " PRE"],
  [5691, "PARING"],
];

const OBSERVED_TAIL: Array<[number, string]> = [
  [7673, " FOR TECHNICAL INTERVIEWS."],
];

describe("fragments are deltas, not snapshots", () => {
  it("assembles the complete sentence from the observed fragments", () => {
    const buffer = feed([...OBSERVED_BEFORE_FLUSH, ...OBSERVED_TAIL]);
    expect(assembled(buffer)).toBe(
      "I AM A SOFTWARE ENGINEERING STUDENT PREPARING FOR TECHNICAL INTERVIEWS.",
    );
  });

  it("does not lose the clause that arrives after activityEnd", () => {
    // This is the bug. Finalizing at the flush yields a truncated answer.
    const atFlush = assembled(feed(OBSERVED_BEFORE_FLUSH));
    const complete = assembled(feed([...OBSERVED_BEFORE_FLUSH, ...OBSERVED_TAIL]));

    expect(atFlush).not.toContain("TECHNICAL INTERVIEWS");
    expect(complete).toContain("TECHNICAL INTERVIEWS");
  });

  it("would have produced only the last fragment under the old behaviour", () => {
    // What replacing rather than appending gave us: "PARING".
    const replaced = OBSERVED_BEFORE_FLUSH.reduce((_, [, text]) => text, "");
    expect(replaced).toBe("PARING");
    expect(assembled(feed(OBSERVED_BEFORE_FLUSH))).not.toBe(replaced);
  });

  it("joins sub-word fragments without inserting spaces", () => {
    // " SO" + "FTWA" + "RE" must be one word.
    expect(assembled(feed([[0, " SO"], [1, "FTWA"], [2, "RE"]]))).toBe("SOFTWARE");
  });

  it("keeps the space that a fragment carries", () => {
    expect(assembled(feed([[0, " I"], [1, " am a"], [2, " test"]]))).toBe("I am a test");
  });

  it("normalizes the doubled whitespace fragment boundaries create", () => {
    expect(assembled(feed([[0, "one "], [1, "  two"], [2, "  "], [3, "three "]]))).toBe(
      "one two three",
    );
  });

  it("ignores empty fragments rather than storing them", () => {
    const buffer = feed([[0, " real"], [1, ""], [2, " words"]]);
    expect(buffer.parts).toHaveLength(2);
    expect(assembled(buffer)).toBe("real words");
  });

  it("preserves the last clause of a technical answer", () => {
    // The requirement stated explicitly: both halves must survive.
    const buffer = feed([
      [0, " I would use"],
      [200, " Postgre"],
      [400, "SQL"],
      [800, " because we need"],
      [1200, " transactional"],
      [1600, " consistency."],
    ]);
    const text = assembled(buffer);
    expect(text).toContain("PostgreSQL");
    expect(text).toContain("transactional consistency");
  });
});

describe("completion is inferred from silence, never from `finished`", () => {
  it("does not report the answer complete before the flush delivers the tail", () => {
    // The trap this policy exists for: transcription stalls BEFORE activityEnd,
    // so when the wait begins the buffer has already been quiet for 1203ms —
    // longer than the stabilization window. A plain quiet check finalizes here
    // and loses the tail entirely.
    const beforeTail = feed(OBSERVED_BEFORE_FLUSH);
    expect(
      transcriptOutcome(
        beforeTail,
        { waitStartedAtMs: FLUSH_AT_MS, nowMs: FLUSH_AT_MS },
        CONFIG,
      ),
    ).toBe("PENDING");
  });

  it("holds through the measured post-flush gap", () => {
    // The tail arrived 779ms after the flush in the captured run.
    const beforeTail = feed(OBSERVED_BEFORE_FLUSH);
    expect(
      transcriptOutcome(
        beforeTail,
        { waitStartedAtMs: FLUSH_AT_MS, nowMs: 7673 },
        CONFIG,
      ),
    ).toBe("PENDING");
  });

  it("keeps waiting while the tail is still arriving", () => {
    const withTail = feed([...OBSERVED_BEFORE_FLUSH, ...OBSERVED_TAIL]);
    expect(
      transcriptOutcome(
        withTail,
        { waitStartedAtMs: FLUSH_AT_MS, nowMs: 7673 + 200 },
        CONFIG,
      ),
    ).toBe("PENDING");
  });

  it("does not finalize inside the largest observed mid-utterance gap", () => {
    // Widest gap measured while words were still flowing was ~600ms.
    const withTail = feed([...OBSERVED_BEFORE_FLUSH, ...OBSERVED_TAIL]);
    expect(
      transcriptOutcome(
        withTail,
        { waitStartedAtMs: FLUSH_AT_MS, nowMs: 7673 + 600 },
        CONFIG,
      ),
    ).toBe("PENDING");
  });

  it("finalizes once the tail has gone quiet", () => {
    const withTail = feed([...OBSERVED_BEFORE_FLUSH, ...OBSERVED_TAIL]);
    expect(
      transcriptOutcome(
        withTail,
        { waitStartedAtMs: FLUSH_AT_MS, nowMs: 7673 + TRANSCRIPT_STABLE_MS },
        CONFIG,
      ),
    ).toBe("STABLE");
  });

  it("gives up after the grace period when no tail ever comes", () => {
    // Many turns have nothing outstanding. Waiting the full cap every time
    // would add seconds of dead air for no gain.
    const beforeTail = feed(OBSERVED_BEFORE_FLUSH);
    expect(
      transcriptOutcome(
        beforeTail,
        {
          waitStartedAtMs: FLUSH_AT_MS,
          nowMs: FLUSH_AT_MS + TRANSCRIPT_POST_FLUSH_GRACE_MS,
        },
        CONFIG,
      ),
    ).toBe("STABLE");
  });

  it("caps the wait so a stalled transcription cannot hang the interview", () => {
    const buffer = feed(OBSERVED_BEFORE_FLUSH);
    expect(
      transcriptOutcome(
        buffer,
        { waitStartedAtMs: 0, nowMs: TRANSCRIPT_MAX_WAIT_MS },
        CONFIG,
      ),
    ).toBe("CAPPED");
  });

  it("never reports an empty buffer as stable", () => {
    // Otherwise a turn where nothing was transcribed finalizes instantly as an
    // empty answer.
    expect(
      transcriptOutcome(resetBuffer(), { waitStartedAtMs: 0, nowMs: 3000 }, CONFIG),
    ).toBe("PENDING");
  });

  it("caps an empty buffer rather than waiting forever", () => {
    expect(
      transcriptOutcome(
        resetBuffer(),
        { waitStartedAtMs: 0, nowMs: TRANSCRIPT_MAX_WAIT_MS + 1 },
        CONFIG,
      ),
    ).toBe("CAPPED");
  });
});

describe("serverTurnComplete is the authoritative completion signal", () => {
  it("finalizes immediately when the server closes the turn", () => {
    // No reason to sit through a timer once the server has said the turn is
    // done. Measured arriving 1ms after the final fragment.
    const withTail = feed([...OBSERVED_BEFORE_FLUSH, ...OBSERVED_TAIL]);
    expect(
      transcriptOutcome(
        withTail,
        { waitStartedAtMs: FLUSH_AT_MS, nowMs: 7674, serverTurnComplete: true },
        CONFIG,
      ),
    ).toBe("STABLE");
  });

  it("is not trusted before the tail has arrived", () => {
    // The API disclaims ordering between transcription and the model turn, so
    // a turnComplete that races ahead of the final fragment must not finalize.
    const beforeTail = feed(OBSERVED_BEFORE_FLUSH);
    expect(
      transcriptOutcome(
        beforeTail,
        {
          waitStartedAtMs: FLUSH_AT_MS,
          nowMs: FLUSH_AT_MS + 100,
          serverTurnComplete: true,
        },
        CONFIG,
      ),
    ).toBe("PENDING");
  });

  it("still refuses to finalize an empty buffer", () => {
    // A turnComplete with nothing transcribed is a silent turn, not an answer.
    expect(
      transcriptOutcome(
        resetBuffer(),
        { waitStartedAtMs: 0, nowMs: 100, serverTurnComplete: true },
        CONFIG,
      ),
    ).toBe("PENDING");
  });

  it("beats the quiet timer once the tail has landed", () => {
    // With the tail in, turnComplete finalizes immediately instead of sitting
    // through the full stabilization window.
    const withTail = feed([...OBSERVED_BEFORE_FLUSH, ...OBSERVED_TAIL]);
    const justAfterTail = { waitStartedAtMs: FLUSH_AT_MS, nowMs: 7673 + 10 };
    expect(transcriptOutcome(withTail, justAfterTail, CONFIG)).toBe("PENDING");
    expect(
      transcriptOutcome(withTail, { ...justAfterTail, serverTurnComplete: true }, CONFIG),
    ).toBe("STABLE");
  });
});

describe("a spoken pause must not be mistaken for the end of an answer", () => {
  it("survives the measured 1085ms transcription gap", () => {
    // The regression that produced "I would use PostgreSQL. We need" with the
    // final clause missing. The candidate's 1s thinking pause reappears as a
    // hole in the fragment stream, and a stabilization window shorter than it
    // finalizes inside the hole.
    const MID_GAP_MS = 1085;
    const buffer = feed([
      [0, " I WOULD USE"],
      [500, " POSTGRES"],
      [900, " BECAUSE"],
      // The pause.
      [900 + MID_GAP_MS, " WE NEED"],
      [900 + MID_GAP_MS + 400, " TRANSACTIONAL CONSISTENCY"],
    ]);

    // Mid-gap, with the flush already sent: must NOT finalize.
    const midGap = feed([
      [0, " I WOULD USE"],
      [500, " POSTGRES"],
      [900, " BECAUSE"],
    ]);
    expect(
      transcriptOutcome(
        midGap,
        { waitStartedAtMs: 0, nowMs: 900 + MID_GAP_MS - 1 },
        CONFIG,
      ),
    ).toBe("PENDING");

    expect(assembled(buffer)).toContain("TRANSACTIONAL CONSISTENCY");
  });

  it("uses a stabilization window wider than the longest tolerated pause", () => {
    // Turn detection waits DEFAULT_TURN_CONFIG.silenceMs (1800ms) before
    // deciding a candidate has stopped. The transcript must be given at least
    // that long, or it finalizes inside a pause the detector deliberately
    // allowed.
    expect(TRANSCRIPT_STABLE_MS).toBeGreaterThanOrEqual(
      DEFAULT_TURN_CONFIG.silenceMs,
    );
  });
});

describe("chosen timings are consistent with the measurements", () => {
  it("tolerates the worst observed tail delay after the flush", () => {
    // Worst measured: 1922ms between activityEnd and the final fragment.
    expect(TRANSCRIPT_POST_FLUSH_GRACE_MS).toBeGreaterThan(1922);
    expect(TRANSCRIPT_MAX_WAIT_MS).toBeGreaterThan(3237);
  });

  it("stabilization exceeds the worst observed mid-utterance gap", () => {
    // 1085ms, from a 1s spoken pause reappearing in the fragment stream.
    expect(TRANSCRIPT_STABLE_MS).toBeGreaterThan(1085);
  });
});

describe("reset", () => {
  it("clears both the parts and the clock", () => {
    const buffer = feed(OBSERVED_BEFORE_FLUSH);
    expect(assembled(buffer)).not.toBe("");
    const cleared = resetBuffer();
    expect(cleared.parts).toHaveLength(0);
    expect(cleared.lastFragmentAtMs).toBe(0);
    expect(assembled(cleared)).toBe("");
  });

  it("is not shared between turns", () => {
    const first = feed([[0, " first answer"]]);
    const second = feed([[100, " second answer"]], resetBuffer());
    expect(assembled(first)).toBe("first answer");
    expect(assembled(second)).toBe("second answer");
  });
});
