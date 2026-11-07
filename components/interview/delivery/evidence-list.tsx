import { Check, Minus, Quote } from "lucide-react";

import type { EvidenceRecord } from "@/lib/ai/live/memory";
import { cn } from "@/lib/utils";

/**
 * What the interview actually observed, with the exchange it came from.
 *
 * The point of this section is traceability. A report that says "did not
 * explain trade-offs" and stops is an assertion the candidate has to take on
 * trust; the same line with the question and their own answer beneath it is
 * something they can check, disagree with, and learn from.
 *
 * Every strength and gap here was set by a boolean the understanding layer
 * derived from the transcript. Nothing is inferred, and there is deliberately
 * no score — correctness is never established, so grading these exchanges
 * would be inventing a judgement the system cannot support.
 */
export function EvidenceList({ evidence }: { evidence: EvidenceRecord[] }) {
  // Repairs and empty turns produce no observations; showing them would pad
  // the section with rows that say nothing.
  const meaningful = evidence.filter(
    (record) => record.strengths.length > 0 || record.gaps.length > 0,
  );

  if (meaningful.length === 0) return null;

  return (
    <section aria-labelledby="evidence-heading" className="space-y-3">
      <div>
        <h3 id="evidence-heading" className="text-base font-semibold">
          Evidence from the interview
        </h3>
        <p className="text-sm text-muted-foreground">
          Each observation below comes from one exchange, quoted as it was
          spoken. Nothing here is a score.
        </p>
      </div>

      <ol className="space-y-3">
        {meaningful.map((record) => (
          <li key={`${record.turn}-${record.atMs}`} className="rounded-xl border bg-card p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-caption font-semibold uppercase tracking-wide text-muted-foreground">
                Answer {record.turn}
                {record.topicLabel && (
                  <span className="ml-2 font-normal normal-case">
                    {record.topicLabel}
                  </span>
                )}
              </p>
              <p className="text-caption tabular-nums text-muted-foreground">
                {formatOffset(record.atMs)} · {record.wordCount} words
              </p>
            </div>

            {record.questionText && (
              <p className="mt-2 text-sm font-medium text-pretty">
                {record.questionText}
              </p>
            )}

            <blockquote className="mt-2 flex gap-2 border-l-2 pl-3 text-sm text-muted-foreground">
              <Quote className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
              <span className="text-pretty italic">{record.answerText}</span>
            </blockquote>

            {(record.strengths.length > 0 || record.gaps.length > 0) && (
              <ul className="mt-3 space-y-1.5">
                {record.strengths.map((item) => (
                  <Observation key={item} text={item} kind="strength" />
                ))}
                {record.gaps.map((item) => (
                  <Observation key={item} text={item} kind="gap" />
                ))}
              </ul>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

/**
 * One observation.
 *
 * A gap is marked with a dash rather than a cross: these are things the answer
 * did not contain, which is not the same as being wrong, and a red cross would
 * read as a verdict the analysis has not reached.
 */
function Observation({ text, kind }: { text: string; kind: "strength" | "gap" }) {
  const Icon = kind === "strength" ? Check : Minus;
  return (
    <li className="flex items-start gap-2 text-sm">
      <Icon
        className={cn(
          "mt-0.5 h-3.5 w-3.5 shrink-0",
          kind === "strength" ? "text-success" : "text-muted-foreground",
        )}
        aria-hidden="true"
      />
      <span className={cn("text-pretty", kind === "gap" && "text-muted-foreground")}>
        <span className="sr-only">
          {kind === "strength" ? "Observed strength: " : "Observed gap: "}
        </span>
        {capitalize(text)}
      </span>
    </li>
  );
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function formatOffset(ms: number): string {
  const total = Math.floor(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}
