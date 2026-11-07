"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { apiPost, errorMessage } from "@/lib/api/client";

export type AttemptQuestion = {
  index: number;
  id: string;
  text: string;
  type: string;
  topic: string;
  difficulty: string;
  points: number;
  options: Array<{ id: string; text: string }>;
  savedSelection: string[];
  savedText: string;
  markedForReview: boolean;
};

export type AnswerState = {
  selectedOptions: string[];
  textAnswer: string;
  markedForReview: boolean;
};

type UseAssessmentArgs = {
  attemptId: string;
  questions: AttemptQuestion[];
  initialSecondsRemaining: number;
};

const AUTOSAVE_DEBOUNCE_MS = 700;

/**
 * Client state for a running attempt.
 *
 * Responsibilities:
 *  - hold answers in memory for instant UI feedback
 *  - debounce-autosave each change to the server so a crash loses nothing
 *  - run the visible countdown and fire auto-submit at zero
 *
 * The countdown here is presentation only. The server re-checks `expiresAt`
 * on submit, so pausing JavaScript buys the candidate nothing.
 */
export function useAssessment({
  attemptId,
  questions,
  initialSecondsRemaining,
}: UseAssessmentArgs) {
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState<Record<string, AnswerState>>(() => {
    const initial: Record<string, AnswerState> = {};
    for (const question of questions) {
      initial[question.id] = {
        selectedOptions: question.savedSelection,
        textAnswer: question.savedText,
        markedForReview: question.markedForReview,
      };
    }
    return initial;
  });

  const [secondsLeft, setSecondsLeft] = useState(initialSecondsRemaining);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  );
  const [saveError, setSaveError] = useState<string | null>(null);

  const startedAt = useRef(Date.now());
  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const answersRef = useRef(answers);
  answersRef.current = answers;

  const persist = useCallback(
    async (questionId: string, state: AnswerState) => {
      setSaveState("saving");
      try {
        await apiPost(`/api/assessments/attempts/${attemptId}/answer`, {
          questionId,
          selectedOptions: state.selectedOptions,
          textAnswer: state.textAnswer,
          markedForReview: state.markedForReview,
          timeSpentSec: Math.floor((Date.now() - startedAt.current) / 1000),
        });
        setSaveState("saved");
        setSaveError(null);
      } catch (error) {
        setSaveState("error");
        setSaveError(errorMessage(error));
      }
    },
    [attemptId],
  );

  const updateAnswer = useCallback(
    (questionId: string, patch: Partial<AnswerState>) => {
      setAnswers((previous) => {
        const next = {
          ...previous,
          [questionId]: {
            ...(previous[questionId] ?? {
              selectedOptions: [],
              textAnswer: "",
              markedForReview: false,
            }),
            ...patch,
          },
        };

        // Debounce so typing in a short-answer box does not spam the API.
        clearTimeout(saveTimers.current[questionId]);
        saveTimers.current[questionId] = setTimeout(() => {
          void persist(questionId, next[questionId]);
        }, AUTOSAVE_DEBOUNCE_MS);

        return next;
      });
    },
    [persist],
  );

  // Countdown.
  useEffect(() => {
    if (secondsLeft <= 0) return;
    const id = setInterval(() => {
      setSecondsLeft((value) => Math.max(0, value - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [secondsLeft]);

  // Flush any pending autosave when the tab is hidden or closed.
  useEffect(() => {
    // Captured once so the cleanup clears the same map the effect registered
    // against, even if the ref is reassigned in between.
    const timers = saveTimers.current;
    const flush = () => {
      for (const [questionId, timer] of Object.entries(timers)) {
        clearTimeout(timer);
        void persist(questionId, answersRef.current[questionId]);
      }
    };
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      for (const timer of Object.values(timers)) clearTimeout(timer);
    };
  }, [persist]);

  const answeredCount = questions.filter((question) => {
    const answer = answers[question.id];
    return (
      (answer?.selectedOptions.length ?? 0) > 0 ||
      Boolean(answer?.textAnswer?.trim())
    );
  }).length;

  const markedCount = questions.filter(
    (question) => answers[question.id]?.markedForReview,
  ).length;

  const buildSubmitPayload = useCallback(
    () => ({
      answers: questions.map((question) => ({
        questionId: question.id,
        selectedOptions: answersRef.current[question.id]?.selectedOptions ?? [],
        textAnswer: answersRef.current[question.id]?.textAnswer ?? "",
        markedForReview:
          answersRef.current[question.id]?.markedForReview ?? false,
        timeSpentSec: 0,
      })),
      timeSpentSec: Math.floor((Date.now() - startedAt.current) / 1000),
    }),
    [questions],
  );

  return {
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
  };
}
