import { Progress } from "@/components/ui/progress";
import { cn, clampScore, scoreBand } from "@/lib/utils";

type ScoreBarProps = {
  label: string;
  score: number;
  /** Optional "3 / 5 correct" style annotation. */
  detail?: string;
  className?: string;
};

const INDICATOR: Record<ReturnType<typeof scoreBand>, string> = {
  weak: "bg-destructive",
  developing: "bg-warning",
  strong: "bg-success",
};

export function ScoreBar({ label, score, detail, className }: ScoreBarProps) {
  const value = clampScore(score);
  const band = scoreBand(value);

  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="truncate text-sm font-medium">{label}</span>
        <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
          {detail ?? `${Math.round(value)}%`}
        </span>
      </div>
      <Progress
        value={value}
        indicatorClassName={INDICATOR[band]}
        aria-label={`${label}: ${Math.round(value)} percent`}
      />
    </div>
  );
}
