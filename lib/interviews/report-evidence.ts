import type { ReportEvidence } from "@/types/ai";

/**
 * Citations for the report's strengths and weaknesses.
 *
 * The report prompt has always said "ground every strength and weakness in
 * something the candidate actually said", but the output carried no link back
 * to the answer, so a reader had to take each one on trust. The model now
 * names the question number its point came from, and this module turns that
 * number into the real question and answer.
 *
 * It is the trust boundary for those citations. The index is the model's
 * claim about which answer supports a point; everything here exists to make
 * sure a wrong claim becomes *no citation* rather than a quote attached to the
 * wrong answer — which would be worse than no evidence at all, because it
 * reads as proof.
 */

/** One graded exchange, as the report generator was given it. */
export type CitableTurn = {
  question: string;
  answer: string;
  topic: string;
};

export type ResolvedEvidence = {
  kind: "STRENGTH" | "WEAKNESS";
  point: string;
  /** 1-based, as shown to the model and to the candidate. */
  questionIndex: number;
  question: string;
  answer: string;
  topic: string;
};

/**
 * Resolves each citation against the turns that actually happened.
 *
 * Dropped, rather than repaired:
 * - an index outside `1..turns.length` — the model invented a question number,
 *   and guessing which one it meant would fabricate the evidence
 * - a turn the candidate did not answer — there is nothing to quote, and an
 *   empty blockquote under a weakness reads as a missing answer being held
 *   against them twice
 * - an empty point — nothing to support
 *
 * Order is preserved so the report reads in the order the model wrote it.
 */
export function resolveReportEvidence(
  raw: readonly ReportEvidence[],
  turns: readonly CitableTurn[],
): ResolvedEvidence[] {
  return raw.flatMap((entry) => {
    const point = entry.point?.trim() ?? "";
    if (!point) return [];

    if (!Number.isInteger(entry.questionIndex)) return [];
    if (entry.questionIndex < 1 || entry.questionIndex > turns.length) return [];

    const turn = turns[entry.questionIndex - 1];
    if (!turn) return [];

    const question = turn.question?.trim() ?? "";
    const answer = turn.answer?.trim() ?? "";
    if (!question || !answer) return [];

    return [
      {
        kind: entry.kind,
        point,
        questionIndex: entry.questionIndex,
        question,
        answer,
        topic: turn.topic?.trim() || "General",
      },
    ];
  });
}

/** The citations for one side of the report. */
export function evidenceOfKind(
  evidence: readonly ResolvedEvidence[],
  kind: ResolvedEvidence["kind"],
): ResolvedEvidence[] {
  return evidence.filter((entry) => entry.kind === kind);
}

/**
 * Reads citations back out of the database.
 *
 * `InterviewReport.evidence` is JSONB, so Postgres guarantees valid JSON and
 * nothing else. A row written by an older build has no citations at all, which
 * must render as the plain uncited list rather than crash the report.
 */
export function parseStoredEvidence(value: unknown): ResolvedEvidence[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((entry) => {
    if (typeof entry !== "object" || entry === null) return [];
    const r = entry as Record<string, unknown>;

    if (r.kind !== "STRENGTH" && r.kind !== "WEAKNESS") return [];
    if (typeof r.point !== "string" || !r.point.trim()) return [];
    if (typeof r.question !== "string" || !r.question.trim()) return [];
    if (typeof r.answer !== "string" || !r.answer.trim()) return [];

    return [
      {
        kind: r.kind,
        point: r.point,
        questionIndex:
          typeof r.questionIndex === "number" && Number.isInteger(r.questionIndex)
            ? r.questionIndex
            : 0,
        question: r.question,
        answer: r.answer,
        topic: typeof r.topic === "string" && r.topic.trim() ? r.topic : "General",
      },
    ];
  });
}
