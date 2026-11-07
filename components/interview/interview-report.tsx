"use client";

import Link from "next/link";
import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
} from "recharts";
import {
  AlertTriangle,
  Lightbulb,
  RotateCcw,
  ThumbsUp,
  TrendingDown,
} from "lucide-react";

import { ScoreRing } from "@/components/shared/score-ring";
import {
  evidenceOfKind,
  type ResolvedEvidence,
} from "@/lib/interviews/report-evidence";
import {
  rubricBand,
  rubricRows,
  type RubricNotes,
  type RubricScores,
} from "@/lib/interviews/rubric";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export type ReportData = {
  overallScore: number;
  technicalScore: number;
  communicationScore: number;
  problemSolvingScore: number;
  behavioralScore: number;
  structureScore: number;
  summary: string;
  strengths: string[];
  weaknesses: string[];
  /**
   * Cited strengths and weaknesses.
   *
   * Empty for a report generated before citations existed, which renders the
   * plain list below exactly as it always did.
   */
  evidence: ResolvedEvidence[];
  repeatedMistakes: string[];
  recommendations: string[];
  suggestedTopics: string[];
};

export type EvaluationRow = {
  id: string;
  questionText: string;
  answerText: string;
  topic: string | null;
  score: number;
  feedback: string;
  strengths: string[];
  missingPoints: string[];
  improvedAnswer: string | null;
  /**
   * The six rubric dimensions, which were stored from the start and never
   * shown. A dimension the evaluator left null is omitted rather than drawn as
   * a zero — see `lib/interviews/rubric.ts`.
   */
  rubric: RubricScores;
  rubricNotes: RubricNotes;
};

/**
 * The rubric for one answer: each dimension, its score, and why.
 *
 * The bar is there to make the shape of an answer readable at a glance — a
 * candidate who is accurate but unclear looks different from one who is
 * neither. Bands are coarse on purpose; the numbers come from a language
 * model, and a finer palette would imply a precision they do not have.
 */
function RubricBreakdown({
  scores,
  notes,
}: {
  scores: RubricScores;
  notes: RubricNotes;
}) {
  const rows = rubricRows(scores, notes);
  if (rows.length === 0) return null;

  const barClass = {
    strong: "bg-success",
    mixed: "bg-warning",
    weak: "bg-destructive",
  };

  return (
    <div className="mt-4 rounded-lg border bg-muted/30 p-3">
      <h4 className="text-caption font-semibold uppercase tracking-wide text-muted-foreground">
        How this answer scored
      </h4>
      <dl className="mt-2 space-y-2.5">
        {rows.map((row) => (
          <div key={row.key}>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-sm font-medium" title={row.hint}>
                {row.label}
              </dt>
              <dd className="shrink-0 text-sm tabular-nums text-muted-foreground">
                {row.score}/10
              </dd>
            </div>
            <div
              className="mt-1 h-1 w-full overflow-hidden rounded-full bg-muted"
              role="img"
              aria-label={`${row.label}: ${row.score} out of 10`}
            >
              <div
                className={`h-full rounded-full ${barClass[rubricBand(row.score)]}`}
                style={{ width: `${row.score * 10}%` }}
              />
            </div>
            {row.note && (
              <p className="mt-1 text-xs text-muted-foreground text-pretty">
                {row.note}
              </p>
            )}
          </div>
        ))}
      </dl>
    </div>
  );
}

/**
 * A qualitative section of the report.
 *
 * When the generator cited the answer a point came from, the point is shown
 * with that exchange quoted beneath it. That is the difference between a
 * report asserting "you did not quantify your impact" and one the candidate
 * can check against their own words — and disagree with.
 *
 * `evidence` is optional and falls back to the plain list, because a report
 * written before citations existed has none, and because a point the generator
 * could not trace to one specific answer is deliberately left uncited rather
 * than given a number that does not support it.
 */
function ListSection({
  title,
  icon: Icon,
  items,
  tone,
  emptyText,
  evidence = [],
}: {
  title: string;
  icon: typeof ThumbsUp;
  items: string[];
  tone: "success" | "warning" | "destructive" | "default";
  emptyText: string;
  evidence?: ResolvedEvidence[];
}) {
  const toneClass = {
    success: "text-success",
    warning: "text-warning",
    destructive: "text-destructive",
    default: "text-primary",
  }[tone];

  return (
    <div>
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <Icon className={`h-4 w-4 ${toneClass}`} aria-hidden="true" />
        {title}
      </h3>
      {items.length === 0 && evidence.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">{emptyText}</p>
      ) : evidence.length > 0 ? (
        <ul className="mt-2 space-y-3">
          {evidence.map((entry) => (
            <li
              key={`${entry.kind}-${entry.questionIndex}-${entry.point}`}
              className="rounded-lg border bg-muted/30 p-3"
            >
              <p className="flex gap-2 text-sm">
                <span className={toneClass} aria-hidden="true">
                  •
                </span>
                <span className="text-pretty">{entry.point}</span>
              </p>
              <details className="mt-2">
                <summary className="cursor-pointer text-caption font-semibold uppercase tracking-wide text-muted-foreground">
                  From answer {entry.questionIndex}
                  {entry.topic !== "General" && (
                    <span className="ml-1 font-normal normal-case">
                      · {entry.topic}
                    </span>
                  )}
                </summary>
                <p className="mt-2 text-sm font-medium text-pretty">
                  {entry.question}
                </p>
                <blockquote className="mt-1 border-l-2 pl-3 text-sm italic text-muted-foreground text-pretty">
                  {entry.answer}
                </blockquote>
              </details>
            </li>
          ))}
        </ul>
      ) : (
        <ul className="mt-2 space-y-2">
          {items.map((item, index) => (
            <li key={index} className="flex gap-2 text-sm">
              <span className={toneClass} aria-hidden="true">
                •
              </span>
              <span className="text-muted-foreground text-pretty">{item}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Colour band for a 0-100 score.
 *
 * Coarse on purpose, and the same three bands the per-answer rubric uses, so a
 * 62 in the hero and a 6/10 on an answer are not coloured by different rules.
 */
function scoreToneClass(score: number): string {
  if (score >= 70) return "text-success";
  if (score >= 40) return "text-warning";
  return "text-destructive";
}

export function InterviewReportView({
  report,
  evaluations,
  interviewId,
}: {
  report: ReportData;
  evaluations: EvaluationRow[];
  interviewId: string;
}) {
  const radarData = [
    { category: "Technical", score: report.technicalScore },
    { category: "Communication", score: report.communicationScore },
    { category: "Problem solving", score: report.problemSolvingScore },
    { category: "Behavioural", score: report.behavioralScore },
    { category: "Structure", score: report.structureScore },
  ];

  return (
    <div className="space-y-6">
      {/*
        Hero score card.
        The one place in the report that gets a tinted surface: the overall
        score and the summary are what a candidate reads first, and everything
        below is detail supporting them.
      */}
      <Card className="overflow-hidden rounded-2xl border-primary/20 shadow-md">
        <div className="gradient-hero">
          <CardContent className="grid gap-8 p-6 sm:p-8 lg:grid-cols-[auto_1fr]">
            <div className="flex justify-center">
              <ScoreRing score={report.overallScore} label="Overall" size={168} />
            </div>
            <div className="space-y-5">
              <div>
                <h2 className="eyebrow">Summary</h2>
                <p className="mt-2 text-pretty text-body leading-relaxed text-foreground/90">
                  {report.summary}
                </p>
              </div>
              <dl className="grid grid-cols-2 gap-2.5 sm:grid-cols-5">
                {radarData.map((entry) => (
                  <div
                    key={entry.category}
                    className="rounded-xl border bg-card/80 p-3 backdrop-blur-sm"
                  >
                    <dt className="text-caption font-medium uppercase tracking-wide text-muted-foreground">
                      {entry.category}
                    </dt>
                    <dd
                      className={cn(
                        "mt-1 font-display text-2xl font-bold tabular-nums",
                        scoreToneClass(entry.score),
                      )}
                    >
                      {entry.score}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          </CardContent>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
        {/* Radar */}
        <Card className="rounded-2xl border-border/70">
          <CardHeader>
            <CardTitle className="type-card-title">Category profile</CardTitle>
            <CardDescription>Where you are strong and weak.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[280px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={radarData} outerRadius="72%">
                  <PolarGrid stroke="hsl(var(--border))" />
                  <PolarAngleAxis
                    dataKey="category"
                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                  />
                  <PolarRadiusAxis
                    domain={[0, 100]}
                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
                  />
                  <Radar
                    name="Score"
                    dataKey="score"
                    stroke="hsl(var(--chart-1))"
                    fill="hsl(var(--chart-1))"
                    fillOpacity={0.35}
                  />
                </RadarChart>
              </ResponsiveContainer>
            </div>
            {/* The chart is decorative for screen readers — the dl above has
                the same numbers in text form. */}
          </CardContent>
        </Card>

        {/* Qualitative */}
        <Card className="rounded-2xl border-border/70">
          <CardHeader>
            <CardTitle className="type-card-title">What stood out</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <ListSection
              title="Strongest areas"
              icon={ThumbsUp}
              items={report.strengths}
              evidence={evidenceOfKind(report.evidence, "STRENGTH")}
              tone="success"
              emptyText="Nothing stood out as a clear strength in this session."
            />
            <ListSection
              title="Weakest areas"
              icon={TrendingDown}
              items={report.weaknesses}
              evidence={evidenceOfKind(report.evidence, "WEAKNESS")}
              tone="destructive"
              emptyText="No specific weaknesses were flagged."
            />
            <ListSection
              title="Repeated mistakes"
              icon={AlertTriangle}
              items={report.repeatedMistakes}
              tone="warning"
              emptyText="No pattern repeated across your answers — good sign."
            />
            <ListSection
              title="What to do next"
              icon={Lightbulb}
              items={report.recommendations}
              tone="default"
              emptyText="No specific recommendations for this session."
            />
          </CardContent>
        </Card>
      </div>

      {/* Suggested practice */}
      {report.suggestedTopics.length > 0 && (
        <Card className="rounded-2xl border-border/70">
          <CardHeader>
            <CardTitle className="type-card-title">Practise these topics</CardTitle>
            <CardDescription>
              Drawn from the specific gaps in your answers.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {report.suggestedTopics.map((topic) => (
                <Badge key={topic} variant="secondary">
                  {topic}
                </Badge>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button asChild size="sm" variant="outline">
                <Link href="/assessments">Take an assessment</Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link href="/coding">Practise coding</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Per-question */}
      <Card className="rounded-2xl border-border/70">
        <CardHeader>
          <CardTitle className="type-card-title">Answer-by-answer review</CardTitle>
          <CardDescription>
            The full transcript with the grader&apos;s notes on each answer.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {evaluations.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No answers were recorded for this interview.
            </p>
          ) : (
            <ol className="space-y-6">
              {evaluations.map((evaluation, index) => {
                const variant =
                  evaluation.score >= 8
                    ? "success"
                    : evaluation.score >= 5
                      ? "warning"
                      : "destructive";
                return (
                  <li
                    key={evaluation.id}
                    className="border-b pb-6 last:border-0 last:pb-0"
                  >
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <Badge variant="outline">Q{index + 1}</Badge>
                      {evaluation.topic && (
                        <Badge variant="secondary">{evaluation.topic}</Badge>
                      )}
                      <Badge variant={variant}>{evaluation.score}/10</Badge>
                    </div>

                    <p className="text-sm font-medium leading-relaxed text-pretty">
                      {evaluation.questionText}
                    </p>

                    <div className="mt-3 space-y-3">
                      <div>
                        <p className="text-xs font-medium text-muted-foreground">
                          Your answer
                        </p>
                        <p className="mt-1 whitespace-pre-wrap rounded-md border bg-muted/40 p-3 text-sm leading-relaxed">
                          {evaluation.answerText || "(no answer)"}
                        </p>
                      </div>

                      {evaluation.feedback && (
                        <div className="rounded-md border-l-2 border-primary bg-muted/40 px-3 py-2">
                          <p className="text-xs font-medium text-muted-foreground">
                            Grader feedback
                          </p>
                          <p className="mt-1 text-sm leading-relaxed text-pretty">
                            {evaluation.feedback}
                          </p>
                        </div>
                      )}

                      <RubricBreakdown
                        scores={evaluation.rubric}
                        notes={evaluation.rubricNotes}
                      />

                      {evaluation.missingPoints.length > 0 && (
                        <div>
                          <p className="text-xs font-medium text-muted-foreground">
                            What a stronger answer would add
                          </p>
                          <ul className="mt-1 space-y-1">
                            {evaluation.missingPoints.map((point, pointIndex) => (
                              <li
                                key={pointIndex}
                                className="text-sm text-muted-foreground text-pretty"
                              >
                                • {point}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {evaluation.improvedAnswer && (
                        <details className="rounded-md border p-3">
                          <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
                            Show your answer, restructured
                          </summary>
                          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-pretty">
                            {evaluation.improvedAnswer}
                          </p>
                        </details>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-3">
        <Button asChild>
          <Link href="/interview/new">
            <RotateCcw aria-hidden="true" />
            Run another interview
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link href={`/interview/${interviewId}`}>View full transcript</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/progress">See your progress</Link>
        </Button>
      </div>
    </div>
  );
}
