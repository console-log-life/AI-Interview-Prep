"use client";

import { useState } from "react";
import { ChevronDown, Lightbulb, ThumbsUp, TriangleAlert } from "lucide-react";

import { ScoreBar } from "@/components/shared/score-bar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AnswerEvaluation } from "@/types/ai";

/**
 * Per-answer coaching shown inline right after the candidate answers.
 *
 * Collapsed by default so the interview keeps its rhythm — the candidate can
 * open it now or read everything in the final report.
 */
export function AnswerFeedback({
  evaluation,
}: {
  evaluation: AnswerEvaluation;
}) {
  const [open, setOpen] = useState(false);
  const score = evaluation.score;
  const variant =
    score >= 8 ? "success" : score >= 5 ? "warning" : "destructive";

  const subScores = [
    { label: "Relevance", value: evaluation.relevance },
    { label: "Clarity", value: evaluation.clarity },
    { label: "Correctness", value: evaluation.correctness },
    { label: "Technical depth", value: evaluation.technicalDepth },
    { label: "Completeness", value: evaluation.completeness },
    { label: "Structure (STAR)", value: evaluation.structure },
  ].filter((entry): entry is { label: string; value: number } =>
    typeof entry.value === "number",
  );

  return (
    <div className="ml-11 rounded-lg border bg-card">
      <Button
        variant="ghost"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="h-auto w-full justify-between px-4 py-3"
      >
        <span className="flex items-center gap-2 text-sm font-medium">
          <Lightbulb className="h-4 w-4 text-primary" aria-hidden="true" />
          Feedback on your answer
          <Badge variant={variant}>{score}/10</Badge>
        </span>
        <ChevronDown
          className={cn("transition-transform", open && "rotate-180")}
          aria-hidden="true"
        />
      </Button>

      {open && (
        <div className="space-y-5 border-t px-4 py-4">
          {evaluation.feedback && (
            <p className="text-sm leading-relaxed text-pretty">
              {evaluation.feedback}
            </p>
          )}

          {subScores.length > 0 && (
            <div className="grid gap-3 sm:grid-cols-2">
              {subScores.map((entry) => (
                <ScoreBar
                  key={entry.label}
                  label={entry.label}
                  score={entry.value * 10}
                  detail={`${entry.value}/10`}
                />
              ))}
            </div>
          )}

          {evaluation.strengths.length > 0 && (
            <div>
              <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-success">
                <ThumbsUp className="h-3.5 w-3.5" aria-hidden="true" />
                What worked
              </h4>
              <ul className="mt-2 space-y-1.5">
                {evaluation.strengths.map((item, index) => (
                  <li
                    key={index}
                    className="text-sm text-muted-foreground text-pretty"
                  >
                    • {item}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {evaluation.missingPoints.length > 0 && (
            <div>
              <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-warning">
                <TriangleAlert className="h-3.5 w-3.5" aria-hidden="true" />
                What a stronger answer would add
              </h4>
              <ul className="mt-2 space-y-1.5">
                {evaluation.missingPoints.map((item, index) => (
                  <li
                    key={index}
                    className="text-sm text-muted-foreground text-pretty"
                  >
                    • {item}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {evaluation.improvedAnswer && (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Your answer, restructured
              </h4>
              <p className="mt-2 whitespace-pre-wrap rounded-md border bg-muted/40 p-3 text-sm leading-relaxed text-pretty">
                {evaluation.improvedAnswer}
              </p>
              <p className="mt-1.5 text-xs text-muted-foreground">
                Rewritten from what you actually said — no experience has been
                added on your behalf.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
