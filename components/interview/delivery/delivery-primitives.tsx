import type { LucideIcon } from "lucide-react";
import { Info } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Presentation pieces for the delivery analytics.
 *
 * The one rule that shapes all of them: **a measurement that could not be taken
 * must not look like a bad result.** Half of what this section reports is
 * genuinely unavailable — most browsers have no face detector — and the
 * difference between "we could not measure this" and "you did badly at this" is
 * the difference between an honest report and a misleading one. So
 * `unavailable` is a distinct visual state, neutral and grey, never the
 * destructive red that would read as a failure.
 *
 * Everything is a pure render of values passed in. No thresholds are decided
 * here, and nothing is computed that the analysis modules did not already
 * produce.
 */

/** Semantic state of a reported signal. Never red — see the note above. */
export type SignalTone = "positive" | "neutral" | "caution" | "unavailable";

const TONE_DOT: Record<SignalTone, string> = {
  positive: "bg-success",
  neutral: "bg-info",
  caution: "bg-warning",
  unavailable: "bg-muted-foreground/40",
};

const TONE_TEXT: Record<SignalTone, string> = {
  positive: "text-success",
  neutral: "text-foreground",
  caution: "text-warning",
  unavailable: "text-muted-foreground",
};

const TONE_ICON: Record<SignalTone, string> = {
  positive: "text-success",
  neutral: "text-info",
  caution: "text-warning",
  unavailable: "text-muted-foreground",
};

/**
 * One headline number in the summary strip.
 *
 * Deliberately a `<div>` pair inside a `<dl>` supplied by the caller, so the
 * label is programmatically tied to the value rather than merely sitting above
 * it. Values use proportional figures: `tabular-nums` gives every digit the
 * width of a zero, which looks loose at display sizes and is only worth it in
 * columns that must align.
 */
export function StatTile({
  icon: Icon,
  label,
  value,
  unit,
  sub,
  index = 0,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  unit?: string;
  sub?: string;
  /** Staggers the entrance so the row resolves left to right. */
  index?: number;
}) {
  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-lg border bg-card p-4",
        "transition-shadow duration-200 hover:shadow-sm",
        "animate-in fade-in slide-in-from-bottom-1 fill-mode-both",
      )}
      style={{ animationDelay: `${index * 60}ms` }}
    >
      <dt className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Icon
          className="h-3.5 w-3.5 transition-colors group-hover:text-foreground"
          aria-hidden="true"
        />
        {label}
      </dt>
      <dd className="mt-1.5 flex items-baseline gap-1">
        <span className="text-2xl font-semibold leading-none tracking-tight">
          {value}
        </span>
        {unit && (
          <span className="text-xs font-medium text-muted-foreground">{unit}</span>
        )}
      </dd>
      {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

/**
 * A compact metric inside a card.
 *
 * A null value renders as "Not measured" rather than a dash or a zero — a gap
 * that looks like a low score is the failure mode this whole section guards
 * against.
 */
export function MetricCell({
  label,
  value,
  unit,
  sub,
  tone = "neutral",
}: {
  label: string;
  value: string | null;
  unit?: string;
  sub?: string;
  tone?: SignalTone;
}) {
  const measured = value !== null;
  return (
    <div className="rounded-md border bg-muted/20 p-3 transition-colors hover:bg-muted/40">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          "mt-1 text-lg font-semibold leading-none",
          measured ? TONE_TEXT[tone] : "text-muted-foreground",
        )}
      >
        {measured ? (
          <>
            {value}
            {unit && (
              <span className="ml-1 text-xs font-medium text-muted-foreground">
                {unit}
              </span>
            )}
          </>
        ) : (
          <span className="text-sm font-medium">Not measured</span>
        )}
      </dd>
      {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

/**
 * A camera signal.
 *
 * Status is carried by an icon, a coloured dot, *and* the value text — never
 * colour alone, because a report that only distinguishes states by hue is
 * unreadable to a chunk of its audience and invisible in forced-colours mode.
 */
export function SignalTile({
  icon: Icon,
  label,
  value,
  note,
  tone,
  index = 0,
}: {
  icon: LucideIcon;
  label: string;
  value: string | null;
  note?: string;
  tone: SignalTone;
  index?: number;
}) {
  const measured = value !== null;
  return (
    <div
      className={cn(
        "group rounded-lg border p-3 transition-all duration-200 hover:shadow-sm",
        "animate-in fade-in slide-in-from-bottom-1 fill-mode-both",
        measured ? "bg-card" : "border-dashed bg-muted/20",
      )}
      style={{ animationDelay: `${index * 60}ms` }}
    >
      <div className="flex items-center gap-1.5">
        <Icon
          className={cn("h-3.5 w-3.5", measured ? TONE_ICON[tone] : "text-muted-foreground")}
          aria-hidden="true"
        />
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
      </div>
      <p
        className={cn(
          "mt-2 flex items-center gap-1.5 text-sm font-semibold",
          measured ? TONE_TEXT[tone] : "text-muted-foreground",
        )}
      >
        <span
          className={cn("h-1.5 w-1.5 shrink-0 rounded-full", TONE_DOT[tone])}
          aria-hidden="true"
        />
        {measured ? value : "Not measured"}
      </p>
      {note && <p className="mt-1 text-xs text-muted-foreground">{note}</p>}
    </div>
  );
}

/**
 * An observation the analysis produced, presented as a card.
 *
 * The text is passed through verbatim. These sentences were written to be
 * careful about what they claim — rewriting them here to sound punchier would
 * quietly strengthen a claim the measurement does not support.
 */
export function InsightCard({
  icon: Icon,
  text,
  index = 0,
}: {
  icon: LucideIcon;
  text: string;
  index?: number;
}) {
  return (
    <li
      className={cn(
        "flex gap-3 rounded-lg border bg-card p-3 transition-shadow duration-200 hover:shadow-sm",
        "animate-in fade-in slide-in-from-bottom-1 fill-mode-both",
      )}
      style={{ animationDelay: `${index * 60}ms` }}
    >
      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-info/10">
        <Icon className="h-3.5 w-3.5 text-info" aria-hidden="true" />
      </span>
      <p className="text-pretty text-sm leading-relaxed">{text}</p>
    </li>
  );
}

/**
 * The measurement-limitations notice.
 *
 * Given the same visual weight as the findings on purpose. A camera-engagement
 * figure without the sentence explaining how it was derived invites the reader
 * to take it for eye tracking, which it is not.
 */
export function LimitationsNotice({
  title,
  items,
}: {
  title: string;
  items: string[];
}) {
  if (items.length === 0) return null;
  return (
    <section
      aria-label={title}
      className="rounded-lg border border-dashed bg-muted/20 p-3"
    >
      <h4 className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
        <Info className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
        {title}
      </h4>
      <ul className="mt-2 space-y-1.5">
        {items.map((item) => (
          <li
            key={item}
            className="text-pretty text-xs leading-relaxed text-muted-foreground"
          >
            {item}
          </li>
        ))}
      </ul>
    </section>
  );
}
