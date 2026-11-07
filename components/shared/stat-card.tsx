import type { LucideIcon } from "lucide-react";
import { TrendingDown, TrendingUp } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type StatCardProps = {
  label: string;
  value: string | number;
  icon: LucideIcon;
  hint?: string;
  /** Percentage-point change vs the previous snapshot. */
  delta?: number | null;
  className?: string;
};

export function StatCard({
  label,
  value,
  icon: Icon,
  hint,
  delta,
  className,
}: StatCardProps) {
  const hasDelta = typeof delta === "number" && Number.isFinite(delta) && delta !== 0;
  const improving = hasDelta && delta > 0;

  return (
    <Card
      className={cn(
        "overflow-hidden rounded-2xl border-border/70 transition-shadow hover:shadow-md",
        className,
      )}
    >
      <CardContent className="flex items-start justify-between gap-3 p-5">
        <div className="min-w-0">
          <p className="eyebrow">{label}</p>
          {/* Display face: a stat is the one place a number should feel like
              the headline of its own card. */}
          <p className="mt-2 font-display text-3xl font-bold tabular-nums tracking-tight">
            {value}
          </p>
          {hasDelta && (
            <p
              className={cn(
                "mt-1 flex items-center gap-1 text-xs font-medium",
                improving ? "text-success" : "text-destructive",
              )}
            >
              {improving ? (
                <TrendingUp className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                <TrendingDown className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              {/* Sign is spelled out so the meaning does not rely on colour alone. */}
              {improving ? "+" : ""}
              {Math.round(delta)} pts vs last
            </p>
          )}
          {hint && !hasDelta && (
            <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
          )}
        </div>
        <div className="icon-badge">
          <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
        </div>
      </CardContent>
    </Card>
  );
}
