/**
 * Non-speech transcription markers.
 *
 * Gemini's transcriber emits bracketed annotations for sounds that are not
 * words — `<noise>`, `[inaudible]`, `(coughs)` — and a session in a real room
 * produces them constantly. Left alone they flow straight into the answer
 * buffer, and the consequences are worse than an untidy transcript: the
 * orchestrator scores `<noise>` as an answer, the interviewer follows up on
 * it, and a candidate who has said nothing is treated as having spoken.
 *
 * So this is filtered at the source, not hidden with CSS. A turn that contains
 * only non-speech markers is the same as a turn where nothing was transcribed,
 * and the client already knows how to handle that: it asks the candidate to
 * repeat rather than inventing an answer.
 */

/**
 * A bracketed annotation: `<noise>`, `[BLANK_AUDIO]`, `(background talking)`.
 *
 * Matched by shape rather than by a word list, because the vocabulary is not
 * documented and varies by model. Real speech is not delivered wrapped in
 * brackets, so the shape is a reliable signal on its own.
 */
const ANNOTATION = /[<[(][^<>[\]()]{0,40}[>\])]/g;

/** Standalone ellipsis or dashes — a pause rendered as punctuation. */
const BARE_PUNCTUATION = /^[\s.…,\-–—_*]*$/;

/**
 * Removes non-speech annotations from a transcript fragment.
 *
 * Whitespace is collapsed afterwards so `"I think <noise> we could"` becomes
 * `"I think we could"` rather than leaving a double space that later shows up
 * as a phantom word boundary.
 */
export function stripNonSpeech(text: string): string {
  return text.replace(ANNOTATION, " ").replace(/\s+/g, " ").trim();
}

/**
 * True when a fragment carries no actual speech.
 *
 * Covers three cases seen in real sessions: annotation-only turns, turns that
 * are bare punctuation, and empty strings.
 */
export function isNonSpeech(text: string): boolean {
  const stripped = stripNonSpeech(text);
  return stripped.length === 0 || BARE_PUNCTUATION.test(stripped);
}

/**
 * Cleans one delta fragment, returning the empty string when it is all noise.
 *
 * The single entry point callers should use: it makes "nothing was said" and
 * "only noise was heard" indistinguishable downstream, which is exactly right
 * — neither is an answer.
 *
 * Edge whitespace is deliberately preserved, unlike `stripNonSpeech`. Input
 * transcription arrives as deltas that carry their own leading spaces — `" I"`,
 * `" chose"`, `" it"` — and the accumulator joins them with no separator
 * precisely because of that. Trimming each fragment first therefore destroyed
 * every word boundary it touched: "I chose it because we" + " needed
 * transactions" assembled as "…because weneeded transactions". The answer was
 * intact but unreadable, and every downstream word count, keyword match and
 * quoted line in the report inherited the damage.
 */
export function cleanTranscriptFragment(text: string): string {
  const stripped = text.replace(ANNOTATION, " ").replace(/\s+/g, " ");
  return BARE_PUNCTUATION.test(stripped) ? "" : stripped;
}

/**
 * Hesitation sounds that are not an answer on their own.
 *
 * Distinct from `<noise>`: these are real words the transcriber heard
 * correctly. The problem is what they mean. A candidate who says "um…" and
 * pauses to think has not answered anything, and treating that as a finished
 * turn makes the interviewer reply to a hesitation — which is the single most
 * unnatural thing a voice interviewer can do.
 */
const HESITATIONS = new Set([
  "um", "uh", "erm", "er", "ah", "hmm", "mmm", "uhh", "umm", "hm", "eh",
  "so", "well", "okay", "ok", "right", "like", "actually", "wait",
  "let", "me", "think", "a", "second", "moment", "sorry", "just", "and",
  "i", "mean", "you", "know",
]);

/**
 * True when a finalized turn contains no substance beyond hesitation.
 *
 * Used to decide whether the candidate has actually taken their turn. Kept
 * deliberately conservative: it only fires when *every* word is a hesitation,
 * so "um, indexes" is a real answer and "um, let me think" is not.
 */
export function isHesitationOnly(text: string): boolean {
  const cleaned = cleanTranscriptFragment(text);
  if (!cleaned) return true;

  const words = cleaned
    .toLowerCase()
    .replace(/[^a-z0-9\s']/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  if (words.length === 0) return true;
  return words.every((word) => HESITATIONS.has(word));
}
