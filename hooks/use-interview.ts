"use client";

import { useCallback, useState } from "react";

import { apiPost, errorMessage } from "@/lib/api/client";
import type { AnswerEvaluation } from "@/types/ai";
import type { InterviewMessageDTO } from "@/types/interview";

type UseInterviewArgs = {
  interviewId: string;
  initialMessages: InterviewMessageDTO[];
  plannedQuestions: number;
};

type MessageResponse = {
  evaluation: AnswerEvaluation;
  nextQuestion: {
    id: string;
    content: string;
    topic: string;
    isFollowUp: boolean;
  } | null;
  finished: boolean;
  questionsAsked: number;
  plannedQuestions: number;
};

/**
 * Client state for a live interview.
 *
 * The server is the source of truth — this hook only mirrors it optimistically
 * so the candidate's answer appears instantly. On error the optimistic message
 * is rolled back and the text is restored to the composer, so nothing typed is
 * ever lost to a failed request.
 */
export function useInterview({
  interviewId,
  initialMessages,
  plannedQuestions,
}: UseInterviewArgs) {
  const [messages, setMessages] = useState<InterviewMessageDTO[]>(initialMessages);
  const [evaluations, setEvaluations] = useState<
    Record<string, AnswerEvaluation>
  >({});
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [finished, setFinished] = useState(false);
  const [restoredDraft, setRestoredDraft] = useState<string | null>(null);

  const questionsAsked = messages.filter((message) => message.isQuestion).length;
  const answersGiven = messages.filter(
    (message) => message.role === "CANDIDATE",
  ).length;

  const awaitingAnswer =
    !finished && questionsAsked > 0 && answersGiven < questionsAsked;

  const sendAnswer = useCallback(
    async (answer: string) => {
      const trimmed = answer.trim();
      if (!trimmed || sending) return;

      setSending(true);
      setError(null);
      setRestoredDraft(null);

      const optimisticId = `optimistic-${Date.now()}`;
      const optimistic: InterviewMessageDTO = {
        id: optimisticId,
        role: "CANDIDATE",
        content: trimmed,
        order: messages.length,
        isQuestion: false,
        isFollowUp: false,
        topic: null,
        createdAt: new Date().toISOString(),
      };
      setMessages((previous) => [...previous, optimistic]);

      try {
        const result = await apiPost<MessageResponse>(
          `/api/interviews/${interviewId}/message`,
          { answer: trimmed },
        );

        setEvaluations((previous) => ({
          ...previous,
          [optimisticId]: result.evaluation,
        }));

        if (result.nextQuestion) {
          setMessages((previous) => [
            ...previous,
            {
              id: result.nextQuestion!.id,
              role: "INTERVIEWER",
              content: result.nextQuestion!.content,
              order: previous.length,
              isQuestion: true,
              isFollowUp: result.nextQuestion!.isFollowUp,
              topic: result.nextQuestion!.topic,
              createdAt: new Date().toISOString(),
            },
          ]);
        }

        if (result.finished) setFinished(true);
      } catch (caught) {
        // Roll the optimistic message back and hand the text to the composer.
        setMessages((previous) =>
          previous.filter((message) => message.id !== optimisticId),
        );
        setRestoredDraft(trimmed);
        setError(errorMessage(caught));
      } finally {
        setSending(false);
      }
    },
    [interviewId, messages.length, sending],
  );

  const clearError = useCallback(() => setError(null), []);

  return {
    messages,
    evaluations,
    sending,
    error,
    clearError,
    finished,
    awaitingAnswer,
    questionsAsked,
    answersGiven,
    plannedQuestions,
    restoredDraft,
    sendAnswer,
  };
}
