import "server-only";
import type { Prisma } from "@prisma/client";

import { getAIService } from "@/lib/ai";
import { setAiUsageUser } from "@/lib/ai/observability";
import { NotFoundError } from "@/lib/api/errors";
import { buildGrounding } from "@/lib/analytics/service";
import { prisma } from "@/lib/db/prisma";

/**
 * AI coach.
 *
 * Every reply is grounded in `buildGrounding(userId)` — the measured facts
 * about this specific user. The grounding snapshot is stored alongside the
 * reply so an answer can be audited later: you can always see exactly what
 * the coach knew when it said what it said.
 */

/** Turns of history sent to the model — bounds prompt size and cost. */
const HISTORY_WINDOW = 8;

export async function listConversations(userId: string, limit = 20) {
  return prisma.coachConversation.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    take: limit,
    select: {
      id: true,
      title: true,
      updatedAt: true,
      _count: { select: { messages: true } },
    },
  });
}

export async function getConversation(userId: string, conversationId: string) {
  const conversation = await prisma.coachConversation.findFirst({
    where: { id: conversationId, userId },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });
  if (!conversation) throw new NotFoundError("We could not find that conversation.");
  return conversation;
}

export async function createConversation(userId: string) {
  return prisma.coachConversation.create({
    data: { userId },
    select: { id: true },
  });
}

export async function deleteConversation(userId: string, conversationId: string) {
  const owned = await prisma.coachConversation.findFirst({
    where: { id: conversationId, userId },
    select: { id: true },
  });
  if (!owned) throw new NotFoundError("We could not find that conversation.");
  await prisma.coachConversation.delete({ where: { id: conversationId } });
}

export type CoachTurnResult = {
  conversationId: string;
  answer: string;
  suggestedTasks: Array<{
    title: string;
    kind: string;
    topic: string;
    estimatedMin: number;
  }>;
  citedFacts: string[];
};

/**
 * One coach turn.
 *
 * The user's message is persisted BEFORE the AI call, so a provider failure
 * never loses what they typed — the same ordering rule the interview engine
 * uses.
 */
export async function sendCoachMessage(args: {
  userId: string;
  conversationId?: string;
  question: string;
}): Promise<CoachTurnResult> {
  setAiUsageUser(args.userId);

  const conversation = args.conversationId
    ? await prisma.coachConversation.findFirst({
        where: { id: args.conversationId, userId: args.userId },
        include: {
          messages: { orderBy: { createdAt: "asc" }, take: 40 },
        },
      })
    : null;

  if (args.conversationId && !conversation) {
    throw new NotFoundError("We could not find that conversation.");
  }

  const conversationId =
    conversation?.id ??
    (
      await prisma.coachConversation.create({
        data: {
          userId: args.userId,
          // First question becomes the title, so the list is scannable.
          title: args.question.slice(0, 60),
        },
        select: { id: true },
      })
    ).id;

  await prisma.coachMessage.create({
    data: { conversationId, role: "user", content: args.question },
  });

  const grounding = await buildGrounding(args.userId);

  const history = (conversation?.messages ?? [])
    .slice(-HISTORY_WINDOW)
    .map((message) => ({
      role: message.role === "assistant" ? ("assistant" as const) : ("user" as const),
      content: message.content,
    }));

  const ai = getAIService();
  const reply = await ai.coach({
    grounding,
    history,
    question: args.question,
  });

  await prisma.coachMessage.create({
    data: {
      conversationId,
      role: "assistant",
      content: reply.answer,
      grounding: grounding as unknown as Prisma.InputJsonValue,
      suggestedTasks: reply.suggestedTasks as unknown as Prisma.InputJsonValue,
    },
  });

  await prisma.coachConversation.update({
    where: { id: conversationId },
    data: { updatedAt: new Date() },
  });

  return {
    conversationId,
    answer: reply.answer,
    suggestedTasks: reply.suggestedTasks,
    citedFacts: reply.citedFacts,
  };
}

/**
 * Starter prompts shown on an empty coach page.
 * Only questions the grounding data can genuinely answer.
 */
export const COACH_SUGGESTIONS = [
  "What should I practise today?",
  "Why is my readiness score what it is?",
  "Which of my weak areas should I fix first?",
  "Give me a 14-day preparation plan.",
  "What repeated mistakes am I making?",
  "Am I ready for my target role yet?",
];
