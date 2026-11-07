import Link from "next/link";
import { CircleHelp, Target } from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";
import { ScoreRing } from "@/components/shared/score-ring";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CONFIDENCE_LEVEL_LABEL } from "@/lib/analytics/readiness";
import type { JobReadinessView } from "@/lib/analytics/job-readiness";
import { cn } from "@/lib/utils";

/**
 * Measured readiness for one posting.
 *
 * Shown alongside — never merged into — the AI's resume match score, because
 * they answer different questions. Claiming a skill on a resume and being able
 * to answer questions on it are not the same thing, and collapsing them into
 * one number would hide exactly the gap the candidate needs to see.
 */
export function JobReadinessCard({
  readiness,
}: {
  readiness: JobReadinessView;
}) {
  const hasEvidence = readiness.covered.length > 0 || readiness.gaps.length > 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle>Measured readiness for this role</CardTitle>
            <CardDescription>
              Built from your actual interview, assessment and coding results —
              not from what your resume claims.
            </CardDescription>
          </div>
          <Badge variant="outline" className="shrink-0">
            {CONFIDENCE_LEVEL_LABEL[readiness.confidence]}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {!hasEvidence ? (
          <EmptyState
            icon={Target}
            title="Nothing measured against this role yet"
            description="Once you've practised the skills this posting asks for, this becomes a real number. Until then there is nothing honest to show."
            action={{ label: "Start an interview", href: "/interview/new" }}
            secondaryAction={{ label: "Take an assessment", href: "/assessments" }}
          />
        ) : (
          <>
            <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center sm:gap-10">
              <div className="text-center">
                <ScoreRing score={readiness.overall} label="Measured" />
                <p className="mt-1 text-xs text-muted-foreground">
                  From your results
                </p>
              </div>

              {readiness.resumeMatchScore !== null && (
                <div className="text-center">
                  <ScoreRing
                    score={readiness.resumeMatchScore}
                    label="Resume match"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    From your resume text
                  </p>
                </div>
              )}
            </div>

            {readiness.resumeMatchScore !== null &&
              readiness.resumeMatchScore - readiness.overall >= 15 && (
                <p className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-pretty text-sm">
                  Your resume reads stronger than your measured performance for
                  this role. That gap is what an interviewer will probe — close
                  it before you apply.
                </p>
              )}

            {readiness.covered.length > 0 && (
              <section aria-labelledby="jr-covered">
                <h3 id="jr-covered" className="mb-2 text-sm font-medium">
                  Demonstrated ({readiness.covered.length})
                </h3>
                <ul className="space-y-2">
                  {readiness.covered.map((item) => (
                    <li
                      key={item.skillKey}
                      className="flex items-center justify-between gap-3 text-sm"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="truncate">{item.label}</span>
                        {item.required && (
                          <Badge variant="secondary">Required</Badge>
                        )}
                      </span>
                      <span className="shrink-0 font-medium tabular-nums text-success">
                        {Math.round(item.score)}%
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {readiness.gaps.length > 0 && (
              <section aria-labelledby="jr-gaps">
                <h3 id="jr-gaps" className="mb-2 text-sm font-medium">
                  Gaps ({readiness.gaps.length})
                </h3>
                <ul className="space-y-2">
                  {readiness.gaps.map((item) => (
                    <li
                      key={item.label}
                      className="flex items-center justify-between gap-3 text-sm"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="truncate">{item.label}</span>
                        {item.required && (
                          <Badge variant="destructive">Required</Badge>
                        )}
                      </span>
                      <span
                        className={cn(
                          "shrink-0 font-medium tabular-nums",
                          item.score > 0
                            ? "text-destructive"
                            : "text-muted-foreground",
                        )}
                      >
                        {item.score > 0
                          ? `${Math.round(item.score)}%`
                          : "No evidence"}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {readiness.unknown.length > 0 && (
              <section aria-labelledby="jr-unknown" className="border-t pt-4">
                <h3
                  id="jr-unknown"
                  className="mb-2 flex items-center gap-1.5 text-sm font-medium"
                >
                  <CircleHelp className="h-4 w-4" aria-hidden="true" />
                  Not measurable here ({readiness.unknown.length})
                </h3>
                <div className="flex flex-wrap gap-1.5">
                  {readiness.unknown.map((label) => (
                    <Badge key={label} variant="outline">
                      {label}
                    </Badge>
                  ))}
                </div>
                <p className="mt-2 text-pretty text-xs text-muted-foreground">
                  These aren&apos;t in our skill graph, so we can&apos;t score
                  them. They still count against readiness — an unmeasured
                  requirement is a risk, not a free pass.
                </p>
              </section>
            )}

            <div className="border-t pt-4">
              <Button asChild variant="outline" size="sm">
                <Link href="/roadmap">Build a plan around these gaps</Link>
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
