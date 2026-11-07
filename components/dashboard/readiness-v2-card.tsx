import Link from "next/link";
import { Info, ShieldCheck, TrendingDown, TrendingUp } from "lucide-react";

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
import { Progress } from "@/components/ui/progress";
import {
  CONFIDENCE_LEVEL_LABEL,
  PILLAR_LABEL,
  type ReadinessResult,
} from "@/lib/analytics/readiness";
import { cn } from "@/lib/utils";

type ReadinessV2CardProps = {
  readiness: ReadinessResult;
  streak: number;
};

const CONFIDENCE_STYLE: Record<ReadinessResult["confidence"], string> = {
  NONE: "border-muted-foreground/30 text-muted-foreground",
  LOW: "border-destructive/40 text-destructive",
  MEDIUM: "border-warning/50 text-warning-foreground bg-warning/10",
  HIGH: "border-success/50 text-success-foreground bg-success/10",
};

/**
 * Readiness with its evidence shown, not hidden.
 *
 * The score and the confidence in that score are two different facts, and the
 * card refuses to blur them: a 90 from one interview is displayed as a 90 with
 * LOW confidence, plus the plain-English reasons that produced it.
 */
export function ReadinessV2Card({ readiness, streak }: ReadinessV2CardProps) {
  const hasEvidence = readiness.pillars.some((pillar) => pillar.count > 0);

  return (
    <Card className="rounded-2xl border-border/70">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle>Interview readiness</CardTitle>
            <CardDescription>
              Performance discounted by how much evidence we actually have.
            </CardDescription>
          </div>
          <Badge
            variant="outline"
            className={cn("shrink-0", CONFIDENCE_STYLE[readiness.confidence])}
          >
            {CONFIDENCE_LEVEL_LABEL[readiness.confidence]}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {!hasEvidence ? (
          <div className="rounded-lg border border-dashed px-4 py-8 text-center">
            <Info
              className="mx-auto mb-3 h-6 w-6 text-muted-foreground"
              aria-hidden="true"
            />
            <p className="text-sm font-medium">No score yet</p>
            <p className="mx-auto mt-1 max-w-xs text-pretty text-sm text-muted-foreground">
              Readiness needs real results. Complete one activity and this
              becomes a measured number — never a placeholder.
            </p>
            <Button asChild size="sm" className="mt-4">
              <Link href="/interview/new">Run your first interview</Link>
            </Button>
          </div>
        ) : (
          <>
            <div className="flex flex-col items-center gap-3">
              <ScoreRing score={readiness.readiness} label="Readiness" />
              <p className="text-center text-sm text-muted-foreground">
                Raw performance{" "}
                <span className="font-medium tabular-nums text-foreground">
                  {readiness.rawPerformance}
                </span>{" "}
                × evidence{" "}
                <span className="font-medium tabular-nums text-foreground">
                  {Math.round(readiness.evidenceFactor * 100)}%
                </span>
                {readiness.mistakePenalty > 0 && (
                  <>
                    {" "}
                    − repeated mistakes{" "}
                    <span className="font-medium tabular-nums text-destructive">
                      {readiness.mistakePenalty}
                    </span>
                  </>
                )}
              </p>
            </div>

            <div className="space-y-3 border-t pt-4">
              <h3 className="text-sm font-medium">Where the score comes from</h3>
              {readiness.pillars.map((pillar) => (
                <div key={pillar.key} className="space-y-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">
                      {PILLAR_LABEL[pillar.key]}
                      <span className="ml-1.5 text-xs">
                        ({Math.round(pillar.weight * 100)}% weight)
                      </span>
                    </span>
                    <span className="font-medium tabular-nums">
                      {pillar.score === null
                        ? "No data"
                        : `${Math.round(pillar.score)}%`}
                    </span>
                  </div>
                  <Progress
                    value={pillar.score ?? 0}
                    aria-label={`${PILLAR_LABEL[pillar.key]} ${
                      pillar.score === null
                        ? "no data"
                        : `${Math.round(pillar.score)} percent`
                    }`}
                  />
                  <p className="text-xs text-muted-foreground">
                    {pillar.count} completed
                    {pillar.daysSince !== null &&
                      ` · last ${pillar.daysSince === 0 ? "today" : `${pillar.daysSince}d ago`}`}
                    {` · evidence ${Math.round(pillar.coverage * 100)}%`}
                  </p>
                </div>
              ))}
            </div>
          </>
        )}

        {readiness.explanations.length > 0 && (
          <ul className="space-y-2 border-t pt-4">
            {readiness.explanations.map((explanation) => (
              <li
                key={explanation}
                className="flex gap-2 text-sm text-muted-foreground"
              >
                <ShieldCheck
                  className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
                <span className="text-pretty">{explanation}</span>
              </li>
            ))}
          </ul>
        )}

        <div className="flex items-center justify-between border-t pt-4 text-sm">
          <span className="text-muted-foreground">Practice streak</span>
          <span className="flex items-center gap-1.5 font-medium tabular-nums">
            {streak > 0 ? (
              <TrendingUp className="h-4 w-4 text-success" aria-hidden="true" />
            ) : (
              <TrendingDown
                className="h-4 w-4 text-muted-foreground"
                aria-hidden="true"
              />
            )}
            {streak} day{streak === 1 ? "" : "s"}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
