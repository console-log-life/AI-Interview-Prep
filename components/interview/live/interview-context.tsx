"use client";

import { CornerDownRight, HelpCircle } from "lucide-react";

import { PHASE_LABEL, phaseSteps } from "@/lib/ai/live/presentation";
import type { InterviewPhase } from "@/lib/ai/live/orchestrator-types";
import { cn } from "@/lib/utils";

/**
 * The question card and the phase strip.
 *
 * Both render orchestrator state that already exists — the question the
 * controller is waiting on, and the phase it has reached. Neither invents
 * progress: there is no "question 4 of 8" here, because the interview is
 * adaptive and the total is genuinely not known in advance. Showing a
 * countdown to a number the system does not have would be a fabricated metric
 * dressed as reassurance.
 */

export function CurrentQuestion({
  question,
  isFollowUp,
  topic,
  dimmed,
}: {
  question: string | null;
  isFollowUp: boolean;
  topic: string | null;
  /** True once the candidate starts answering — the card steps back. */
  dimmed: boolean;
}) {
  if (!question) return null;

  return (
    <section
      aria-label="Current question"
      className={cn(
        "rounded-xl border bg-card p-4 transition-all duration-300",
        dimmed ? "opacity-60" : "shadow-sm",
      )}
    >
      <div className="flex items-center gap-2">
        {isFollowUp ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-info/10 px-2 py-0.5 text-caption font-semibold uppercase tracking-wide text-info">
            <CornerDownRight className="h-3 w-3" aria-hidden="true" />
            Follow-up
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-caption font-semibold uppercase tracking-wide text-muted-foreground">
            <HelpCircle className="h-3 w-3" aria-hidden="true" />
            Current question
          </span>
        )}
        {topic && (
          <span className="truncate text-caption text-muted-foreground">
            {topic}
          </span>
        )}
      </div>

      <p className="mt-2 text-pretty text-body font-medium leading-relaxed">
        {question}
      </p>
    </section>
  );
}

/**
 * Where the interview has reached.
 *
 * Phase-based rather than a question count, because the orchestrator chooses
 * topics from the candidate's answers and the length is not fixed. Only phases
 * this interview's plan actually contains are listed.
 */
export function PhaseStrip({
  phase,
  plannedPhases,
  className,
}: {
  phase: InterviewPhase;
  plannedPhases: InterviewPhase[];
  className?: string;
}) {
  const steps = phaseSteps(phase, plannedPhases);
  if (steps.length === 0) return null;

  return (
    <nav
      aria-label="Interview progress"
      className={cn("flex flex-wrap items-center gap-x-3 gap-y-1.5", className)}
    >
      {steps.map((step) => (
        <span
          key={step.phase}
          className={cn(
            "flex items-center gap-1.5 text-caption",
            step.state === "current" && "font-semibold text-foreground",
            step.state === "done" && "text-muted-foreground",
            step.state === "upcoming" && "text-muted-foreground/60",
          )}
          aria-current={step.state === "current" ? "step" : undefined}
        >
          {/* Shape as well as colour, so the three states survive a greyscale
              screen and forced-colours mode. */}
          <span aria-hidden="true" className="text-[10px]">
            {step.state === "done" ? "✓" : step.state === "current" ? "●" : "○"}
          </span>
          {step.label}
          <span className="sr-only">
            {step.state === "done"
              ? " (completed)"
              : step.state === "current"
                ? " (current)"
                : " (upcoming)"}
          </span>
        </span>
      ))}
    </nav>
  );
}

export { PHASE_LABEL };
