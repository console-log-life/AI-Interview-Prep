import { Eye, Lightbulb } from "lucide-react";

import {
  attentionFeedback,
  type AttentionSummary,
} from "@/lib/interviews/attention";

/**
 * The attention section of the report.
 *
 * All of the wording comes from `attentionFeedback`, which is unit-tested for
 * it — the phrasing is part of the contract here, not a presentation detail.
 * This feature is one careless sentence away from reading as proctoring, and a
 * sentence written directly into JSX is a sentence nothing tests.
 *
 * Renders nothing at all when there is no summary: an interview run before the
 * feature existed, or with it switched off, gets no empty section implying
 * something failed.
 */
export function AttentionReport({
  attention,
}: {
  attention: AttentionSummary | null;
}) {
  if (!attention) return null;

  const { facts, coaching } = attentionFeedback(attention);
  if (facts.length === 0) return null;

  const percent =
    attention.cameraMeasured && attention.lookingAtScreenRatio !== null
      ? Math.round(attention.lookingAtScreenRatio * 100)
      : null;

  return (
    <section aria-labelledby="attention-heading" className="rounded-xl border bg-card p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 id="attention-heading" className="text-base font-semibold">
            Attention
          </h3>
          <p className="mt-1 text-sm text-muted-foreground text-pretty">
            How present you came across on camera. Measured in your browser and
            never recorded — this is coaching, not a score.
          </p>
        </div>

        {/* Only when there is a real measurement behind it. */}
        {percent !== null && (
          <div className="shrink-0 text-right">
            <p className="text-2xl font-semibold tabular-nums leading-none">
              {percent}%
            </p>
            <p className="mt-1 text-[11px] uppercase tracking-wide text-muted-foreground">
              on screen
            </p>
          </div>
        )}
      </div>

      <ul className="mt-4 space-y-1.5">
        {facts.map((fact) => (
          <li key={fact} className="flex gap-2 text-sm">
            <Eye
              className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
            <span className="text-pretty text-muted-foreground">{fact}</span>
          </li>
        ))}
      </ul>

      {coaching.length > 0 && (
        <div className="mt-4 space-y-2 rounded-lg border-l-2 border-primary bg-muted/40 px-3 py-2.5">
          {coaching.map((line) => (
            <p key={line} className="flex gap-2 text-sm">
              <Lightbulb
                className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary"
                aria-hidden="true"
              />
              <span className="text-pretty">{line}</span>
            </p>
          ))}
        </div>
      )}
    </section>
  );
}
