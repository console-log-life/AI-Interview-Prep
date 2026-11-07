"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  Check,
  ChevronLeft,
  ChevronRight,
  CloudOff,
  Loader2,
  Send,
} from "lucide-react";
import { toast } from "sonner";

import { AssessmentTimer } from "@/components/assessment/assessment-timer";
import { QuestionCard } from "@/components/assessment/question-card";
import { QuestionNavigation } from "@/components/assessment/question-navigation";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { useAssessment, type AttemptQuestion } from "@/hooks/use-assessment";
import { apiPost, errorMessage } from "@/lib/api/client";

type AssessmentRunnerProps = {
  attemptId: string;
  title: string;
  durationMin: number;
  secondsRemaining: number;
  questions: AttemptQuestion[];
};

export function AssessmentRunner({
  attemptId,
  title,
  durationMin,
  secondsRemaining,
  questions,
}: AssessmentRunnerProps) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const submittedRef = useRef(false);

  const {
    current,
    setCurrent,
    answers,
    updateAnswer,
    secondsLeft,
    saveState,
    saveError,
    answeredCount,
    markedCount,
    buildSubmitPayload,
  } = useAssessment({
    attemptId,
    questions,
    initialSecondsRemaining: secondsRemaining,
  });

  const submit = useCallback(
    async (autoSubmitted: boolean) => {
      // Guard against a double-click racing the auto-submit.
      if (submittedRef.current) return;
      submittedRef.current = true;

      setSubmitting(true);
      setSubmitError(null);
      try {
        await apiPost(`/api/assessments/attempts/${attemptId}/submit`, {
          ...buildSubmitPayload(),
          autoSubmitted,
        });
        router.push(`/assessments/${attemptId}/result`);
      } catch (error) {
        submittedRef.current = false;
        setSubmitting(false);
        setConfirmOpen(false);
        setSubmitError(errorMessage(error));
        toast.error(errorMessage(error));
      }
    },
    [attemptId, buildSubmitPayload, router],
  );

  // Auto-submit at zero — the server treats this as an expiry, not a cheat.
  useEffect(() => {
    if (secondsLeft > 0 || submittedRef.current) return;
    toast.info("Time is up — submitting your answers.");
    void submit(true);
  }, [secondsLeft, submit]);

  const question = questions[current];
  const progress = (answeredCount / questions.length) * 100;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold tracking-tight">
            {title}
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {answeredCount} of {questions.length} answered
            {markedCount > 0 && ` · ${markedCount} marked for review`}
          </p>
        </div>
        <AssessmentTimer
          secondsLeft={secondsLeft}
          totalSeconds={durationMin * 60}
        />
      </div>

      <Progress
        value={progress}
        aria-label={`${answeredCount} of ${questions.length} questions answered`}
      />

      {saveState === "error" && (
        <Alert variant="destructive">
          <CloudOff aria-hidden="true" />
          <AlertDescription>
            {saveError ??
              "We couldn't save your last answer. Check your connection — your other answers are safe."}
          </AlertDescription>
        </Alert>
      )}

      {submitError && (
        <Alert variant="destructive">
          <AlertCircle aria-hidden="true" />
          <AlertDescription>{submitError}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_260px]">
        <div className="space-y-4">
          {question && (
            <QuestionCard
              question={question}
              total={questions.length}
              answer={
                answers[question.id] ?? {
                  selectedOptions: [],
                  textAnswer: "",
                  markedForReview: false,
                }
              }
              onChange={(patch) => updateAnswer(question.id, patch)}
            />
          )}

          <div className="flex items-center justify-between gap-3">
            <Button
              variant="outline"
              onClick={() => setCurrent(Math.max(0, current - 1))}
              disabled={current === 0}
            >
              <ChevronLeft aria-hidden="true" />
              Previous
            </Button>

            <p
              className="text-xs text-muted-foreground"
              aria-live="polite"
              role="status"
            >
              {saveState === "saving" && (
                <span className="flex items-center gap-1.5">
                  <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                  Saving…
                </span>
              )}
              {saveState === "saved" && (
                <span className="flex items-center gap-1.5">
                  <Check className="h-3 w-3" aria-hidden="true" />
                  All answers saved
                </span>
              )}
            </p>

            {current === questions.length - 1 ? (
              <Button onClick={() => setConfirmOpen(true)} loading={submitting}>
                <Send aria-hidden="true" />
                Submit
              </Button>
            ) : (
              <Button
                onClick={() =>
                  setCurrent(Math.min(questions.length - 1, current + 1))
                }
              >
                Next
                <ChevronRight aria-hidden="true" />
              </Button>
            )}
          </div>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Questions</CardTitle>
            </CardHeader>
            <CardContent>
              <QuestionNavigation
                questions={questions}
                answers={answers}
                current={current}
                onSelect={setCurrent}
              />
              <Button
                className="mt-5 w-full"
                onClick={() => setConfirmOpen(true)}
                loading={submitting}
              >
                <Send aria-hidden="true" />
                Submit assessment
              </Button>
            </CardContent>
          </Card>
        </aside>
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Submit this assessment?</DialogTitle>
            <DialogDescription>
              {answeredCount < questions.length ? (
                <>
                  You have answered {answeredCount} of {questions.length}{" "}
                  questions. Unanswered questions score zero. This cannot be
                  undone.
                </>
              ) : (
                <>
                  You have answered all {questions.length} questions. This cannot
                  be undone.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Keep working
            </Button>
            <Button onClick={() => submit(false)} loading={submitting}>
              Submit now
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
