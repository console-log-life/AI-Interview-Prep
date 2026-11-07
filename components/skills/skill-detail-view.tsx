import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Brain,
  CalendarClock,
  Minus,
  TrendingDown,
  TrendingUp,
} from "lucide-react";

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
import { Progress } from "@/components/ui/progress";
import type { SkillDetail } from "@/lib/skills/detail";
import { cn, humanizeEnum } from "@/lib/utils";

const SEVERITY_STYLE: Record<string, string> = {
  HIGH: "border-destructive/30 bg-destructive/10 text-destructive",
  MEDIUM: "border-warning/40 bg-warning/10 text-warning-foreground",
  LOW: "border-muted-foreground/30 text-muted-foreground",
};

/**
 * Skill detail.
 *
 * Server component — every value is already resolved by `getSkillDetail`, so
 * there is nothing here that needs to run in the browser.
 */
export function SkillDetailView({ detail }: { detail: SkillDetail }) {
  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Current standing</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {detail.hasEvidence ? (
              <>
                <div className="flex justify-center">
                  <ScoreRing score={detail.score} label={detail.label} />
                </div>

                <dl className="space-y-2.5 border-t pt-4 text-sm">
                  <Row label="Confidence" value={detail.confidenceLabel} />
                  <Row
                    label="Trend"
                    value={<TrendValue trend={detail.trend} />}
                  />
                  <Row
                    label="Evidence"
                    value={`${detail.observations} observation${
                      detail.observations === 1 ? "" : "s"
                    }`}
                  />
                  <Row
                    label="Last practised"
                    value={
                      detail.lastPracticedAt
                        ? relativeDays(detail.lastPracticedAt)
                        : "Never"
                    }
                  />
                </dl>

                <div className="rounded-md border bg-muted/40 p-3">
                  <p className="eyebrow mb-1">Suggested</p>
                  <p className="text-sm font-medium">{detail.actionLabel}</p>
                </div>
              </>
            ) : (
              <EmptyState
                icon={Brain}
                title="Not measured yet"
                description="This skill gets a score the first time you answer something that tests it. Nothing is estimated in the meantime."
                action={{ label: "Start an interview", href: "/interview/new" }}
              />
            )}
          </CardContent>
        </Card>

        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Subtopics</CardTitle>
              <CardDescription>
                {detail.subtopics.length > 0
                  ? "Weakest measured area first; unpractised areas last."
                  : "This skill has no subtopics in the graph."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {detail.subtopics.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nothing more granular to break down here.
                </p>
              ) : (
                <ul className="space-y-3.5">
                  {detail.subtopics.map((subtopic) => (
                    <li key={subtopic.skillKey}>
                      <Link
                        href={`/skills/${encodeURIComponent(subtopic.skillKey)}`}
                        className="group block rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <div className="flex items-center justify-between gap-2 text-sm">
                          <span className="flex min-w-0 items-center gap-2">
                            <span className="truncate font-medium group-hover:underline">
                              {subtopic.label}
                            </span>
                            {subtopic.hasEvidence && (
                              <TrendIcon trend={subtopic.trend} />
                            )}
                          </span>
                          <span className="shrink-0 tabular-nums text-muted-foreground">
                            {subtopic.hasEvidence
                              ? `${Math.round(subtopic.score)}%`
                              : "No data"}
                          </span>
                        </div>
                        <Progress
                          value={subtopic.hasEvidence ? subtopic.score : 0}
                          className="mt-1.5"
                          aria-label={`${subtopic.label} ${
                            subtopic.hasEvidence
                              ? `${Math.round(subtopic.score)} percent`
                              : "no data"
                          }`}
                        />
                        <p className="mt-1 text-xs text-muted-foreground">
                          {subtopic.hasEvidence
                            ? `${subtopic.confidenceLabel} · ${subtopic.observations} observation${
                                subtopic.observations === 1 ? "" : "s"
                              }`
                            : "Not practised yet"}
                        </p>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <div className="grid gap-6 sm:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                  Mistakes here
                </CardTitle>
              </CardHeader>
              <CardContent>
                {detail.mistakes.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No unresolved mistakes recorded against this skill.
                  </p>
                ) : (
                  <ul className="space-y-2.5">
                    {detail.mistakes.map((mistake) => (
                      <li key={mistake.id}>
                        <div className="flex items-start justify-between gap-2">
                          <p className="min-w-0 text-pretty text-sm font-medium">
                            {mistake.label}
                          </p>
                          <Badge
                            variant="outline"
                            className={cn(
                              "shrink-0",
                              SEVERITY_STYLE[mistake.severity],
                            )}
                          >
                            {mistake.frequency}×
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {humanizeEnum(mistake.status)} · last{" "}
                          {relativeDays(mistake.lastSeenAt)}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Recent evidence</CardTitle>
              </CardHeader>
              <CardContent>
                {detail.recentEvidence.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No graded activity has touched this skill yet.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {detail.recentEvidence.map((row) => (
                      <li
                        key={row.id}
                        className="flex items-center justify-between gap-3 text-sm"
                      >
                        <span className="min-w-0 truncate text-muted-foreground">
                          {humanizeEnum(row.source)} · {humanizeEnum(row.difficulty)}
                        </span>
                        <span className="shrink-0 tabular-nums font-medium">
                          {row.score}%
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>What to do about it</CardTitle>
          <CardDescription>
            Actions drawn from your own queue and plan — not generic advice.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm">
              <Link href="/assessments">
                Drill {detail.label}
                <ArrowRight className="ml-1 h-4 w-4" aria-hidden="true" />
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/interview/new">Test it in an interview</Link>
            </Button>
            {detail.dueReviews > 0 && (
              <Button asChild size="sm" variant="outline">
                <Link href="/practice">
                  <CalendarClock className="h-4 w-4" aria-hidden="true" />
                  {detail.dueReviews} review
                  {detail.dueReviews === 1 ? "" : "s"} due
                </Link>
              </Button>
            )}
          </div>

          {detail.weakSubtopics.length > 0 && (
            <div>
              <p className="eyebrow mb-2">Weakest areas to target first</p>
              <div className="flex flex-wrap gap-1.5">
                {detail.weakSubtopics.map((subtopic) => (
                  <Badge
                    key={subtopic.skillKey}
                    variant="outline"
                    className="border-destructive/30 bg-destructive/10 text-destructive"
                  >
                    {subtopic.label} {Math.round(subtopic.score)}%
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {detail.plannedTasks.length > 0 && (
            <div>
              <p className="eyebrow mb-2">On today&apos;s plan</p>
              <ul className="space-y-1.5">
                {detail.plannedTasks.map((task) => (
                  <li
                    key={task.id}
                    className={cn(
                      "text-sm",
                      task.isCompleted
                        ? "text-muted-foreground line-through"
                        : "text-foreground",
                    )}
                  >
                    {task.title}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Row({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}

function TrendValue({ trend }: { trend: number }) {
  if (Math.abs(trend) < 3) return <span>Holding steady</span>;
  return (
    <span className={trend > 0 ? "text-success" : "text-destructive"}>
      {trend > 0 ? "+" : ""}
      {Math.round(trend)} pts
    </span>
  );
}

function TrendIcon({ trend }: { trend: number }) {
  if (Math.abs(trend) < 3) {
    return (
      <Minus
        className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
        aria-label="Holding steady"
      />
    );
  }
  const Icon = trend > 0 ? TrendingUp : TrendingDown;
  return (
    <Icon
      className={cn(
        "h-3.5 w-3.5 shrink-0",
        trend > 0 ? "text-success" : "text-destructive",
      )}
      aria-label={trend > 0 ? "Improving" : "Declining"}
    />
  );
}

function relativeDays(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}
