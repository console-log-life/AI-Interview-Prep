/**
 * Speech metrics — pure functions, no I/O.
 *
 * The governing rule: **never infer a metric the data cannot support.**
 * Pause analysis needs word-level timings; if the provider did not return
 * them, the pause fields are `null` rather than a plausible-looking guess.
 * Every field here is computed from something actually measured.
 *
 * Nothing here makes a psychological claim. "12 filler words in 90 seconds"
 * is an observation; "sounds nervous" is not, and is deliberately absent.
 */

export type Word = {
  word: string;
  startSec: number;
  endSec: number;
};

/** Common English fillers, plus ones frequent in Indian-English speech. */
export const FILLER_WORDS = [
  "um", "uh", "erm", "ah", "eh", "hmm", "mmm",
  "like", "actually", "basically", "literally",
  "yeah", "so", "right", "okay", "well",
] as const;

/** Fillers only counted when they are genuinely discourse padding. */
const CONTEXTUAL_FILLERS = new Set([
  "like", "actually", "basically", "literally", "so", "right", "okay", "well", "yeah",
]);

export type SpeechMetrics = {
  wordCount: number;
  /** Null when the provider gave no duration. */
  durationSec: number | null;
  /** Null without a duration — words per minute is undefined otherwise. */
  wordsPerMinute: number | null;
  fillerCount: number;
  /** Fillers per 100 words. */
  fillerRate: number;
  fillerBreakdown: Array<{ word: string; count: number }>;
  /** Null without word timings. */
  longestPauseSec: number | null;
  /** Null without word timings. */
  totalPauseSec: number | null;
  pauseCount: number | null;
  /** Distinct words / total words, 0-1. */
  lexicalDiversity: number;
  repeatedWords: Array<{ word: string; count: number }>;
  /** Which metrics could not be computed, and why. */
  unavailable: string[];
};

/** A gap longer than this counts as a deliberate pause, not word spacing. */
export const PAUSE_THRESHOLD_SEC = 0.7;

export function analyzeSpeech(args: {
  transcript: string;
  durationSec?: number | null;
  words?: Word[];
}): SpeechMetrics {
  const unavailable: string[] = [];

  const tokens = args.transcript
    .toLowerCase()
    .replace(/[^a-z0-9'\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  const wordCount = tokens.length;

  // --- Fillers ------------------------------------------------------------
  const fillerCounts = new Map<string, number>();
  for (const [index, token] of tokens.entries()) {
    if (!FILLER_WORDS.includes(token as (typeof FILLER_WORDS)[number])) continue;

    // "so" starting a sentence is padding; "so" mid-clause is often meaningful.
    // Only the unambiguous fillers are counted unconditionally.
    if (CONTEXTUAL_FILLERS.has(token)) {
      const isSentenceStart = index === 0 || isBoundary(tokens[index - 1]);
      if (!isSentenceStart) continue;
    }
    fillerCounts.set(token, (fillerCounts.get(token) ?? 0) + 1);
  }

  const fillerCount = [...fillerCounts.values()].reduce(
    (sum, count) => sum + count,
    0,
  );

  // --- Pace ---------------------------------------------------------------
  const durationSec = args.durationSec ?? null;
  let wordsPerMinute: number | null = null;
  if (durationSec && durationSec > 0) {
    wordsPerMinute = Math.round((wordCount / durationSec) * 60);
  } else {
    unavailable.push(
      "Speaking pace needs the audio duration, which this transcript does not include.",
    );
  }

  // --- Pauses -------------------------------------------------------------
  let longestPauseSec: number | null = null;
  let totalPauseSec: number | null = null;
  let pauseCount: number | null = null;

  if (args.words && args.words.length > 1) {
    let longest = 0;
    let total = 0;
    let count = 0;
    for (let index = 1; index < args.words.length; index += 1) {
      const gap = args.words[index].startSec - args.words[index - 1].endSec;
      if (gap >= PAUSE_THRESHOLD_SEC) {
        count += 1;
        total += gap;
        if (gap > longest) longest = gap;
      }
    }
    longestPauseSec = round(longest);
    totalPauseSec = round(total);
    pauseCount = count;
  } else {
    unavailable.push(
      "Pause analysis needs word-level timings, which this provider did not return.",
    );
  }

  // --- Repetition ---------------------------------------------------------
  const contentCounts = new Map<string, number>();
  for (const token of tokens) {
    if (token.length <= 3) continue;
    if (FILLER_WORDS.includes(token as (typeof FILLER_WORDS)[number])) continue;
    contentCounts.set(token, (contentCounts.get(token) ?? 0) + 1);
  }

  const repeatedWords = [...contentCounts.entries()]
    .filter(([, count]) => count >= 4)
    .map(([word, count]) => ({ word, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  const distinct = new Set(tokens).size;

  return {
    wordCount,
    durationSec,
    wordsPerMinute,
    fillerCount,
    fillerRate: wordCount > 0 ? round((fillerCount / wordCount) * 100) : 0,
    fillerBreakdown: [...fillerCounts.entries()]
      .map(([word, count]) => ({ word, count }))
      .sort((a, b) => b.count - a.count),
    longestPauseSec,
    totalPauseSec,
    pauseCount,
    lexicalDiversity: wordCount > 0 ? round(distinct / wordCount, 2) : 0,
    repeatedWords,
    unavailable,
  };
}

/**
 * Interpretation bands for speaking pace.
 * Ranges are conventional presentation guidance, not a scientific claim.
 */
export function paceAssessment(
  wordsPerMinute: number | null,
): { band: "slow" | "comfortable" | "fast"; note: string } | null {
  if (wordsPerMinute === null) return null;
  if (wordsPerMinute < 110) {
    return {
      band: "slow",
      note: "Slower than a typical interview pace. Fine for complex explanations, but check you are not leaving long gaps.",
    };
  }
  if (wordsPerMinute > 170) {
    return {
      band: "fast",
      note: "Faster than a typical interview pace. Slowing down usually improves how much the interviewer retains.",
    };
  }
  return {
    band: "comfortable",
    note: "Within the usual comfortable range for interview speech.",
  };
}

function isBoundary(token: string | undefined): boolean {
  return token === undefined || /[.!?]$/.test(token);
}

function round(value: number, digits = 1): number {
  const factor = Math.pow(10, digits);
  return Math.round(value * factor) / factor;
}
