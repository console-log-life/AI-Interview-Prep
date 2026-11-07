"use client";

import { Clock } from "lucide-react";

import { cn, formatClock } from "@/lib/utils";

type AssessmentTimerProps = {
  secondsLeft: number;
  totalSeconds: number;
};

/**
 * Countdown display.
 *
 * `role="timer"` + `aria-live="polite"` announces the remaining time to screen
 * readers, but only when it crosses a warning threshold — announcing every
 * second would be unusable.
 */
export function AssessmentTimer({
  secondsLeft,
  totalSeconds,
}: AssessmentTimerProps) {
  const ratio = totalSeconds > 0 ? secondsLeft / totalSeconds : 0;
  const critical = secondsLeft <= 60;
  const warning = !critical && ratio <= 0.2;

  return (
    <div
      role="timer"
      aria-live={critical ? "assertive" : "off"}
      className={cn(
        "flex items-center gap-2 rounded-lg border px-3 py-2 tabular-nums",
        critical && "border-destructive/50 bg-destructive/10 text-destructive",
        warning && "border-warning/50 bg-warning/10",
      )}
    >
      <Clock className="h-4 w-4" aria-hidden="true" />
      <span className="text-sm font-semibold">{formatClock(secondsLeft)}</span>
      <span className="sr-only">
        {Math.floor(secondsLeft / 60)} minutes and {secondsLeft % 60} seconds
        remaining
      </span>
      {critical && (
        <span className="text-xs font-medium">Auto-submits at 0:00</span>
      )}
    </div>
  );
}
