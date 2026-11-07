import "server-only";

import { getAIService } from "@/lib/ai";
import { setAiUsageUser } from "@/lib/ai/observability";
import { NotFoundError } from "@/lib/api/errors";
import { prisma } from "@/lib/db/prisma";
import {
  expectsStarStructure,
  summarizeCommunication,
  type CommunicationSummary,
} from "@/lib/communication/aggregate";

/**
 * Communication coaching.
 *
 * Deliberately opt-in and per-answer. Running it on every turn would double
 * the AI cost of an interview for feedback most candidates only want on the
 * answers they felt shaky about, so the candidate chooses which answer to have
 * coached and an existing analysis is reused rather than regenerated.
 *
 * Ownership is enforced through `evaluation.interview.userId` — the caller
 * supplies an evaluation id, never a user id.
 */

export type CommunicationRowView = {
  evaluationId: string;
  questionText: string;
  topic: string | null;
  clarity: number;
  structure: number;
  conciseness: number;
  technicalExplanation: number;
  starSituation: boolean;
  starTask: boolean;
  starAction: boolean;
  starResult: boolean;
  isBehavioural: boolean;
  observations: string[];
  coaching: string;
};

export async function analyzeAnswerCommunication(args: {
  userId: string;
  evaluationId: string;
}): Promise<CommunicationRowView> {
  const evaluation = await prisma.interviewEvaluation.findFirst({
    where: { id: args.evaluationId, interview: { userId: args.userId } },
    select: {
      id: true,
      interviewId: true,
      questionText: true,
      answerText: true,
      topic: true,
      interview: { select: { type: true } },
      communication: true,
    },
  });

  if (!evaluation) {
    throw new NotFoundError("We could not find that answer.");
  }

  // Already coached — hand back the stored analysis instead of paying again.
  if (evaluation.communication) {
    return toView(evaluation.communication, {
      questionText: evaluation.questionText,
      topic: evaluation.topic,
    });
  }

  const isBehavioural = expectsStarStructure({
    interviewType: evaluation.interview.type,
    topic: evaluation.topic,
  });

  setAiUsageUser(args.userId);
  const ai = getAIService();
  const result = await ai.analyzeCommunication({
    question: evaluation.questionText,
    answer: evaluation.answerText,
    isBehavioural,
  });

  const created = await prisma.communicationAnalysis.create({
    data: {
      evaluationId: evaluation.id,
      interviewId: evaluation.interviewId,
      clarity: Math.round(result.clarity),
      structure: Math.round(result.structure),
      conciseness: Math.round(result.conciseness),
      technicalExplanation: Math.round(result.technicalExplanation),
      // STAR flags are only meaningful when STAR was expected; forcing them
      // false elsewhere stops the aggregate reading a DSA answer as a gap.
      starSituation: isBehavioural && result.starCoverage.situation,
      starTask: isBehavioural && result.starCoverage.task,
      starAction: isBehavioural && result.starCoverage.action,
      starResult: isBehavioural && result.starCoverage.result,
      isBehavioural,
      observations: result.observations,
      coaching: result.coaching,
      modelUsed: ai.model,
    },
  });

  return toView(created, {
    questionText: evaluation.questionText,
    topic: evaluation.topic,
  });
}

export type InterviewCommunication = {
  rows: CommunicationRowView[];
  summary: CommunicationSummary;
  /** Answers that could still be coached, for the "analyse this one" list. */
  pending: Array<{
    evaluationId: string;
    questionText: string;
    topic: string | null;
    score: number;
  }>;
};

export async function getInterviewCommunication(
  userId: string,
  interviewId: string,
): Promise<InterviewCommunication> {
  const interview = await prisma.interview.findFirst({
    where: { id: interviewId, userId },
    select: {
      id: true,
      evaluations: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          questionText: true,
          topic: true,
          score: true,
          communication: true,
        },
      },
    },
  });

  if (!interview) throw new NotFoundError("We could not find that interview.");

  const rows: CommunicationRowView[] = [];
  const pending: InterviewCommunication["pending"] = [];

  for (const evaluation of interview.evaluations) {
    if (evaluation.communication) {
      rows.push(
        toView(evaluation.communication, {
          questionText: evaluation.questionText,
          topic: evaluation.topic,
        }),
      );
    } else {
      pending.push({
        evaluationId: evaluation.id,
        questionText: evaluation.questionText,
        topic: evaluation.topic,
        score: evaluation.score,
      });
    }
  }

  return { rows, summary: summarizeCommunication(rows), pending };
}

function toView(
  row: {
    evaluationId: string;
    clarity: number;
    structure: number;
    conciseness: number;
    technicalExplanation: number;
    starSituation: boolean;
    starTask: boolean;
    starAction: boolean;
    starResult: boolean;
    isBehavioural: boolean;
    observations: string[];
    coaching: string;
  },
  context: { questionText: string; topic: string | null },
): CommunicationRowView {
  return {
    evaluationId: row.evaluationId,
    questionText: context.questionText,
    topic: context.topic,
    clarity: row.clarity,
    structure: row.structure,
    conciseness: row.conciseness,
    technicalExplanation: row.technicalExplanation,
    starSituation: row.starSituation,
    starTask: row.starTask,
    starAction: row.starAction,
    starResult: row.starResult,
    isBehavioural: row.isBehavioural,
    observations: row.observations,
    coaching: row.coaching,
  };
}
