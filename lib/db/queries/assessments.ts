import "server-only";
import type { Difficulty, Prisma, QuestionCategory } from "@prisma/client";

import { ConflictError, NotFoundError, ValidationError } from "@/lib/api/errors";
import { prisma } from "@/lib/db/prisma";
import { pickRandomQuestions } from "@/lib/db/queries/questions";
import {
  isAttemptExpired,
  scoreAttempt,
  secondsRemaining,
  type ScorableQuestion,
  type SubmittedAnswer,
} from "@/lib/assessments/scoring";
import { recordActivity, recordTopicPerformance, writeProgressSnapshot } from "@/lib/progress/service";
import { evaluateAchievements } from "@/lib/recommendations/achievements";
import { refreshRecommendations } from "@/lib/recommendations/service";
import type {
  SaveAnswerInput,
  StartAssessmentInput,
  SubmitAssessmentInput,
} from "@/lib/validation/assessment";

export async function listAssessments(filters: {
  category?: QuestionCategory;
  difficulty?: Difficulty;
  search?: string;
  page?: number;
  pageSize?: number;
  includeUnpublished?: boolean;
}) {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(50, Math.max(1, filters.pageSize ?? 12));

  const where: Prisma.AssessmentWhereInput = {
    ...(filters.includeUnpublished ? {} : { isPublished: true }),
    ...(filters.category ? { category: filters.category } : {}),
    ...(filters.difficulty ? { difficulty: filters.difficulty } : {}),
    ...(filters.search
      ? { title: { contains: filters.search, mode: "insensitive" } }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.assessment.findMany({
      where,
      include: { _count: { select: { questions: true, attempts: true } } },
      orderBy: [{ category: "asc" }, { difficulty: "asc" }, { title: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.assessment.count({ where }),
  ]);

  return {
    items,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

/**
 * Starts (or resumes) an attempt.
 *
 * Resuming is the important half: if the browser is refreshed or closed, the
 * user comes back to the SAME attempt row with their saved answers and the
 * original server-side deadline — no progress lost, and no way to reset the
 * timer by reloading.
 */
export async function startOrResumeAttempt(
  userId: string,
  assessmentId: string,
) {
  const assessment = await prisma.assessment.findUnique({
    where: { id: assessmentId },
    include: { _count: { select: { questions: true } } },
  });

  if (!assessment || !assessment.isPublished) {
    throw new NotFoundError("That assessment is not available.");
  }
  if (assessment._count.questions === 0) {
    throw new ValidationError("That assessment has no questions yet.");
  }

  const existing = await prisma.assessmentAttempt.findFirst({
    where: { userId, assessmentId, status: "IN_PROGRESS" },
    orderBy: { startedAt: "desc" },
  });

  if (existing) {
    if (isAttemptExpired(existing.expiresAt)) {
      // The window closed while they were away — grade what they had saved.
      await submitAttempt(userId, existing.id, {
        answers: [],
        timeSpentSec: assessment.durationMin * 60,
        autoSubmitted: true,
      });
      throw new ConflictError(
        "Your previous attempt ran out of time and has been submitted automatically.",
      );
    }
    return existing;
  }

  const expiresAt = new Date(Date.now() + assessment.durationMin * 60_000);
  return prisma.assessmentAttempt.create({
    data: { userId, assessmentId, expiresAt },
  });
}

/** Everything the attempt screen needs, with correct answers stripped out. */
export async function getAttemptForTaking(userId: string, attemptId: string) {
  const attempt = await prisma.assessmentAttempt.findFirst({
    where: { id: attemptId, userId },
    include: {
      assessment: {
        include: {
          questions: {
            orderBy: { order: "asc" },
            include: {
              question: {
                include: { options: { orderBy: { order: "asc" } } },
              },
            },
          },
        },
      },
      answers: true,
    },
  });

  if (!attempt) throw new NotFoundError("We could not find that attempt.");

  const answerMap = new Map(
    attempt.answers.map((answer) => [answer.questionId, answer]),
  );

  return {
    attemptId: attempt.id,
    status: attempt.status,
    title: attempt.assessment.title,
    category: attempt.assessment.category,
    difficulty: attempt.assessment.difficulty,
    durationMin: attempt.assessment.durationMin,
    expiresAt: attempt.expiresAt.toISOString(),
    secondsRemaining: secondsRemaining(attempt.expiresAt),
    questions: attempt.assessment.questions.map((link, index) => {
      const saved = answerMap.get(link.questionId);
      return {
        index,
        id: link.question.id,
        text: link.question.text,
        type: link.question.type,
        topic: link.question.topic,
        difficulty: link.question.difficulty,
        points: link.question.points,
        // SECURITY: `isCorrect` is deliberately NOT selected here. Correct
        // answers only ever leave the server after the attempt is submitted.
        options: link.question.options.map((option) => ({
          id: option.id,
          text: option.text,
        })),
        savedSelection: saved?.selectedOptions ?? [],
        savedText: saved?.textAnswer ?? "",
        markedForReview: saved?.markedForReview ?? false,
      };
    }),
  };
}

/** Autosave — called as the user works so a crash never loses answers. */
export async function saveAnswer(
  userId: string,
  attemptId: string,
  input: SaveAnswerInput,
) {
  const attempt = await prisma.assessmentAttempt.findFirst({
    where: { id: attemptId, userId },
    select: { id: true, status: true, expiresAt: true, assessmentId: true },
  });
  if (!attempt) throw new NotFoundError("We could not find that attempt.");
  if (attempt.status !== "IN_PROGRESS") {
    throw new ConflictError("This attempt has already been submitted.");
  }
  if (isAttemptExpired(attempt.expiresAt)) {
    throw new ConflictError("Time is up for this attempt.");
  }

  // The question must actually belong to this assessment.
  const belongs = await prisma.assessmentQuestion.findFirst({
    where: { assessmentId: attempt.assessmentId, questionId: input.questionId },
    select: { id: true },
  });
  if (!belongs) throw new ValidationError("That question is not in this assessment.");

  await prisma.assessmentAnswer.upsert({
    where: {
      attemptId_questionId: { attemptId, questionId: input.questionId },
    },
    create: {
      attemptId,
      questionId: input.questionId,
      selectedOptions: input.selectedOptions,
      textAnswer: input.textAnswer || null,
      markedForReview: input.markedForReview,
      timeSpentSec: input.timeSpentSec,
    },
    update: {
      selectedOptions: input.selectedOptions,
      textAnswer: input.textAnswer || null,
      markedForReview: input.markedForReview,
      timeSpentSec: input.timeSpentSec,
    },
  });

  return { saved: true };
}

/**
 * Grades and closes an attempt.
 *
 * The status flip to SUBMITTED happens inside the same transaction as the
 * grading, and only `where: { status: "IN_PROGRESS" }` — so a double-click or
 * a replayed request can never produce two scores for one attempt.
 */
export async function submitAttempt(
  userId: string,
  attemptId: string,
  input: SubmitAssessmentInput,
) {
  const attempt = await prisma.assessmentAttempt.findFirst({
    where: { id: attemptId, userId },
    include: {
      assessment: {
        include: {
          questions: {
            include: {
              question: { include: { options: true } },
            },
          },
        },
      },
      answers: true,
    },
  });

  if (!attempt) throw new NotFoundError("We could not find that attempt.");
  if (attempt.status !== "IN_PROGRESS") {
    throw new ConflictError("This attempt has already been submitted.");
  }

  // Flush any answers the client sent with the submit.
  for (const answer of input.answers) {
    const belongs = attempt.assessment.questions.some(
      (link) => link.questionId === answer.questionId,
    );
    if (!belongs) continue;
    await prisma.assessmentAnswer.upsert({
      where: {
        attemptId_questionId: { attemptId, questionId: answer.questionId },
      },
      create: {
        attemptId,
        questionId: answer.questionId,
        selectedOptions: answer.selectedOptions,
        textAnswer: answer.textAnswer || null,
        markedForReview: answer.markedForReview,
        timeSpentSec: answer.timeSpentSec,
      },
      update: {
        selectedOptions: answer.selectedOptions,
        textAnswer: answer.textAnswer || null,
        markedForReview: answer.markedForReview,
        timeSpentSec: answer.timeSpentSec,
      },
    });
  }

  const storedAnswers = await prisma.assessmentAnswer.findMany({
    where: { attemptId },
  });

  const scorable: ScorableQuestion[] = attempt.assessment.questions.map(
    (link) => ({
      id: link.question.id,
      type: link.question.type,
      points: link.question.points,
      topic: link.question.topic,
      difficulty: link.question.difficulty,
      correctOptionIds: link.question.options
        .filter((option) => option.isCorrect)
        .map((option) => option.id),
    }),
  );

  const submitted: SubmittedAnswer[] = storedAnswers.map((answer) => ({
    questionId: answer.questionId,
    selectedOptions: answer.selectedOptions,
    textAnswer: answer.textAnswer,
  }));

  const result = scoreAttempt(
    scorable,
    submitted,
    attempt.assessment.passPercentage,
  );

  const expired = isAttemptExpired(attempt.expiresAt);
  const timeSpentSec = Math.min(
    input.timeSpentSec || 0,
    attempt.assessment.durationMin * 60,
  );

  const updated = await prisma.$transaction(async (tx) => {
    // Optimistic guard: only the first submit for an IN_PROGRESS attempt wins.
    const claim = await tx.assessmentAttempt.updateMany({
      where: { id: attemptId, status: "IN_PROGRESS" },
      data: {
        status: expired || input.autoSubmitted ? "EXPIRED" : "SUBMITTED",
        submittedAt: new Date(),
        score: result.score,
        maxScore: result.maxScore,
        percentage: result.percentage,
        correctCount: result.correctCount,
        incorrectCount: result.incorrectCount,
        unansweredCount: result.unansweredCount,
        timeSpentSec,
        passed: result.passed,
        breakdown: {
          byTopic: result.byTopic,
          byDifficulty: result.byDifficulty,
        },
      },
    });

    if (claim.count === 0) {
      throw new ConflictError("This attempt has already been submitted.");
    }

    // Persist the per-answer grades.
    for (const graded of result.graded) {
      await tx.assessmentAnswer.updateMany({
        where: { attemptId, questionId: graded.questionId },
        data: {
          isCorrect: graded.isCorrect,
          pointsAwarded: graded.pointsAwarded,
        },
      });
    }

    return tx.assessmentAttempt.findUniqueOrThrow({ where: { id: attemptId } });
  });

  // An expired attempt is still real practice — it counts for the same
  // downstream signals as a normal submit.
  await recordTopicPerformance(
    userId,
    result.byTopic.map((topic) => ({
      topic: topic.topic,
      category: attempt.assessment.category,
      score: topic.percentage,
    })),
  );
  await recordActivity(userId, "ASSESSMENT");
  await writeProgressSnapshot(userId);
  const unlocked = await evaluateAchievements(userId);
  await refreshRecommendations(userId);

  return { attempt: updated, result, unlocked };
}

/** Post-submission result view — correct answers and explanations included. */
export async function getAttemptResult(userId: string, attemptId: string) {
  const attempt = await prisma.assessmentAttempt.findFirst({
    where: { id: attemptId, userId },
    include: {
      assessment: {
        include: {
          questions: {
            orderBy: { order: "asc" },
            include: {
              question: { include: { options: { orderBy: { order: "asc" } } } },
            },
          },
        },
      },
      answers: true,
    },
  });

  if (!attempt) throw new NotFoundError("We could not find that result.");
  if (attempt.status === "IN_PROGRESS") {
    throw new ConflictError("That attempt has not been submitted yet.");
  }

  const answerMap = new Map(
    attempt.answers.map((answer) => [answer.questionId, answer]),
  );

  return {
    id: attempt.id,
    title: attempt.assessment.title,
    category: attempt.assessment.category,
    difficulty: attempt.assessment.difficulty,
    passPercentage: attempt.assessment.passPercentage,
    submittedAt: attempt.submittedAt,
    score: attempt.score,
    maxScore: attempt.maxScore,
    percentage: attempt.percentage,
    correctCount: attempt.correctCount,
    incorrectCount: attempt.incorrectCount,
    unansweredCount: attempt.unansweredCount,
    timeSpentSec: attempt.timeSpentSec,
    passed: attempt.passed,
    status: attempt.status,
    breakdown: attempt.breakdown as {
      byTopic?: Array<{ topic: string; correct: number; total: number; percentage: number }>;
      byDifficulty?: Array<{ difficulty: string; correct: number; total: number; percentage: number }>;
    } | null,
    questions: attempt.assessment.questions.map((link, index) => {
      const answer = answerMap.get(link.questionId);
      return {
        index,
        id: link.question.id,
        text: link.question.text,
        type: link.question.type,
        topic: link.question.topic,
        difficulty: link.question.difficulty,
        explanation: link.question.explanation,
        expectedAnswer: link.question.expectedAnswer,
        options: link.question.options.map((option) => ({
          id: option.id,
          text: option.text,
          isCorrect: option.isCorrect,
        })),
        selectedOptions: answer?.selectedOptions ?? [],
        textAnswer: answer?.textAnswer ?? "",
        isCorrect: answer?.isCorrect ?? null,
        answered:
          (answer?.selectedOptions.length ?? 0) > 0 ||
          Boolean(answer?.textAnswer?.trim()),
      };
    }),
  };
}

/**
 * Builds a one-off practice assessment from the question bank.
 * The generated assessment is unpublished so it never appears in the catalogue.
 */
export async function createPracticeAssessment(
  userId: string,
  input: StartAssessmentInput,
) {
  const questions = await pickRandomQuestions({
    category: input.category,
    difficulty: input.difficulty,
    count: input.questionCount,
  });

  if (questions.length < 3) {
    throw new ValidationError(
      "There are not enough questions in that category yet. Try another category or ask an admin to add more.",
    );
  }

  const difficultyLabel = input.difficulty
    ? `${input.difficulty.charAt(0)}${input.difficulty.slice(1).toLowerCase()}`
    : "Mixed";

  const assessment = await prisma.assessment.create({
    data: {
      title: `${input.category.replace(/_/g, " ")} practice — ${difficultyLabel}`,
      description: `Auto-generated practice set of ${questions.length} questions.`,
      category: input.category,
      difficulty: input.difficulty ?? "MEDIUM",
      durationMin: input.durationMin,
      isPublished: false,
      authorId: userId,
      questions: {
        create: questions.map((question, index) => ({
          questionId: question.id,
          order: index,
        })),
      },
    },
  });

  const expiresAt = new Date(Date.now() + input.durationMin * 60_000);
  return prisma.assessmentAttempt.create({
    data: { userId, assessmentId: assessment.id, expiresAt },
  });
}

export async function listUserAttempts(userId: string, limit = 10) {
  return prisma.assessmentAttempt.findMany({
    where: { userId, status: { in: ["SUBMITTED", "EXPIRED"] } },
    include: { assessment: { select: { title: true, category: true } } },
    orderBy: { submittedAt: "desc" },
    take: limit,
  });
}
