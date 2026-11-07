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
    <Card className={cn("overflow-hidden", className)}>
      <CardContent className="flex items-start justify-between gap-3 p-5">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {label}
          </p>
          <p className="mt-1.5 text-2xl font-semibold tabular-nums">{value}</p>
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
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
          <Icon className="h-4.5 w-4.5 text-muted-foreground" aria-hidden="true" />
        </div>
      </CardContent>
    </Card>
  );
}
