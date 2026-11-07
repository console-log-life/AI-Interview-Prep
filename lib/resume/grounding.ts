/**
 * Does a claim actually appear in the résumé?
 *
 * `claimsSystemPrompt` tells the model "Extract only what the résumé states.
 * Do not infer, upgrade or embellish", and nothing checked. That left an
 * instruction where a guarantee was needed, because of what happens next: an
 * extracted claim becomes probe questions the interviewer asks *as fact*. A
 * hallucinated "reduced latency by 40%" is not a harmless row in a table — the
 * candidate gets asked how they measured a number they never wrote, in a voice
 * interview, with no way to tell where it came from.
 *
 * So this is the gate between extraction and storage. It is deliberately
 * lenient about wording and strict about numbers:
 *
 * - **Numbers must be present.** A metric is the single most damaging thing to
 *   invent and the easiest to check. A claim quoting a figure the résumé does
 *   not contain is dropped outright.
 * - **Wording may differ.** Models reasonably compress "Architected and
 *   delivered a REST API" into "Built a REST API", and rejecting that would
 *   throw away good claims. Enough distinctive words have to be shared, not
 *   all of them.
 *
 * Both thresholds are intentionally on the forgiving side of correct: dropping
 * a real claim costs the candidate one probe question, while keeping an
 * invented one costs them their credibility in an interview.
 */

/** Share of a claim's distinctive words that must occur in the résumé. */
export const MIN_TOKEN_OVERLAP = 0.6;

/**
 * Words carrying no identifying information.
 *
 * Kept short on purpose. This is not general-purpose stop-word removal — it
 * exists so that "Built a REST API using Node.js" is judged on
 * "built/rest/api/node" rather than on "a" and "using".
 */
const NOISE = new Set([
  "a", "an", "and", "the", "to", "of", "in", "on", "for", "with", "using",
  "used", "by", "at", "as", "from", "into", "that", "this", "it", "its",
  "was", "were", "is", "are", "be", "been", "has", "have", "had", "i", "we",
  "my", "our", "also", "which", "while", "over", "across", "via", "per",
]);

export type GroundingResult = {
  grounded: boolean;
  /** Share of distinctive words found in the résumé, 0-1. */
  overlap: number;
  /** Figures in the claim that the résumé does not contain. */
  missingNumbers: string[];
  /** Why it was rejected. Null when grounded. Diagnostic, never shown. */
  reason: "UNSUPPORTED_NUMBER" | "LOW_OVERLAP" | "EMPTY" | null;
};

/**
 * Numbers that identify a quantity, not formatting.
 *
 * Percentages, multipliers, counts and magnitudes all matter. A lone "1" in
 * "part 1" does not, but including it only makes the check stricter, which is
 * the safe direction.
 */
function numbersIn(text: string): string[] {
  return [...text.matchAll(/\d+(?:[.,]\d+)*/g)].map((match) =>
    match[0].replace(/,/g, ""),
  );
}

function tokensIn(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9+#.]+/)
    .map((token) => token.replace(/^\.+|\.+$/g, ""))
    .filter((token) => token.length > 1 && !NOISE.has(token));
}

/**
 * Checks one claim against the résumé text.
 *
 * Both sides are compared on normalised tokens rather than by substring, so
 * punctuation, line breaks and case from PDF extraction do not cause a false
 * rejection.
 */
export function groundClaim(claimText: string, resumeText: string): GroundingResult {
  const claim = claimText.trim();
  if (!claim) {
    return { grounded: false, overlap: 0, missingNumbers: [], reason: "EMPTY" };
  }

  const sourceNumbers = new Set(numbersIn(resumeText));
  const missingNumbers = [...new Set(numbersIn(claim))].filter(
    (value) => !sourceNumbers.has(value),
  );

  const claimTokens = [...new Set(tokensIn(claim))];
  const sourceTokens = new Set(tokensIn(resumeText));
  const found = claimTokens.filter((token) => sourceTokens.has(token));
  const overlap = claimTokens.length === 0 ? 0 : found.length / claimTokens.length;

  // Checked first: an invented figure is the failure that reaches the candidate
  // as a question about something they never wrote.
  if (missingNumbers.length > 0) {
    return { grounded: false, overlap, missingNumbers, reason: "UNSUPPORTED_NUMBER" };
  }

  if (claimTokens.length === 0 || overlap < MIN_TOKEN_OVERLAP) {
    return { grounded: false, overlap, missingNumbers, reason: "LOW_OVERLAP" };
  }

  return { grounded: true, overlap, missingNumbers: [], reason: null };
}

export type GroundingReport<T> = {
  kept: T[];
  dropped: Array<{ claim: T; result: GroundingResult }>;
};

/**
 * Partitions extracted claims into the ones the résumé supports and the rest.
 *
 * Returns both sides rather than silently filtering, so the caller can record
 * how often extraction invents something — a silent filter would hide a
 * degrading prompt or model.
 */
export function filterGroundedClaims<T extends { text: string }>(
  claims: readonly T[],
  resumeText: string,
): GroundingReport<T> {
  const kept: T[] = [];
  const dropped: Array<{ claim: T; result: GroundingResult }> = [];

  for (const claim of claims) {
    const result = groundClaim(claim.text, resumeText);
    if (result.grounded) kept.push(claim);
    else dropped.push({ claim, result });
  }

  return { kept, dropped };
}
