"use client";

import type { AnswerState, AttemptQuestion } from "@/hooks/use-assessment";
import { cn } from "@/lib/utils";

type QuestionNavigationProps = {
  questions: AttemptQuestion[];
  answers: Record<string, AnswerState>;
  current: number;
  onSelect: (index: number) => void;
};

function statusOf(answer: AnswerState | undefined) {
  const answered =
    (answer?.selectedOptions.length ?? 0) > 0 ||
    Boolean(answer?.textAnswer?.trim());
  if (answer?.markedForReview) return "marked" as const;
  if (answered) return "answered" as const;
  return "unanswered" as const;
}

const STATUS_CLASS = {
  answered: "border-success bg-success/15 text-success",
  marked: "border-warning bg-warning/15 text-warning",
  unanswered: "border-border bg-background text-muted-foreground",
};

const STATUS_LABEL = {
  answered: "answered",
  marked: "marked for review",
  unanswered: "not answered",
};

export function QuestionNavigation({
  questions,
  answers,
  current,
  onSelect,
}: QuestionNavigationProps) {
  return (
    <nav aria-label="Question navigation">
      <ol className="grid grid-cols-8 gap-2 sm:grid-cols-10 lg:grid-cols-5">
        {questions.map((question, index) => {
          const status = statusOf(answers[question.id]);
          const isCurrent = index === current;
          return (
            <li key={question.id}>
              <button
                type="button"
                onClick={() => onSelect(index)}
                aria-current={isCurrent ? "step" : undefined}
                aria-label={`Question ${index + 1}, ${STATUS_LABEL[status]}`}
                className={cn(
                  "flex h-9 w-full items-center justify-center rounded-md border text-sm font-medium tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  STATUS_CLASS[status],
                  isCurrent && "ring-2 ring-primary ring-offset-1",
                )}
              >
                {index + 1}
              </button>
            </li>
          );
        })}
      </ol>

      {/* Legend — status must be readable without relying on colour alone. */}
      <dl className="mt-4 space-y-1.5 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <span
            className="h-3 w-3 rounded border border-success bg-success/15"
            aria-hidden="true"
          />
          <dt className="sr-only">Green</dt>
          <dd>Answered</dd>
        </div>
        <div className="flex items-center gap-2">
          <span
            className="h-3 w-3 rounded border border-warning bg-warning/15"
            aria-hidden="true"
          />
          <dt className="sr-only">Amber</dt>
          <dd>Marked for review</dd>
        </div>
        <div className="flex items-center gap-2">
          <span
            className="h-3 w-3 rounded border border-border bg-background"
            aria-hidden="true"
          />
          <dt className="sr-only">Grey</dt>
          <dd>Not answered</dd>
        </div>
      </dl>
    </nav>
  );
}
