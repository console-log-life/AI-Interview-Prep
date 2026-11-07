import Link from "next/link";
import { AlertTriangle, ArrowRight, Brain, FileCheck2, Repeat } from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";
import { ScoreBar } from "@/components/shared/score-bar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { InterviewIntelligence } from "@/lib/interviews/report-intelligence";
import { cn } from "@/lib/utils";

const SEVERITY_STYLE: Record<string, string> = {
  HIGH: "border-destructive/30 bg-destructive/10 text-destructive",
  MEDIUM: "border-warning/40 bg-warning/10 text-warning-foreground",
  LOW: "border-muted-foreground/30 text-muted-foreground",
};

const CLAIM_STYLE: Record<string, string> = {
  VERIFIED: "border-success/40 bg-success/10 text-success",
  PARTIAL: "border-warning/40 bg-warning/10 text-warning-foreground",
  UNCLEAR: "border-warning/40 bg-warning/10 text-warning-foreground",
  WEAK: "border-destructive/30 bg-destructive/10 text-destructive",
  UNVERIFIED: "border-muted-foreground/30 text-muted-foreground",
};

/**
 * "What this interview changed."
 *
 * Every row here is a database row this session actually wrote — skill
 * observations, mistake occurrences, claim verifications — not a restatement
 * of the report's prose.
 */
export function InterviewImpact({
  intelligence,
}: {
  intelligence: InterviewIntelligence;
}) {
  const { skills, mistakes, claims } = intelligence;
  const nothingRecorded =
    skills.length === 0 && mistakes.length === 0 && claims.length === 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle>What this interview changed</CardTitle>
            <CardDescription>
              The measurements this session contributed to your profile.
            </CardDescription>
          </div>
          <Button asChild variant="ghost" size="sm" className="shrink-0">
            <Link href="/skills">
              Skill ledger
              <ArrowRight className="ml-1 h-4 w-4" aria-hidden="true" />
            </Link>
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {nothingRecorded ? (
          <EmptyState
            icon={Brain}
            title="Nothing recorded from this session"
            description="Skill and mistake tracking runs as answers are graded. An interview that ended before any answer was graded contributes nothing — and we won't invent it."
          />
        ) : (
          <>
            {skills.length > 0 && (
              <section aria-labelledby="impact-skills">
                <h3
                  id="impact-skills"
                  className="mb-3 flex items-center gap-2 text-sm font-medium"
                >
                  <Brain className="h-4 w-4" aria-hidden="true" />
                  Skills measured
                </h3>
                <div className="space-y-3">
                  {skills.map((skill) => (
                    <ScoreBar
                      key={skill.skillKey}
                      label={skill.label}
                      score={skill.score}
                      detail={`${skill.score}% from ${skill.observations} answer${
                        skill.observations === 1 ? "" : "s"
                      }`}
                    />
                  ))}
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  These feed your skill ledger, weighted by difficulty and
                  recency — one interview does not overwrite your history.
                </p>
              </section>
            )}

            {mistakes.length > 0 && (
              <section aria-labelledby="impact-mistakes" className="border-t pt-4">
                <h3
                  id="impact-mistakes"
                  className="mb-3 flex items-center gap-2 text-sm font-medium"
                >
                  <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                  Mistakes recorded
                </h3>
                <ul className="space-y-2">
                  {mistakes.map((mistake) => (
                    <li key={mistake.id} className="rounded-lg border p-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <p className="min-w-0 text-sm font-medium">
                          {mistake.label}
                        </p>
                        <div className="flex shrink-0 gap-1.5">
                          {mistake.isRepeated && (
                            <Badge variant="destructive">
                              <Repeat className="h-3 w-3" aria-hidden="true" />
                              {mistake.frequency}
                              {ordinal(mistake.frequency)} time
                            </Badge>
                          )}
                          <Badge
                            variant="outline"
                            className={cn(SEVERITY_STYLE[mistake.severity])}
                          >
                            {mistake.severity}
                          </Badge>
                        </div>
                      </div>
                      <p className="mt-1 text-pretty text-xs text-muted-foreground">
                        {mistake.detail}
                      </p>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {claims.length > 0 && (
              <section aria-labelledby="impact-claims" className="border-t pt-4">
                <h3
                  id="impact-claims"
                  className="mb-3 flex items-center gap-2 text-sm font-medium"
                >
                  <FileCheck2 className="h-4 w-4" aria-hidden="true" />
                  Resume claims tested
                </h3>
                <ul className="space-y-2">
                  {claims.map((claim) => (
                    <li
                      key={claim.id}
                      className="flex items-start justify-between gap-3 rounded-lg border p-3"
                    >
                      <p className="min-w-0 text-pretty text-sm">{claim.text}</p>
                      <Badge
                        variant="outline"
                        className={cn("shrink-0", CLAIM_STYLE[claim.status])}
                      >
                        {claim.statusLabel}
                        {claim.understanding !== null &&
                          ` · ${claim.understanding}%`}
                      </Badge>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function ordinal(value: number): string {
  if (value % 100 >= 11 && value % 100 <= 13) return "th";
  switch (value % 10) {
    case 1:
      return "st";
    case 2:
      return "nd";
    case 3:
      return "rd";
    default:
      return "th";
  }
}
