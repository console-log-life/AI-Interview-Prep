import Link from "next/link";
import { Bot, CalendarDays, CircleAlert, ListChecks } from "lucide-react";

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
import { cn } from "@/lib/utils";
import type { SeniorityComparison } from "@/lib/analytics/seniority";
import type { RoadmapStep, SkillLevel, SkillMatch } from "@/types/job-description";

type JdResultProps = {
  id: string;
  title: string;
  company: string | null;
  matchScore: number;
  experienceReq: string | null;
  requiredSkills: string[];
  preferredSkills: string[];
  technologies: string[];
  responsibilities: string[];
  keywords: string[];
  skillMatch: SkillMatch[];
  missingSkills: string[];
  roadmap: RoadmapStep[];
  suggestedTopics: string[];
  /**
   * How this role's seniority compares to the candidate's stated level.
   *
   * Null when the ad does not say — which is common, and is shown as nothing
   * at all rather than a guessed band.
   */
  seniority: SeniorityComparison | null;
};

const LEVEL_META: Record<
  SkillLevel,
  { label: string; variant: "success" | "warning" | "destructive" | "secondary"; bar: string }
> = {
  STRONG: { label: "Strong", variant: "success", bar: "bg-success" },
  MEDIUM: { label: "Medium", variant: "warning", bar: "bg-warning" },
  WEAK: { label: "Weak", variant: "destructive", bar: "bg-destructive" },
  MISSING: { label: "Missing", variant: "secondary", bar: "bg-muted-foreground" },
};

export function JdResult(props: JdResultProps) {
  const ordered = [...props.skillMatch].sort((a, b) => a.score - b.score);

  return (
    <div className="space-y-6">
      {/* Headline */}
      <Card className="rounded-2xl border-border/70">
        <CardContent className="grid gap-6 p-6 md:grid-cols-[auto_1fr] md:items-center">
          <ScoreRing score={props.matchScore} label="Preparation match" />
          <div className="space-y-3">
            <div>
              <h2 className="text-lg font-semibold">{props.title}</h2>
              {props.company && (
                <p className="text-sm text-muted-foreground">{props.company}</p>
              )}
            </div>
            {props.experienceReq && (
              <p className="text-sm">
                <span className="text-muted-foreground">
                  Experience required:{" "}
                </span>
                {props.experienceReq}
              </p>
            )}
            {/* Read from the line above, onto the same scale as the
                candidate's own level. Information about what to expect in the
                interview, deliberately not advice about whether to apply. */}
            {props.seniority && (
              <p
                className={cn(
                  "text-sm text-pretty",
                  props.seniority.verdict === "ABOVE"
                    ? "text-warning"
                    : "text-muted-foreground",
                )}
              >
                {props.seniority.message}
              </p>
            )}
            <p className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground text-pretty">
              This score measures how ready you are to prepare for this role
              against the evidence in your profile and resume. It is not a
              prediction of whether you will be hired, and no employer sees it.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Skill-by-skill */}
      <Card className="rounded-2xl border-border/70">
        <CardHeader>
          <CardTitle className="type-card-title">Skill match</CardTitle>
          <CardDescription>
            Every requirement rated against what you have evidence for.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {ordered.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No specific skills were extracted from this posting.
            </p>
          ) : (
            <ul className="space-y-4">
              {ordered.map((entry) => {
                const meta = LEVEL_META[entry.level];
                return (
                  <li key={entry.skill} className="space-y-1.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm font-medium">{entry.skill}</span>
                      <span className="flex items-center gap-2">
                        <Badge variant={meta.variant}>{meta.label}</Badge>
                        <span className="text-sm tabular-nums text-muted-foreground">
                          {Math.round(entry.score)}%
                        </span>
                      </span>
                    </div>
                    <Progress
                      value={entry.score}
                      indicatorClassName={meta.bar}
                      aria-label={`${entry.skill}: ${meta.label}, ${Math.round(entry.score)} percent`}
                    />
                    {entry.note && (
                      <p className="text-xs text-muted-foreground text-pretty">
                        {entry.note}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Gaps */}
      {props.missingSkills.length > 0 && (
        <Card className="border-destructive/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CircleAlert className="h-4 w-4 text-destructive" aria-hidden="true" />
              Missing skills
            </CardTitle>
            <CardDescription>
              Required by the posting with no evidence in your profile or
              resume. These are already in your recommendations.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {props.missingSkills.map((skill) => (
                <Badge key={skill} variant="destructive">
                  {skill}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Roadmap */}
      {props.roadmap.length > 0 && (
        <Card className="rounded-2xl border-border/70">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarDays className="h-4 w-4 text-primary" aria-hidden="true" />
              Preparation roadmap
            </CardTitle>
            <CardDescription>
              An ordered plan targeting the gaps above.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="space-y-4">
              {props.roadmap.map((step) => (
                <li key={step.step} className="flex gap-4">
                  <span
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground"
                    aria-hidden="true"
                  >
                    {step.step}
                  </span>
                  <div className="min-w-0 pb-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-medium">{step.title}</h3>
                      <Badge variant="outline">~{step.estimatedDays} days</Badge>
                    </div>
                    {step.detail && (
                      <p className="mt-1 text-sm text-muted-foreground text-pretty">
                        {step.detail}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      )}

      {/* Extracted detail */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="rounded-2xl border-border/70">
          <CardHeader>
            <CardTitle className="type-card-title">
              What they&apos;re asking for
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {(
              [
                ["Required skills", props.requiredSkills, "default"],
                ["Preferred skills", props.preferredSkills, "secondary"],
                ["Technologies", props.technologies, "outline"],
              ] as const
            ).map(([label, items, variant]) =>
              items.length > 0 ? (
                <div key={label}>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {label}
                  </h3>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {items.map((item) => (
                      <Badge key={item} variant={variant}>
                        {item}
                      </Badge>
                    ))}
                  </div>
                </div>
              ) : null,
            )}
            {props.keywords.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Keywords worth mirroring on your resume
                </h3>
                <p className="mt-2 text-sm text-muted-foreground text-pretty">
                  {props.keywords.join(" · ")}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-border/70">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ListChecks className="h-4 w-4" aria-hidden="true" />
              Responsibilities
            </CardTitle>
          </CardHeader>
          <CardContent>
            {props.responsibilities.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No responsibilities were extracted.
              </p>
            ) : (
              <ul className="space-y-2">
                {props.responsibilities.map((item, index) => (
                  <li
                    key={index}
                    className={cn("text-sm text-muted-foreground text-pretty")}
                  >
                    • {item}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap gap-3">
        <Button asChild>
          <Link href={`/interview/new?jd=${props.id}`}>
            <Bot aria-hidden="true" />
            Interview for this role
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/assessments">Practise the gaps</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/job-description">Analyse another posting</Link>
        </Button>
      </div>
    </div>
  );
}
