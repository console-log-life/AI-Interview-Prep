import Link from "next/link";
import { Flame, Info } from "lucide-react";

import { ScoreRing } from "@/components/shared/score-ring";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

type ReadinessCardProps = {
  score: number;
  delta: number | null;
  streak: number;
  profileCompleteness: number;
  hasAnyActivity: boolean;
};

export function ReadinessCard({
  score,
  delta,
  streak,
  profileCompleteness,
  hasAnyActivity,
}: ReadinessCardProps) {
  return (
    <Card className="rounded-2xl border-border/70">
      <CardHeader>
        <CardTitle>Interview readiness</CardTitle>
        <CardDescription>
          Weighted across your interview, assessment and coding results.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {hasAnyActivity ? (
          <>
            <div className="flex justify-center">
              <ScoreRing score={score} label="Readiness" />
            </div>
            {typeof delta === "number" && delta !== 0 && (
              <p className="text-center text-sm text-muted-foreground">
                {delta > 0 ? "Up" : "Down"}{" "}
                <span className="font-medium text-foreground tabular-nums">
                  {Math.abs(Math.round(delta))} point
                  {Math.abs(Math.round(delta)) === 1 ? "" : "s"}
                </span>{" "}
                since your previous session.
              </p>
            )}
          </>
        ) : (
          <div className="rounded-lg border border-dashed px-4 py-8 text-center">
            <Info
              className="mx-auto mb-3 h-6 w-6 text-muted-foreground"
              aria-hidden="true"
            />
            <p className="text-sm font-medium">No score yet</p>
            <p className="mx-auto mt-1 max-w-xs text-sm text-muted-foreground text-pretty">
              Your readiness score appears after your first scored activity. We
              don&apos;t show a placeholder number.
            </p>
            <Button asChild size="sm" className="mt-4">
              <Link href="/interview/new">Run your first interview</Link>
            </Button>
          </div>
        )}

        <div className="space-y-3 border-t pt-4">
          <div className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <Flame className="h-4 w-4" aria-hidden="true" />
              Practice streak
            </span>
            <span className="font-medium tabular-nums">
              {streak} day{streak === 1 ? "" : "s"}
            </span>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Profile completeness</span>
              <span className="font-medium tabular-nums">
                {profileCompleteness}%
              </span>
            </div>
            <Progress
              value={profileCompleteness}
              aria-label={`Profile ${profileCompleteness} percent complete`}
            />
            {profileCompleteness < 100 && (
              <p className="text-xs text-muted-foreground">
                <Link
                  href="/profile"
                  className="underline underline-offset-2 hover:text-foreground"
                >
                  Complete your profile
                </Link>{" "}
                so interviews are tailored to you.
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
