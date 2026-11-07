import { describe, expect, it } from "vitest";

import {
  LONG_PAUSE_MS,
  PACE_BANDS,
  PACE_SCALE_MAX_WPM,
  SHORT_ANSWER_WORDS,
  summarizeSpeech,
  wordCount,
  type SpeechTurn,
} from "@/lib/interviews/speech-metrics";

/**
 * Speaking-behaviour metrics.
 *
 * The interesting cases are the ones where a number would be misleading: too
 * few words to quote a pace, filler counts that a speech-to-text layer has
 * already stripped, a "pace shift" computed from two answers. Each is checked
 * to withhold rather than to guess.
 */

/** Builds a turn of `words` words spoken over `seconds`. */
function turn(
  words: number,
  seconds: number,
  index: number,
  text?: string,
  pauses: number[] = [],
): SpeechTurn {
  const startedAtMs = index * 60_000;
  return {
    text: text ?? Array.from({ length: words }, (_, i) => `word${i}`).join(" "),
    startedAtMs,
    endedAtMs: startedAtMs + seconds * 1000,
    pauseMsWithin: pauses,
    questionIndex: index + 1,
  };
}

describe("no data", () => {
  it("says nothing was spoken rather than reporting zeroes as findings", () => {
    const summary = summarizeSpeech([]);
    expect(summary.wordsPerMinute).toBeNull();
    expect(summary.paceBand).toBeNull();
    expect(summary.observations).toHaveLength(0);
    expect(summary.limitations.join(" ")).toMatch(/did not speak/i);
  });
});

describe("pace", () => {
  it("withholds a rate when there is too little speech", () => {
    const summary = summarizeSpeech([turn(20, 10, 0)]);
    expect(summary.wordsPerMinute).toBeNull();
    expect(summary.limitations.join(" ")).toMatch(/too little to report a speaking pace/i);
  });

  it("computes words per minute over measured speaking time", () => {
    // 150 words in 60 seconds.
    const summary = summarizeSpeech([turn(150, 60, 0)]);
    expect(summary.wordsPerMinute).toBe(150);
    expect(summary.paceBand).toBe("CONVERSATIONAL");
  });

  it.each([
    [80, 60, "MEASURED"],
    [140, 60, "CONVERSATIONAL"],
    [180, 60, "BRISK"],
    [220, 60, "RUSHED"],
  ] as const)("bands %i words in %is as %s", (words, seconds, band) => {
    expect(summarizeSpeech([turn(words, seconds, 0)]).paceBand).toBe(band);
  });

  it("advises on a rushed delivery without diagnosing the candidate", () => {
    const summary = summarizeSpeech([turn(240, 60, 0)]);
    const text = summary.observations.join(" ");
    expect(text).toMatch(/words per minute/);
    expect(text).not.toMatch(/nervous|anxious|panicked/i);
  });
});

describe("pace shift", () => {
  it("is withheld with too few turns to be meaningful", () => {
    const summary = summarizeSpeech([turn(100, 40, 0), turn(100, 40, 1), turn(100, 40, 2)]);
    expect(summary.paceShift).toBeNull();
  });

  it("reports a rise across the interview", () => {
    const turns = [
      turn(100, 60, 0),
      turn(100, 60, 1),
      turn(200, 60, 2),
      turn(200, 60, 3),
    ];
    const summary = summarizeSpeech(turns);
    expect(summary.paceShift).toEqual({
      earlyWpm: 100,
      lateWpm: 200,
      deltaPercent: 100,
    });
    expect(summary.observations.join(" ")).toMatch(/pace rose from about 100 to 200/i);
  });

  it("reports a fall too", () => {
    const turns = [
      turn(200, 60, 0),
      turn(200, 60, 1),
      turn(100, 60, 2),
      turn(100, 60, 3),
    ];
    expect(summarizeSpeech(turns).observations.join(" ")).toMatch(/pace fell/i);
  });
});

describe("fillers", () => {
  it("counts unambiguous vocal fillers", () => {
    const text = `um so I built the service uh and then um we deployed it ${"word ".repeat(80)}`;
    const summary = summarizeSpeech([turn(0, 60, 0, text)]);
    const um = summary.fillers.find((entry) => entry.term === "um");
    expect(um?.count).toBe(2);
    expect(summary.fillers.find((entry) => entry.term === "uh")?.count).toBe(1);
  });

  it("does not count ordinary words as fillers", () => {
    // "actually" and "like" are excluded deliberately: counting them produces
    // a confident number that is simply wrong.
    const text = `I actually like the way we structured it and it literally halved the latency ${"word ".repeat(80)}`;
    const summary = summarizeSpeech([turn(0, 60, 0, text)]);
    for (const term of ["actually", "like", "literally"]) {
      expect(summary.fillers.find((entry) => entry.term === term)).toBeUndefined();
    }
  });

  it("never matches a filler inside a longer word", () => {
    // "er" must not fire on "interview", "server" or "performance".
    const text = `the interview covered server performance and error budgets ${"word ".repeat(80)}`;
    const summary = summarizeSpeech([turn(0, 60, 0, text)]);
    expect(summary.fillers.find((entry) => entry.term === "er")).toBeUndefined();
  });

  it("counts hedges separately from vocal fillers", () => {
    const text = `you know it was sort of a queue and I mean it worked ${"word ".repeat(80)}`;
    const summary = summarizeSpeech([turn(0, 60, 0, text)]);
    const terms = summary.fillers.map((entry) => entry.term);
    expect(terms).toEqual(expect.arrayContaining(["you know", "sort of", "i mean"]));
  });

  it("always declares the count a lower bound", () => {
    // Speech-to-text removes disfluency, so this can never be a measurement of
    // how the candidate actually spoke.
    const summary = summarizeSpeech([turn(150, 60, 0)]);
    expect(summary.fillersAreLowerBound).toBe(true);
    expect(summary.limitations.join(" ")).toMatch(/lower bound/i);
  });
});

describe("pauses", () => {
  it("counts only pauses past the audible threshold", () => {
    const summary = summarizeSpeech([
      turn(150, 60, 0, undefined, [500, LONG_PAUSE_MS, LONG_PAUSE_MS + 1000]),
    ]);
    expect(summary.longPauses).toBe(2);
  });

  it("is zero when the candidate spoke without stopping", () => {
    expect(summarizeSpeech([turn(150, 60, 0)]).longPauses).toBe(0);
  });
});

describe("answer length", () => {
  it("flags a pattern of very short answers", () => {
    const turns = [
      turn(SHORT_ANSWER_WORDS - 5, 10, 0),
      turn(SHORT_ANSWER_WORDS - 5, 10, 1),
      turn(SHORT_ANSWER_WORDS - 5, 10, 2),
      turn(120, 50, 3),
    ];
    const summary = summarizeSpeech(turns);
    expect(summary.shortAnswers).toBe(3);
    expect(summary.observations.join(" ")).toMatch(/under 25 words/i);
  });

  it("does not flag a single short answer", () => {
    const turns = [turn(10, 5, 0), turn(120, 50, 1), turn(120, 50, 2), turn(120, 50, 3)];
    expect(summarizeSpeech(turns).observations.join(" ")).not.toMatch(/under 25 words/i);
  });
});

describe("self-correction", () => {
  it("counts audible restarts", () => {
    const text = `we used redis actually no we used memcached sorry i mean the cache layer let me rephrase ${"word ".repeat(80)}`;
    const summary = summarizeSpeech([turn(0, 60, 0, text)]);
    expect(summary.selfCorrections).toBeGreaterThanOrEqual(3);
    expect(summary.observations.join(" ")).toMatch(/restarted or corrected yourself/i);
  });

  it("stays quiet below the reporting threshold", () => {
    const summary = summarizeSpeech([turn(0, 60, 0, `actually no ${"word ".repeat(80)}`)]);
    expect(summary.selfCorrections).toBe(1);
    expect(summary.observations.join(" ")).not.toMatch(/restarted/i);
  });
});

describe("the drawable pace bands match the classifier", () => {
  it("agrees with paceBandFor at every rate", () => {
    // PACE_BANDS is only for rendering a scale. If it ever disagrees with the
    // function that actually classifies answers, the UI would be drawing a
    // threshold the product does not use.
    for (let wpm = 0; wpm <= 400; wpm += 1) {
      const fromTable = PACE_BANDS.find(
        (entry) => wpm >= entry.minWpm && (entry.maxWpm === null || wpm <= entry.maxWpm),
      );
      // 150 words over 60s is exactly `wpm`, so the summary reports that rate.
      const summary = summarizeSpeech([turn(wpm, 60, 0)]);
      if (summary.paceBand === null) continue;
      expect(fromTable?.band, `wpm=${wpm}`).toBe(summary.paceBand);
    }
  });

  it("covers the whole range without gaps or overlaps", () => {
    expect(PACE_BANDS[0].minWpm).toBe(0);
    expect(PACE_BANDS.at(-1)!.maxWpm).toBeNull();
    for (let i = 1; i < PACE_BANDS.length; i += 1) {
      expect(PACE_BANDS[i].minWpm).toBe(PACE_BANDS[i - 1].maxWpm! + 1);
    }
  });

  it("draws a scale that reaches into the top band", () => {
    expect(PACE_SCALE_MAX_WPM).toBeGreaterThan(PACE_BANDS.at(-1)!.minWpm);
  });
});

describe("wordCount", () => {
  it("ignores extra whitespace", () => {
    expect(wordCount("  one   two \n three  ")).toBe(3);
    expect(wordCount("   ")).toBe(0);
  });
});
