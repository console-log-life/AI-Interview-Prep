import "server-only";
import type { Difficulty, Prisma, QuestionCategory } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import type { QuestionUpsertInput } from "@/lib/validation/assessment";

export type QuestionListFilters = {
  category?: QuestionCategory;
  difficulty?: Difficulty;
  type?: Prisma.QuestionWhereInput["type"];
  search?: string;
  isActive?: boolean;
  page?: number;
  pageSize?: number;
};

/** Paginated question list for the admin bank. Never returns everything. */
export async function listQuestions(filters: QuestionListFilters) {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? 20));

  const where: Prisma.QuestionWhereInput = {
    ...(filters.category ? { category: filters.category } : {}),
    ...(filters.difficulty ? { difficulty: filters.difficulty } : {}),
    ...(filters.type ? { type: filters.type } : {}),
    ...(filters.isActive !== undefined ? { isActive: filters.isActive } : {}),
    ...(filters.search
      ? {
          OR: [
            { text: { contains: filters.search, mode: "insensitive" } },
            { topic: { contains: filters.search, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.question.findMany({
      where,
      include: { options: { orderBy: { order: "asc" } } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.question.count({ where }),
  ]);

  return {
    items,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function getQuestion(id: string) {
  return prisma.question.findUnique({
    where: { id },
    include: { options: { orderBy: { order: "asc" } } },
  });
}

export async function createQuestion(
  input: QuestionUpsertInput,
  authorId: string,
) {
  return prisma.question.create({
    data: {
      text: input.text,
      category: input.category,
      topic: input.topic,
      difficulty: input.difficulty,
      type: input.type,
      expectedAnswer: input.expectedAnswer || null,
      explanation: input.explanation || null,
      skillsTested: input.skillsTested,
      tags: input.tags,
      points: input.points,
      isActive: input.isActive,
      authorId,
      options: {
        create: input.options.map((option, index) => ({
          text: option.text,
          isCorrect: option.isCorrect,
          order: index,
        })),
      },
    },
    include: { options: true },
  });
}

/**
 * Replaces a question and its options.
 *
 * Options are deleted and recreated rather than diffed: option ids are
 * referenced by in-flight `AssessmentAnswer` rows, and a full replace inside a
 * transaction is simpler to reason about than a partial merge.
 */
export async function updateQuestion(id: string, input: QuestionUpsertInput) {
  return prisma.$transaction(async (tx) => {
    await tx.questionOption.deleteMany({ where: { questionId: id } });
    return tx.question.update({
      where: { id },
      data: {
        text: input.text,
        category: input.category,
        topic: input.topic,
        difficulty: input.difficulty,
        type: input.type,
        expectedAnswer: input.expectedAnswer || null,
        explanation: input.explanation || null,
        skillsTested: input.skillsTested,
        tags: input.tags,
        points: input.points,
        isActive: input.isActive,
        options: {
          create: input.options.map((option, index) => ({
            text: option.text,
            isCorrect: option.isCorrect,
            order: index,
          })),
        },
      },
      include: { options: true },
    });
  });
}

export async function deleteQuestion(id: string) {
  return prisma.question.delete({ where: { id } });
}

/** Distinct topics per category — powers filter dropdowns. */
export async function listTopics(category?: QuestionCategory) {
  const rows = await prisma.question.findMany({
    where: { isActive: true, ...(category ? { category } : {}) },
    select: { topic: true },
    distinct: ["topic"],
    orderBy: { topic: "asc" },
  });
  return rows.map((row) => row.topic);
}

/**
 * Picks a random set of active questions for an ad-hoc practice assessment.
 *
 * Uses `ORDER BY random()` in SQL rather than pulling every matching row into
 * memory and shuffling — the bank is expected to grow.
 */
export async function pickRandomQuestions(args: {
  category: QuestionCategory;
  difficulty?: Difficulty;
  count: number;
}) {
  const ids = args.difficulty
    ? await prisma.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM "Question"
        WHERE "isActive" = true
          AND "category" = ${args.category}::"QuestionCategory"
          AND "difficulty" = ${args.difficulty}::"Difficulty"
          AND "type" IN ('MCQ', 'MULTI_SELECT', 'TRUE_FALSE')
        ORDER BY random()
        LIMIT ${args.count}
      `
    : await prisma.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM "Question"
        WHERE "isActive" = true
          AND "category" = ${args.category}::"QuestionCategory"
          AND "type" IN ('MCQ', 'MULTI_SELECT', 'TRUE_FALSE')
        ORDER BY random()
        LIMIT ${args.count}
      `;

  if (ids.length === 0) return [];

  const questions = await prisma.question.findMany({
    where: { id: { in: ids.map((row) => row.id) } },
    include: { options: { orderBy: { order: "asc" } } },
  });

  // Preserve the random order returned by the query.
  const order = new Map(ids.map((row, index) => [row.id, index]));
  return questions.sort(
    (a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0),
  );
}
