import Link from "next/link";
import { ArrowRight, Brain, Minus, TrendingDown, TrendingUp } from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";
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
import { CONFIDENCE_LABEL } from "@/lib/skills/scoring";
import type { SkillIntelligenceRow } from "@/lib/skills/service";
import { cn } from "@/lib/utils";

/**
 * The skill grid.
 *
 * Every row carries three separate facts — score, confidence, trend — because
 * collapsing them into one number is how prep tools end up telling people they
 * are ready when they are not. A skill with no evidence says so.
 */
export function SkillIntelligence({
  skills,
}: {
  skills: SkillIntelligenceRow[];
}) {
  const measured = skills.filter((skill) => skill.observations > 0);
  const untouched = skills.filter((skill) => skill.observations === 0);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle>Skill intelligence</CardTitle>
            <CardDescription>
              Recency-weighted across interviews, assessments and coding.
            </CardDescription>
          </div>
          <Button asChild variant="ghost" size="sm" className="shrink-0">
            <Link href="/skills">
              All skills
              <ArrowRight className="ml-1 h-4 w-4" aria-hidden="true" />
            </Link>
          </Button>
        </div>
      </CardHeader>

      <CardContent>
        {measured.length === 0 ? (
          <EmptyState
            icon={Brain}
            title="No skill data yet"
            description="Skill scores are built from real answers. Complete an interview or assessment and this grid fills in."
            action={{ label: "Start an interview", href: "/interview/new" }}
            secondaryAction={{ label: "Take an assessment", href: "/assessments" }}
          />
        ) : (
          <div className="space-y-4">
            {measured.map((skill) => (
              <SkillRow key={skill.skillKey} skill={skill} />
            ))}

            {untouched.length > 0 && (
              <div className="border-t pt-4">
                <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Not practised yet ({untouched.length})
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {untouched.map((skill) => (
                    <Badge key={skill.skillKey} variant="outline">
                      {skill.label}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SkillRow({ skill }: { skill: SkillIntelligenceRow }) {
  return (
    <Link
      href={`/skills/${encodeURIComponent(skill.skillKey)}`}
      className="group block space-y-1.5 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate font-medium group-hover:underline">
            {skill.label}
          </span>
          <TrendIcon trend={skill.trend} />
        </span>
        <span className="shrink-0 font-medium tabular-nums">
          {Math.round(skill.score)}%
        </span>
      </div>

      <Progress
        value={skill.score}
        aria-label={`${skill.label} ${Math.round(skill.score)} percent`}
      />

      <p className="text-xs text-muted-foreground">
        {CONFIDENCE_LABEL[skill.confidenceBand]} · {skill.observations}{" "}
        observation{skill.observations === 1 ? "" : "s"}
        {skill.lastPracticedAt && ` · last ${relativeDays(skill.lastPracticedAt)}`}
      </p>
    </Link>
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
      aria-label={
        trend > 0
          ? `Improving by ${Math.round(trend)} points`
          : `Declining by ${Math.abs(Math.round(trend))} points`
      }
    />
  );
}

/** Compact areas list used for both weak and strong sections. */
export function SkillFocusList({
  title,
  description,
  skills,
  emptyTitle,
  emptyDescription,
  tone,
}: {
  title: string;
  description: string;
  skills: SkillIntelligenceRow[];
  emptyTitle: string;
  emptyDescription: string;
  tone: "weak" | "strong";
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {skills.length === 0 ? (
          <EmptyState
            icon={Brain}
            title={emptyTitle}
            description={emptyDescription}
          />
        ) : (
          <ul className="space-y-3">
            {skills.map((skill) => (
              <li
                key={skill.skillKey}
                className="flex items-center justify-between gap-3"
              >
                <Link
                  href={`/skills/${encodeURIComponent(skill.skillKey)}`}
                  className="min-w-0 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <p className="truncate text-sm font-medium hover:underline">
                    {skill.label}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {CONFIDENCE_LABEL[skill.confidenceBand]} ·{" "}
                    {skill.observations} observation
                    {skill.observations === 1 ? "" : "s"}
                  </p>
                </Link>
                <span
                  className={cn(
                    "shrink-0 text-sm font-semibold tabular-nums",
                    tone === "weak" ? "text-destructive" : "text-success",
                  )}
                >
                  {Math.round(skill.score)}%
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function relativeDays(date: Date): string {
  const days = Math.floor((Date.now() - date.getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}
