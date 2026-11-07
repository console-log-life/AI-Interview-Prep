"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, CheckCircle2, Loader2, X } from "lucide-react";
import { toast } from "sonner";

import { DifficultyBadge } from "@/components/shared/difficulty-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { apiPatch, errorMessage } from "@/lib/api/client";
import { cn, humanizeEnum } from "@/lib/utils";

export type PendingQuestion = {
  id: string;
  text: string;
  category: string;
  topic: string;
  difficulty: "EASY" | "MEDIUM" | "HARD";
  type: string;
  explanation: string | null;
  expectedAnswer: string | null;
  qualityScore: number | null;
  options: Array<{ id: string; text: string; isCorrect: boolean }>;
};

/**
 * The human gate on AI-written content.
 *
 * Correct answers are shown here — this is the one screen where they must be
 * visible, because an admin cannot approve a question without checking that
 * the marked answer is actually right.
 */
export function ReviewQueue({
  questions: initial,
}: {
  questions: PendingQuestion[];
}) {
  const router = useRouter();
  const [questions, setQuestions] = useState(initial);
  const [pendingId, setPendingId] = useState<string | null>(null);

  async function decide(id: string, decision: "APPROVED" | "REJECTED") {
    setPendingId(id);
    try {
      await apiPatch(`/api/admin/questions/${id}/review`, { decision });
      setQuestions((current) => current.filter((question) => question.id !== id));
      toast.success(
        decision === "APPROVED"
          ? "Approved — students can see it now."
          : "Rejected. It stays out of the question bank.",
      );
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setPendingId(null);
    }
  }

  if (questions.length === 0) {
    return (
      <EmptyState
        icon={CheckCircle2}
        title="Nothing waiting for review"
        description="Generated questions appear here before students can see them."
      />
    );
  }

  return (
    <ul className="space-y-4">
      {questions.map((question) => (
        <li key={question.id} className="rounded-lg border p-4">
          <div className="flex flex-wrap items-center gap-2">
            <DifficultyBadge difficulty={question.difficulty} />
            <Badge variant="secondary">{humanizeEnum(question.category)}</Badge>
            <Badge variant="outline">{question.topic}</Badge>
            <Badge variant="outline">{humanizeEnum(question.type)}</Badge>
            {question.qualityScore !== null && (
              <Badge
                variant="outline"
                className={cn(
                  question.qualityScore >= 85
                    ? "border-success/40 text-success"
                    : "border-warning/40 text-warning-foreground",
                )}
              >
                quality {question.qualityScore}
              </Badge>
            )}
          </div>

          <p className="mt-3 text-pretty text-sm font-medium">{question.text}</p>

          {question.options.length > 0 && (
            <ul className="mt-3 space-y-1.5">
              {question.options.map((option) => (
                <li
                  key={option.id}
                  className={cn(
                    "flex items-start gap-2 rounded-md border px-3 py-2 text-sm",
                    option.isCorrect && "border-success/40 bg-success/10",
                  )}
                >
                  {option.isCorrect ? (
                    <Check
                      className="mt-0.5 h-4 w-4 shrink-0 text-success"
                      aria-label="Correct answer"
                    />
                  ) : (
                    <span className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  )}
                  <span className="text-pretty">{option.text}</span>
                </li>
              ))}
            </ul>
          )}

          {question.expectedAnswer && (
            <p className="mt-3 text-pretty text-sm">
              <span className="font-medium">Expected answer: </span>
              <span className="text-muted-foreground">
                {question.expectedAnswer}
              </span>
            </p>
          )}

          {question.explanation && (
            <p className="mt-2 text-pretty text-sm text-muted-foreground">
              <span className="font-medium text-foreground">Explanation: </span>
              {question.explanation}
            </p>
          )}

          <div className="mt-4 flex gap-2">
            <Button
              size="sm"
              disabled={pendingId === question.id}
              onClick={() => void decide(question.id, "APPROVED")}
            >
              {pendingId === question.id ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Check className="h-4 w-4" aria-hidden="true" />
              )}
              Approve
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={pendingId === question.id}
              onClick={() => void decide(question.id, "REJECTED")}
            >
              <X className="h-4 w-4" aria-hidden="true" />
              Reject
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}
