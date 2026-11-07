/**
 * Speaking-behaviour metrics — pure, derived from finalized turns.
 *
 * Everything here comes from two things the live session already produces: the
 * finalized transcript of each candidate turn, and the timing the client-side
 * turn detector measured while that turn was spoken. No extra model call, and
 * nothing that depends on how the answer *sounded* beyond what those two can
 * support.
 *
 * The honesty constraint that matters most: **speech-to-text removes
 * disfluency.** Gemini's transcription tidies "um, so, like, I think" into "so
 * I think", so a filler count from a transcript is a lower bound and never a
 * measurement of how the candidate actually spoke. Reporting it as anything
 * else would be inventing a metric, so `fillersAreLowerBound` is part of the
 * result rather than a footnote someone might drop in the UI.
 */

export type SpeechTurn = {
  /** Finalized transcript of one candidate turn. */
  text: string;
  /** Offset from session start when the candidate started speaking. */
  startedAtMs: number;
  /** Offset when the turn was closed. */
  endedAtMs: number;
  /** Silences within the turn, in ms, as measured by the turn detector. */
  pauseMsWithin: number[];
  /** 1-based position in the interview, for the pace trend. */
  questionIndex: number;
};

export type PaceBand = "MEASURED" | "CONVERSATIONAL" | "BRISK" | "RUSHED";

export type SpeechSummary = {
  turns: number;
  words: number;
  totalSpeakingMs: number;
  /** Words per minute across all speaking time. Null when there is too little. */
  wordsPerMinute: number | null;
  paceBand: PaceBand | null;
  /** Distinct filler terms found, most frequent first. */
  fillers: Array<{ term: string; count: number }>;
  /** Fillers per hundred words. Null without enough words to be meaningful. */
  fillersPerHundredWords: number | null;
  /** Always true — see the module comment. */
  fillersAreLowerBound: boolean;
  /** Pauses longer than LONG_PAUSE_MS that occurred mid-answer. */
  longPauses: number;
  meanAnswerWords: number | null;
  /** Answers under SHORT_ANSWER_WORDS — too thin to show reasoning. */
  shortAnswers: number;
  /** Phrases where the candidate audibly restarted or corrected themselves. */
  selfCorrections: number;
  /**
   * Pace early in the interview against pace late in it.
   *
   * Reported as an observation only. A candidate speeding up is a fact about
   * their delivery; calling it nerves would be a claim about their state of
   * mind that no transcript can support.
   */
  paceShift: { earlyWpm: number; lateWpm: number; deltaPercent: number } | null;
  observations: string[];
  limitations: string[];
};

/** Words needed before a rate is worth quoting. Below this it is noise. */
export const MIN_WORDS_FOR_PACE = 60;
/** A pause this long mid-answer is audible to an interviewer as hesitation. */
export const LONG_PAUSE_MS = 2000;
/** Under this, an answer is too short to contain reasoning. */
export const SHORT_ANSWER_WORDS = 25;

/**
 * Unambiguous vocal fillers.
 *
 * Only sounds with no other meaning. "Like" and "actually" are excluded
 * deliberately: both are ordinary English words, and counting every "actually"
 * as a filler would produce a confident number that is simply wrong.
 */
const FILLERS = ["um", "uh", "erm", "er", "ah", "hmm", "mmm", "uhh", "umm"];

/**
 * Hedges. Counted separately and labelled, because each has a legitimate use.
 */
const HEDGES = ["you know", "i mean", "sort of", "kind of", "i guess"];

/** Phrases that mark an audible restart. */
const SELF_CORRECTION = [
  "sorry, i mean",
  "sorry i mean",
  "i mean, no",
  "actually, no",
  "actually no",
  "no wait",
  "wait, no",
  "let me rephrase",
  "let me start again",
  "or rather",
  "scratch that",
  "what i meant",
];

export function summarizeSpeech(turns: SpeechTurn[]): SpeechSummary {
  const limitations: string[] = [
    "Filler words are counted from the transcript. Speech-to-text removes most disfluency, so these counts are a lower bound on how you actually spoke.",
  ];

  if (turns.length === 0) {
    return {
      turns: 0,
      words: 0,
      totalSpeakingMs: 0,
      wordsPerMinute: null,
      paceBand: null,
      fillers: [],
      fillersPerHundredWords: null,
      fillersAreLowerBound: true,
      longPauses: 0,
      meanAnswerWords: null,
      shortAnswers: 0,
      selfCorrections: 0,
      paceShift: null,
      observations: [],
      limitations: [
        "You did not speak during this interview, so there is nothing to analyse.",
      ],
    };
  }

  const observations: string[] = [];

  const perTurnWords = turns.map((turn) => wordCount(turn.text));
  const words = perTurnWords.reduce((sum, count) => sum + count, 0);
  const totalSpeakingMs = turns.reduce(
    (sum, turn) => sum + Math.max(0, turn.endedAtMs - turn.startedAtMs),
    0,
  );

  const wordsPerMinute =
    words >= MIN_WORDS_FOR_PACE && totalSpeakingMs > 0
      ? Math.round(words / (totalSpeakingMs / 60_000))
      : null;

  const paceBand = wordsPerMinute === null ? null : paceBandFor(wordsPerMinute);

  if (wordsPerMinute === null) {
    limitations.push(
      `You spoke ${words} word${words === 1 ? "" : "s"} in total, which is too little to report a speaking pace.`,
    );
  } else if (paceBand === "RUSHED") {
    observations.push(
      `You spoke at about ${wordsPerMinute} words per minute. That is fast enough that an interviewer has to work to keep up — a short pause before answering usually fixes it.`,
    );
  } else if (paceBand === "MEASURED") {
    observations.push(
      `You spoke at about ${wordsPerMinute} words per minute, which is on the slow side. It reads as considered, but leaves less time to cover ground.`,
    );
  }

  // --- fillers -------------------------------------------------------------
  const joined = turns.map((turn) => normalize(turn.text)).join("  ");
  const fillerCounts = new Map<string, number>();

  for (const filler of FILLERS) {
    const count = countWholeWord(joined, filler);
    if (count > 0) fillerCounts.set(filler, count);
  }
  for (const hedge of HEDGES) {
    const count = countPhrase(joined, hedge);
    if (count > 0) fillerCounts.set(hedge, count);
  }

  const fillers = [...fillerCounts.entries()]
    .map(([term, count]) => ({ term, count }))
    .sort((a, b) => b.count - a.count);

  const fillerTotal = fillers.reduce((sum, entry) => sum + entry.count, 0);
  const fillersPerHundredWords =
    words >= MIN_WORDS_FOR_PACE
      ? Math.round((fillerTotal / words) * 1000) / 10
      : null;

  if (fillers.length > 0 && fillersPerHundredWords !== null && fillersPerHundredWords >= 2) {
    const top = fillers
      .slice(0, 3)
      .map((entry) => `"${entry.term}" ${entry.count}×`)
      .join(", ");
    observations.push(
      `Filler and hedging phrases appeared ${fillerTotal} times across your answers (${top}). Hedges like "sort of" and "I guess" are normal in speech, but they make a technical claim sound less certain than you mean it to.`,
    );
  }

  // --- pauses --------------------------------------------------------------
  const longPauses = turns.reduce(
    (sum, turn) => sum + turn.pauseMsWithin.filter((ms) => ms >= LONG_PAUSE_MS).length,
    0,
  );

  // --- answer length -------------------------------------------------------
  const meanAnswerWords = Math.round(words / turns.length);
  const shortAnswers = perTurnWords.filter((count) => count < SHORT_ANSWER_WORDS).length;

  if (shortAnswers >= Math.ceil(turns.length / 3) && turns.length >= 3) {
    observations.push(
      `${shortAnswers} of your ${turns.length} answers were under ${SHORT_ANSWER_WORDS} words. Short answers rarely leave room to explain why you did something, which is what the interviewer is listening for.`,
    );
  }

  // --- self-correction -----------------------------------------------------
  const selfCorrections = SELF_CORRECTION.reduce(
    (sum, phrase) => sum + countPhrase(joined, phrase),
    0,
  );

  if (selfCorrections >= 3) {
    observations.push(
      `You restarted or corrected yourself ${selfCorrections} times mid-answer. Planning the first sentence before you begin usually removes most of them.`,
    );
  }

  // --- pace trend ----------------------------------------------------------
  const paceShift = computePaceShift(turns, perTurnWords);
  if (paceShift && Math.abs(paceShift.deltaPercent) >= 15) {
    observations.push(
      paceShift.deltaPercent > 0
        ? `Your speaking pace rose from about ${paceShift.earlyWpm} to ${paceShift.lateWpm} words per minute between the start and end of the interview.`
        : `Your speaking pace fell from about ${paceShift.earlyWpm} to ${paceShift.lateWpm} words per minute between the start and end of the interview.`,
    );
  }

  return {
    turns: turns.length,
    words,
    totalSpeakingMs,
    wordsPerMinute,
    paceBand,
    fillers,
    fillersPerHundredWords,
    fillersAreLowerBound: true,
    longPauses,
    meanAnswerWords,
    shortAnswers,
    selfCorrections,
    paceShift,
    observations,
    limitations,
  };
}

/**
 * Pace bands.
 *
 * Anchored on conversational English, generally put at 120-160 wpm; public
 * speaking guidance sits nearer 140. The bands are wide because the input is a
 * transcript-derived rate over a handful of turns, not a phonetic measurement.
 */
function paceBandFor(wpm: number): PaceBand {
  if (wpm < 110) return "MEASURED";
  if (wpm <= 160) return "CONVERSATIONAL";
  if (wpm <= 190) return "BRISK";
  return "RUSHED";
}

/**
 * The pace bands, as a table the UI can draw.
 *
 * Purely presentational: `paceBandFor` above is untouched and remains the only
 * thing that classifies an answer. This exists so a scale can be rendered from
 * the product's own thresholds instead of hard-coding numbers into a
 * component, which is how a chart ends up implying a range the logic never
 * defined. A test asserts the two agree across the whole range, so they cannot
 * drift apart.
 */
export const PACE_BANDS: ReadonlyArray<{
  band: PaceBand;
  minWpm: number;
  /** Null on the open-ended top band. */
  maxWpm: number | null;
}> = [
  { band: "MEASURED", minWpm: 0, maxWpm: 109 },
  { band: "CONVERSATIONAL", minWpm: 110, maxWpm: 160 },
  { band: "BRISK", minWpm: 161, maxWpm: 190 },
  { band: "RUSHED", minWpm: 191, maxWpm: null },
];

/** Where the drawn scale stops. The top band is open-ended in the logic. */
export const PACE_SCALE_MAX_WPM = 220;

export const PACE_LABEL: Record<PaceBand, string> = {
  MEASURED: "Measured",
  CONVERSATIONAL: "Conversational",
  BRISK: "Brisk",
  RUSHED: "Rushed",
};

/**
 * Pace at the start against pace at the end.
 *
 * Needs at least four turns so "early" and "late" are each more than a single
 * answer; with fewer, one long or short answer would swing the whole figure.
 */
function computePaceShift(
  turns: SpeechTurn[],
  perTurnWords: number[],
): SpeechSummary["paceShift"] {
  if (turns.length < 4) return null;

  const split = Math.floor(turns.length / 2);
  const early = rateOver(turns.slice(0, split), perTurnWords.slice(0, split));
  const late = rateOver(turns.slice(split), perTurnWords.slice(split));
  if (early === null || late === null) return null;

  return {
    earlyWpm: early,
    lateWpm: late,
    deltaPercent: Math.round(((late - early) / early) * 100),
  };
}

function rateOver(turns: SpeechTurn[], words: number[]): number | null {
  const ms = turns.reduce(
    (sum, turn) => sum + Math.max(0, turn.endedAtMs - turn.startedAtMs),
    0,
  );
  const total = words.reduce((sum, count) => sum + count, 0);
  if (ms <= 0 || total < 20) return null;
  return Math.round(total / (ms / 60_000));
}

export function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function normalize(text: string): string {
  return ` ${text.toLowerCase().replace(/[^a-z0-9\s']/g, " ").replace(/\s+/g, " ").trim()} `;
}

/** Counts a token only as a whole word, so "er" never matches "interview". */
function countWholeWord(haystack: string, word: string): number {
  let count = 0;
  let index = haystack.indexOf(` ${word} `);
  while (index !== -1) {
    count += 1;
    index = haystack.indexOf(` ${word} `, index + 1);
  }
  return count;
}

function countPhrase(haystack: string, phrase: string): number {
  let count = 0;
  let index = haystack.indexOf(phrase);
  while (index !== -1) {
    count += 1;
    index = haystack.indexOf(phrase, index + phrase.length);
  }
  return count;
}
