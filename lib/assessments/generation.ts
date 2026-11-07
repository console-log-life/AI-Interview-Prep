import "server-only";
import type { Difficulty, QuestionCategory, QuestionType } from "@prisma/client";

import { getAIService } from "@/lib/ai";
import { setAiUsageUser } from "@/lib/ai/observability";
import { prisma } from "@/lib/db/prisma";
import { resolveSkillKey } from "@/lib/skills/graph";
import {
  validateBatch,
  type CandidateQuestion,
} from "@/lib/assessments/question-quality";

/**
 * AI question generation.
 *
 * The pipeline is deliberately strict:
 *
 *   AI → JSON Schema → Zod → business rules → duplicate check → DB
 *
 * Anything that fails any stage is reported back to the admin with the reason,
 * and is never written. Generated questions land as PENDING when review mode
 * is on, so nothing an AI wrote reaches students unreviewed by default.
 */

export type GenerationResult = {
  requested: number;
  accepted: number;
  rejected: number;
  createdIds: string[];
  rejections: Array<{ text: string; reasons: string[] }>;
};

export async function generateQuestions(args: {
  adminId: string;
  category: QuestionCategory;
  topic: string;
  difficulty: Difficulty;
  count: number;
  types: QuestionType[];
  targetRole?: string;
  experienceLevel?: "FRESHER" | "JUNIOR" | "MID" | "SENIOR";
  /** When true (default) questions are stored PENDING, not live. */
  requireReview?: boolean;
}): Promise<GenerationResult> {
  setAiUsageUser(args.adminId);

  // Pull existing questions in the same topic so the model can avoid them AND
  // so the duplicate check has something real to compare against.
  const existing = await prisma.question.findMany({
    where: {
      category: args.category,
      OR: [
        { topic: { contains: args.topic, mode: "insensitive" } },
        { topic: args.topic },
      ],
    },
    select: { text: true },
    take: 120,
  });
  const existingTexts = existing.map((row) => row.text);

  const ai = getAIService();
  const generated = await ai.generateQuestions({
    category: args.category,
    topic: args.topic,
    difficulty: args.difficulty,
    count: args.count,
    types: args.types,
    targetRole: args.targetRole ?? "Software Engineer",
    experienceLevel: args.experienceLevel ?? "FRESHER",
    avoidTexts: existingTexts.slice(0, 25),
  });

  const candidates: CandidateQuestion[] = generated.map((item) => ({
    text: item.text,
    type: item.type,
    topic: item.topic,
    difficulty: item.difficulty,
    options: item.options,
    expectedAnswer: item.expectedAnswer,
    explanation: item.explanation,
  }));

  const { accepted, rejected } = validateBatch(candidates, existingTexts);

  const requireReview = args.requireReview ?? true;
  const createdIds: string[] = [];

  for (const entry of accepted) {
    const source = generated.find((item) => item.text === entry.question.text);
    const created = await prisma.question.create({
      data: {
        text: entry.question.text,
        category: args.category,
        topic: entry.question.topic || args.topic,
        subtopic: source?.subtopic || null,
        skillKey: resolveSkillKey(
          entry.question.topic || args.topic,
          args.category,
        ),
        difficulty: entry.question.difficulty,
        type: entry.question.type,
        expectedAnswer: entry.question.expectedAnswer || null,
        explanation: entry.question.explanation,
        skillsTested: source?.skillsTested ?? [],
        tags: ["ai-generated"],
        estimatedTimeSec: source?.estimatedTimeSec ?? 60,
        cognitiveLevel: source?.cognitiveLevel ?? "UNDERSTAND",
        qualityScore: entry.quality.score,
        isAiGenerated: true,
        reviewStatus: requireReview ? "PENDING" : "APPROVED",
        // PENDING questions must never be served to students.
        isActive: !requireReview,
        dedupeHash: entry.quality.dedupeHash,
        authorId: args.adminId,
        options: {
          create: entry.question.options.map((option, index) => ({
            text: option.text,
            isCorrect: option.isCorrect,
            order: index,
          })),
        },
      },
      select: { id: true },
    });
    createdIds.push(created.id);
  }

  return {
    requested: args.count,
    accepted: accepted.length,
    rejected: rejected.length,
    createdIds,
    rejections: rejected.map((entry) => ({
      text: entry.question.text.slice(0, 160),
      reasons: entry.quality.issues
        .filter((issue) => issue.severity === "error")
        .map((issue) => issue.message),
    })),
  };
}

export async function listPendingQuestions(page = 1, pageSize = 20) {
  const [items, total] = await Promise.all([
    prisma.question.findMany({
      where: { reviewStatus: "PENDING" },
      include: { options: { orderBy: { order: "asc" } } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.question.count({ where: { reviewStatus: "PENDING" } }),
  ]);

  return {
    items,
    total,
    page,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

/** Approving a question is what makes it visible to students. */
export async function reviewQuestion(
  questionId: string,
  decision: "APPROVED" | "REJECTED",
) {
  return prisma.question.update({
    where: { id: questionId },
    data: {
      reviewStatus: decision,
      isActive: decision === "APPROVED",
    },
    select: { id: true, reviewStatus: true, isActive: true },
  });
}
