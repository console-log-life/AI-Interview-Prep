import Link from "next/link";
import {
  Check,
  CircleSlash,
  MinusCircle,
  RotateCcw,
  X,
} from "lucide-react";

import { ScoreBar } from "@/components/shared/score-bar";
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
import { cn, formatDuration, humanizeEnum } from "@/lib/utils";

type ResultQuestion = {
  index: number;
  id: string;
  text: string;
  type: string;
  topic: string;
  difficulty: string;
  explanation: string | null;
  expectedAnswer: string | null;
  options: Array<{ id: string; text: string; isCorrect: boolean }>;
  selectedOptions: string[];
  textAnswer: string;
  isCorrect: boolean | null;
  answered: boolean;
};

type AssessmentResultProps = {
  result: {
    id: string;
    title: string;
    category: string;
    difficulty: string;
    passPercentage: number;
    score: number;
    maxScore: number;
    percentage: number;
    correctCount: number;
    incorrectCount: number;
    unansweredCount: number;
    timeSpentSec: number;
    passed: boolean;
    status: string;
    breakdown: {
      byTopic?: Array<{
        topic: string;
        correct: number;
        total: number;
        percentage: number;
      }>;
      byDifficulty?: Array<{
        difficulty: string;
        correct: number;
        total: number;
        percentage: number;
      }>;
    } | null;
    questions: ResultQuestion[];
  };
};

function OptionRow({
  option,
  selected,
}: {
  option: { id: string; text: string; isCorrect: boolean };
  selected: boolean;
}) {
  const state = option.isCorrect
    ? "correct"
    : selected
      ? "wrong"
      : "neutral";

  return (
    <li
      className={cn(
        "flex items-start gap-2.5 rounded-md border px-3 py-2 text-sm",
        state === "correct" && "border-success/50 bg-success/10",
        state === "wrong" && "border-destructive/50 bg-destructive/10",
      )}
    >
      {state === "correct" ? (
        <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden="true" />
      ) : state === "wrong" ? (
        <X className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
      ) : (
        <CircleSlash
          className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/40"
          aria-hidden="true"
        />
      )}
      <span className="leading-relaxed">
        {option.text}
        {/* Meaning is spelled out, not left to colour alone. */}
        {option.isCorrect && (
          <span className="ml-2 text-xs font-medium text-success">
            Correct answer
          </span>
        )}
        {selected && !option.isCorrect && (
          <span className="ml-2 text-xs font-medium text-destructive">
            Your answer
          </span>
        )}
        {selected && option.isCorrect && (
          <span className="ml-2 text-xs font-medium text-success">
            · You picked this
          </span>
        )}
      </span>
    </li>
  );
}

export function AssessmentResult({ result }: AssessmentResultProps) {
  const byTopic = result.breakdown?.byTopic ?? [];
  const byDifficulty = result.breakdown?.byDifficulty ?? [];
  const weakest = byTopic.filter((topic) => topic.percentage < 60);

  return (
    <div className="space-y-6">
      {/* Headline */}
      <Card>
        <CardContent className="grid gap-6 p-6 md:grid-cols-[auto_1fr] md:items-center">
          <ScoreRing score={result.percentage} label="Score" />
          <div className="space-y-4">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={result.passed ? "success" : "destructive"}>
                  {result.passed ? "Passed" : "Below pass mark"}
                </Badge>
                {result.status === "EXPIRED" && (
                  <Badge variant="warning">Auto-submitted at time limit</Badge>
                )}
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                You scored{" "}
                <span className="font-medium text-foreground tabular-nums">
                  {result.score}/{result.maxScore}
                </span>{" "}
                points. The pass mark for this assessment is{" "}
                {result.passPercentage}%.
              </p>
            </div>

            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div>
                <dt className="text-xs text-muted-foreground">Correct</dt>
                <dd className="mt-0.5 flex items-center gap-1.5 text-lg font-semibold tabular-nums text-success">
                  <Check className="h-4 w-4" aria-hidden="true" />
                  {result.correctCount}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Incorrect</dt>
                <dd className="mt-0.5 flex items-center gap-1.5 text-lg font-semibold tabular-nums text-destructive">
                  <X className="h-4 w-4" aria-hidden="true" />
                  {result.incorrectCount}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Unanswered</dt>
                <dd className="mt-0.5 flex items-center gap-1.5 text-lg font-semibold tabular-nums text-muted-foreground">
                  <MinusCircle className="h-4 w-4" aria-hidden="true" />
                  {result.unansweredCount}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Time taken</dt>
                <dd className="mt-0.5 text-lg font-semibold tabular-nums">
                  {formatDuration(result.timeSpentSec)}
                </dd>
              </div>
            </dl>
          </div>
        </CardContent>
      </Card>

      {/* Breakdown */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">By topic</CardTitle>
            <CardDescription>Where the marks were won and lost.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {byTopic.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No topic breakdown available for this attempt.
              </p>
            ) : (
              byTopic.map((topic) => (
                <ScoreBar
                  key={topic.topic}
                  label={topic.topic}
                  score={topic.percentage}
                  detail={`${topic.correct}/${topic.total} correct`}
                />
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">By difficulty</CardTitle>
            <CardDescription>
              Whether the gap is fundamentals or application.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {byDifficulty.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No difficulty breakdown available for this attempt.
              </p>
            ) : (
              byDifficulty.map((entry) => (
                <ScoreBar
                  key={entry.difficulty}
                  label={humanizeEnum(entry.difficulty)}
                  score={entry.percentage}
                  detail={`${entry.correct}/${entry.total} correct`}
                />
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {/* What to do next */}
      {weakest.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recommended practice</CardTitle>
            <CardDescription>
              Based on the topics you scored under 60% on.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {weakest.map((topic) => (
              <div
                key={topic.topic}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4"
              >
                <div>
                  <p className="text-sm font-medium">{topic.topic}</p>
                  <p className="text-xs text-muted-foreground">
                    {topic.correct} of {topic.total} correct ({topic.percentage}%)
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/assessments?category=${result.category}`}>
                      Practise again
                    </Link>
                  </Button>
                  <Button asChild size="sm" variant="outline">
                    <Link href="/interview/new?type=TECHNICAL">
                      Discuss in an interview
                    </Link>
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Full review */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Review every question</CardTitle>
          <CardDescription>
            Correct answers and explanations — released only now that the
            attempt is submitted.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="space-y-6">
            {result.questions.map((question) => {
              const openEnded = question.isCorrect === null;
              return (
                <li
                  key={question.id}
                  className="border-b pb-6 last:border-0 last:pb-0"
                >
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <Badge variant="outline">Q{question.index + 1}</Badge>
                    <Badge variant="secondary">{question.topic}</Badge>
                    {openEnded ? (
                      <Badge variant="outline">Self-review</Badge>
                    ) : question.isCorrect ? (
                      <Badge variant="success">Correct</Badge>
                    ) : question.answered ? (
                      <Badge variant="destructive">Incorrect</Badge>
                    ) : (
                      <Badge variant="warning">Not answered</Badge>
                    )}
                  </div>

                  <p className="text-sm font-medium leading-relaxed text-pretty">
                    {question.text}
                  </p>

                  {openEnded ? (
                    <div className="mt-3 space-y-3">
                      <div>
                        <p className="text-xs font-medium text-muted-foreground">
                          Your answer
                        </p>
                        <p className="mt-1 whitespace-pre-wrap rounded-md border bg-muted/40 p-3 text-sm">
                          {question.textAnswer || "(not answered)"}
                        </p>
                      </div>
                      {question.expectedAnswer && (
                        <div>
                          <p className="text-xs font-medium text-muted-foreground">
                            Reference answer
                          </p>
                          <p className="mt-1 whitespace-pre-wrap rounded-md border border-success/40 bg-success/5 p-3 text-sm">
                            {question.expectedAnswer}
                          </p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <ul className="mt-3 space-y-2">
                      {question.options.map((option) => (
                        <OptionRow
                          key={option.id}
                          option={option}
                          selected={question.selectedOptions.includes(option.id)}
                        />
                      ))}
                    </ul>
                  )}

                  {question.explanation && (
                    <div className="mt-3 rounded-md border-l-2 border-primary bg-muted/40 px-3 py-2">
                      <p className="text-xs font-medium text-muted-foreground">
                        Explanation
                      </p>
                      <p className="mt-1 text-sm leading-relaxed text-pretty">
                        {question.explanation}
                      </p>
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-3">
        <Button asChild>
          <Link href="/assessments">
            <RotateCcw aria-hidden="true" />
            Take another assessment
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/progress">View your progress</Link>
        </Button>
      </div>
    </div>
  );
}
