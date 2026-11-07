"use client";

import { useEffect, useState } from "react";
import {
  AlertCircle,
  Eye,
  Lightbulb,
  Loader2,
  ShieldQuestion,
  Sparkles,
} from "lucide-react";

import { ScoreBar } from "@/components/shared/score-bar";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { apiGet, apiPost, errorMessage } from "@/lib/api/client";
import { cn } from "@/lib/utils";

type ReviewIssue = {
  severity: string;
  title: string;
  detail: string;
  line?: number | null;
};

type CodeReviewResponse = {
  correctness: number;
  timeComplexity: string;
  spaceComplexity: string;
  readability: number;
  maintainability: number;
  efficiency: number;
  summary: string;
  issues: unknown;
  edgeCases: unknown;
  optimizationNotes: string | null;
  optimizedApproach: string | null;
  learningPoints: string[];
};

const SEVERITY_STYLE: Record<string, string> = {
  HIGH: "border-destructive/30 bg-destructive/10 text-destructive",
  MEDIUM: "border-warning/40 bg-warning/10 text-warning-foreground",
  LOW: "border-muted-foreground/30 text-muted-foreground",
};

/**
 * AI code review for a completed submission.
 *
 * The optimized approach is behind a second, explicit button. Handing a
 * student the optimal solution the moment they submit removes the entire point
 * of the exercise, so it is opt-in and clearly labelled.
 */
export function CodeReviewPanel({
  submissionId,
  aiEnabled,
}: {
  submissionId: string;
  aiEnabled: boolean;
}) {
  const [review, setReview] = useState<CodeReviewResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [restoring, setRestoring] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showOptimized, setShowOptimized] = useState(false);

  /**
   * Restore a review this submission already has. Reviews are stored, so
   * re-opening the tab must not silently charge for the same analysis again.
   */
  useEffect(() => {
    let active = true;

    apiGet<CodeReviewResponse | null>(
      `/api/coding/submissions/${submissionId}/review`,
    )
      .then((existing) => {
        if (!active || !existing) return;
        setReview(existing);
        setShowOptimized(Boolean(existing.optimizedApproach));
      })
      // A failed restore is not worth an error banner — the user can still
      // request a fresh review, which surfaces any real problem.
      .catch(() => undefined)
      .finally(() => {
        if (active) setRestoring(false);
      });

    return () => {
      active = false;
    };
  }, [submissionId]);

  async function requestReview(includeOptimizedApproach: boolean) {
    setLoading(true);
    setError(null);
    try {
      const result = await apiPost<CodeReviewResponse>(
        `/api/coding/submissions/${submissionId}/review`,
        { includeOptimizedApproach },
      );
      setReview(result);
      if (includeOptimizedApproach) setShowOptimized(true);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  }

  if (!aiEnabled) {
    return (
      <Alert>
        <ShieldQuestion aria-hidden="true" />
        <AlertDescription>
          AI code review needs an Anthropic API key. Running and submitting code
          works without one.
        </AlertDescription>
      </Alert>
    );
  }

  const issues = toIssues(review?.issues);
  const edgeCases = toStrings(review?.edgeCases);

  if (restoring) {
    return (
      <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        <span role="status">Checking for an existing review…</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {!review && (
        <div className="rounded-lg border border-dashed p-4 text-center">
          <Sparkles
            className="mx-auto mb-2 h-5 w-5 text-muted-foreground"
            aria-hidden="true"
          />
          <p className="text-sm font-medium">Get an AI review of this solution</p>
          <p className="mx-auto mt-1 max-w-md text-pretty text-sm text-muted-foreground">
            Complexity, readability, edge cases you missed, and what to learn
            from it. Your code is never modified.
          </p>
          <Button
            className="mt-3"
            size="sm"
            disabled={loading}
            onClick={() => void requestReview(false)}
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Sparkles className="h-4 w-4" aria-hidden="true" />
            )}
            Review my code
          </Button>
        </div>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertCircle aria-hidden="true" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {review && (
        <>
          <p className="text-pretty text-sm">{review.summary}</p>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Time complexity</p>
              <p className="font-mono text-sm font-medium">
                {review.timeComplexity}
              </p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Space complexity</p>
              <p className="font-mono text-sm font-medium">
                {review.spaceComplexity}
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <ScoreBar label="Correctness" score={review.correctness * 10} />
            <ScoreBar label="Readability" score={review.readability * 10} />
            <ScoreBar label="Maintainability" score={review.maintainability * 10} />
            <ScoreBar label="Efficiency" score={review.efficiency * 10} />
          </div>

          {issues.length > 0 && (
            <section>
              <h4 className="mb-2 text-sm font-medium">Issues found</h4>
              <ul className="space-y-2">
                {issues.map((issue, index) => (
                  <li key={`${issue.title}-${index}`} className="rounded-lg border p-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium">{issue.title}</p>
                      <Badge
                        variant="outline"
                        className={cn(
                          "shrink-0",
                          SEVERITY_STYLE[issue.severity] ?? SEVERITY_STYLE.LOW,
                        )}
                      >
                        {issue.severity}
                        {typeof issue.line === "number" && ` · line ${issue.line}`}
                      </Badge>
                    </div>
                    <p className="mt-1 text-pretty text-sm text-muted-foreground">
                      {issue.detail}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {edgeCases.length > 0 && (
            <section>
              <h4 className="mb-2 text-sm font-medium">Edge cases to consider</h4>
              <ul className="list-inside list-disc space-y-1 text-sm text-muted-foreground">
                {edgeCases.map((edgeCase) => (
                  <li key={edgeCase} className="text-pretty">
                    {edgeCase}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {review.learningPoints.length > 0 && (
            <section className="rounded-lg border bg-muted/40 p-3">
              <h4 className="mb-2 flex items-center gap-1.5 text-sm font-medium">
                <Lightbulb className="h-4 w-4" aria-hidden="true" />
                Take away
              </h4>
              <ul className="list-inside list-disc space-y-1 text-sm text-muted-foreground">
                {review.learningPoints.map((point) => (
                  <li key={point} className="text-pretty">
                    {point}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {review.optimizationNotes && (
            <section>
              <h4 className="mb-1 text-sm font-medium">Where it could improve</h4>
              <p className="text-pretty text-sm text-muted-foreground">
                {review.optimizationNotes}
              </p>
            </section>
          )}

          {showOptimized && review.optimizedApproach ? (
            <section>
              <h4 className="mb-2 text-sm font-medium">Optimised approach</h4>
              <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-md border bg-muted/50 p-3 text-xs scrollbar-thin">
                <code>{review.optimizedApproach}</code>
              </pre>
            </section>
          ) : (
            <div className="rounded-lg border border-dashed p-3 text-center">
              <p className="text-sm text-muted-foreground">
                Want the optimal approach? Try your own improvement first — it is
                worth more than reading ours.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-2"
                disabled={loading}
                onClick={() => void requestReview(true)}
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Eye className="h-4 w-4" aria-hidden="true" />
                )}
                Show me anyway
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** The stored issues/edge cases are AI JSON, so they are re-checked here. */
function toIssues(value: unknown): ReviewIssue[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    if (typeof record.title !== "string" || typeof record.detail !== "string") {
      return [];
    }
    return [
      {
        severity:
          typeof record.severity === "string" ? record.severity : "LOW",
        title: record.title,
        detail: record.detail,
        line: typeof record.line === "number" ? record.line : null,
      },
    ];
  });
}

function toStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}
