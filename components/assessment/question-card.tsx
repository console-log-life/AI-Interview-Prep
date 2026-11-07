"use client";

import { Flag } from "lucide-react";

import type { AnswerState, AttemptQuestion } from "@/hooks/use-assessment";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { cn, humanizeEnum } from "@/lib/utils";

type QuestionCardProps = {
  question: AttemptQuestion;
  total: number;
  answer: AnswerState;
  onChange: (patch: Partial<AnswerState>) => void;
};

export function QuestionCard({
  question,
  total,
  answer,
  onChange,
}: QuestionCardProps) {
  const isMulti = question.type === "MULTI_SELECT";
  const isOpenEnded =
    question.type === "SHORT_ANSWER" ||
    question.type === "BEHAVIORAL" ||
    question.type === "TECHNICAL";

  function toggleOption(optionId: string, checked: boolean) {
    if (isMulti) {
      const next = checked
        ? [...answer.selectedOptions, optionId]
        : answer.selectedOptions.filter((id) => id !== optionId);
      onChange({ selectedOptions: next });
    } else {
      onChange({ selectedOptions: [optionId] });
    }
  }

  return (
    <Card>
      <CardHeader className="gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">
              Question {question.index + 1} of {total}
            </Badge>
            <Badge variant="secondary">{question.topic}</Badge>
            <Badge variant="outline">{humanizeEnum(question.difficulty)}</Badge>
            {isMulti && <Badge variant="warning">Select all that apply</Badge>}
          </div>
          <Button
            type="button"
            variant={answer.markedForReview ? "secondary" : "ghost"}
            size="sm"
            onClick={() => onChange({ markedForReview: !answer.markedForReview })}
            aria-pressed={answer.markedForReview}
          >
            <Flag aria-hidden="true" />
            {answer.markedForReview ? "Marked" : "Mark for review"}
          </Button>
        </div>

        <h2 className="text-base font-medium leading-relaxed text-pretty">
          {question.text}
        </h2>
      </CardHeader>

      <CardContent>
        {isOpenEnded ? (
          <div className="space-y-2">
            <Label htmlFor={`answer-${question.id}`}>Your answer</Label>
            <Textarea
              id={`answer-${question.id}`}
              value={answer.textAnswer}
              onChange={(event) => onChange({ textAnswer: event.target.value })}
              placeholder="Type your answer…"
              rows={7}
              maxLength={4000}
            />
            <p className="text-xs text-muted-foreground">
              Written answers aren&apos;t auto-graded — you&apos;ll be shown the
              reference answer for self-review after you submit.
            </p>
          </div>
        ) : isMulti ? (
          <fieldset className="space-y-2">
            <legend className="sr-only">Select all correct options</legend>
            {question.options.map((option) => {
              const checked = answer.selectedOptions.includes(option.id);
              return (
                <label
                  key={option.id}
                  htmlFor={option.id}
                  className={cn(
                    "flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition-colors hover:bg-accent/50 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
                    checked && "border-primary bg-accent",
                  )}
                >
                  <Checkbox
                    id={option.id}
                    checked={checked}
                    onCheckedChange={(value) =>
                      toggleOption(option.id, value === true)
                    }
                    className="mt-0.5"
                  />
                  <span className="text-sm leading-relaxed">{option.text}</span>
                </label>
              );
            })}
          </fieldset>
        ) : (
          <RadioGroup
            value={answer.selectedOptions[0] ?? ""}
            onValueChange={(value) => toggleOption(value, true)}
            aria-label="Answer options"
          >
            {question.options.map((option) => {
              const checked = answer.selectedOptions[0] === option.id;
              return (
                <label
                  key={option.id}
                  htmlFor={option.id}
                  className={cn(
                    "flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition-colors hover:bg-accent/50 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
                    checked && "border-primary bg-accent",
                  )}
                >
                  <RadioGroupItem
                    value={option.id}
                    id={option.id}
                    className="mt-0.5"
                  />
                  <span className="text-sm leading-relaxed">{option.text}</span>
                </label>
              );
            })}
          </RadioGroup>
        )}
      </CardContent>
    </Card>
  );
}
