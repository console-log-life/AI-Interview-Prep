import {
  PACE_BANDS,
  PACE_LABEL,
  PACE_SCALE_MAX_WPM,
  SHORT_ANSWER_WORDS,
  type PaceBand,
} from "@/lib/interviews/speech-metrics";
import { cn } from "@/lib/utils";

/**
 * The two small charts in the delivery section.
 *
 * Both are deliberately modest. The data is a handful of numbers, and the
 * dataviz rule that applies is that a handful of numbers is a stat tile or a
 * short bar list, not a plotted figure — anything more elaborate would be
 * decoration dressed as analysis.
 *
 * Neither invents a scale. The pace bands come from the product's own
 * classifier via `PACE_BANDS`, and the answer bars are raw word counts.
 */

/**
 * Where the measured pace falls across the product's own bands.
 *
 * Drawn from `PACE_BANDS` rather than hard-coded thresholds, so the picture can
 * never imply a range the classifier does not use. No band is styled as
 * "correct": they are neutral segments of one ramp, and the only emphasis is
 * the marker showing where the candidate actually landed.
 */
export function PaceScale({
  wordsPerMinute,
  band,
}: {
  wordsPerMinute: number;
  band: PaceBand;
}) {
  const clamped = Math.min(wordsPerMinute, PACE_SCALE_MAX_WPM);
  const position = (clamped / PACE_SCALE_MAX_WPM) * 100;

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <p className="text-xs font-medium text-muted-foreground">Speaking pace</p>
        <p className="text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">{wordsPerMinute}</span> wpm ·{" "}
          {PACE_LABEL[band]}
        </p>
      </div>

      <div className="relative mt-2">
        {/* The bands. A 2px gap between segments keeps them legible as
            separate ranges rather than one continuous gradient. */}
        <div className="flex h-2 gap-0.5" aria-hidden="true">
          {PACE_BANDS.map((entry, index) => {
            const upper = entry.maxWpm ?? PACE_SCALE_MAX_WPM;
            const width = ((upper - entry.minWpm) / PACE_SCALE_MAX_WPM) * 100;
            return (
              <div
                key={entry.band}
                className={cn(
                  "h-full",
                  entry.band === band ? "bg-info/70" : "bg-muted",
                  index === 0 && "rounded-l-full",
                  index === PACE_BANDS.length - 1 && "rounded-r-full",
                )}
                style={{ width: `${width}%` }}
              />
            );
          })}
        </div>

        {/* The marker. Ringed in the surface colour so it stays visible
            wherever it lands on the track. */}
        <div
          className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background bg-foreground shadow-sm transition-[left] duration-500 ease-out"
          style={{ left: `${position}%` }}
          aria-hidden="true"
        />
      </div>

      {/* Labels share the track's proportions so each sits under its own band.
          `justify-between` would push the outer two to the edges and leave the
          middle labels pointing at the wrong ranges. */}
      <div className="mt-1.5 flex gap-0.5 text-caption text-muted-foreground">
        {PACE_BANDS.map((entry) => {
          const upper = entry.maxWpm ?? PACE_SCALE_MAX_WPM;
          const width = ((upper - entry.minWpm) / PACE_SCALE_MAX_WPM) * 100;
          return (
            <span
              key={entry.band}
              className={cn(
                "truncate text-center",
                entry.band === band && "font-medium text-foreground",
              )}
              style={{ width: `${width}%` }}
            >
              {PACE_LABEL[entry.band]}
            </span>
          );
        })}
      </div>

      <p className="sr-only">
        Your pace of {wordsPerMinute} words per minute falls in the{" "}
        {PACE_LABEL[band]} band.
      </p>
    </div>
  );
}

/**
 * Word count per answer.
 *
 * Bars rather than a line: the job is comparing magnitudes across a few
 * unordered items. One hue, because there is a single series and colour here
 * carries magnitude, not identity — a rainbow would imply the answers differ in
 * kind. Each bar is directly labelled, which at this count is clearer than an
 * axis.
 *
 * The caption is not decoration. A bar chart of answer lengths reads as a
 * quality ranking unless it explicitly says it is not one.
 */
export function AnswerLengths({ wordCounts }: { wordCounts: number[] }) {
  if (wordCounts.length === 0) return null;
  const longest = Math.max(...wordCounts, 1);

  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground">Answer length</p>

      <ul className="mt-2 space-y-1.5">
        {wordCounts.map((count, index) => {
          const short = count < SHORT_ANSWER_WORDS;
          return (
            <li key={index} className="flex items-center gap-2.5">
              <span className="w-14 shrink-0 text-caption tabular-nums text-muted-foreground">
                Answer {String(index + 1).padStart(2, "0")}
              </span>
              <span className="relative h-4 flex-1 overflow-hidden rounded-sm bg-muted/50">
                <span
                  className={cn(
                    "absolute inset-y-0 left-0 rounded-sm transition-[width] duration-500 ease-out",
                    short ? "bg-warning/60" : "bg-info/70",
                  )}
                  style={{ width: `${Math.max(2, (count / longest) * 100)}%` }}
                />
              </span>
              <span className="w-16 shrink-0 text-right text-caption tabular-nums text-muted-foreground">
                {count} words
              </span>
            </li>
          );
        })}
      </ul>

      <p className="mt-2 text-caption leading-relaxed text-muted-foreground">
        Length alone does not determine answer quality. Answers under{" "}
        {SHORT_ANSWER_WORDS} words are highlighted only because they rarely leave
        room to explain reasoning.
      </p>
    </div>
  );
}
