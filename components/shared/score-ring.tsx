import { cn, clampScore, scoreBand } from "@/lib/utils";

type ScoreRingProps = {
  score: number;
  size?: number;
  strokeWidth?: number;
  label?: string;
  className?: string;
};

const BAND_COLOR: Record<ReturnType<typeof scoreBand>, string> = {
  weak: "hsl(var(--destructive))",
  developing: "hsl(var(--warning))",
  strong: "hsl(var(--success))",
};

const BAND_LABEL: Record<ReturnType<typeof scoreBand>, string> = {
  weak: "Needs work",
  developing: "Developing",
  strong: "Strong",
};

/**
 * Circular score gauge.
 *
 * The band is communicated by colour AND by the text label underneath, so the
 * meaning survives for colour-blind users and in greyscale printouts.
 */
export function ScoreRing({
  score,
  size = 132,
  strokeWidth = 10,
  label,
  className,
}: ScoreRingProps) {
  const value = clampScore(score);
  const band = scoreBand(value);
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (value / 100) * circumference;

  return (
    <div className={cn("flex flex-col items-center gap-2", className)}>
      <div
        className="relative"
        style={{ width: size, height: size }}
        role="img"
        aria-label={`${label ?? "Score"}: ${Math.round(value)} out of 100 — ${BAND_LABEL[band]}`}
      >
        <svg width={size} height={size} className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="hsl(var(--muted))"
            strokeWidth={strokeWidth}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={BAND_COLOR[band]}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            className="transition-[stroke-dashoffset] duration-700"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-semibold tabular-nums">
            {Math.round(value)}
          </span>
          <span className="text-xs text-muted-foreground">/ 100</span>
        </div>
      </div>
      <div className="text-center">
        {label && <p className="text-sm font-medium">{label}</p>}
        <p className="text-xs text-muted-foreground">{BAND_LABEL[band]}</p>
      </div>
    </div>
  );
}
