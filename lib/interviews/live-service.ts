import "server-only";

import { ConflictError, NotFoundError } from "@/lib/api/errors";
import { prisma } from "@/lib/db/prisma";

/**
 * Persistence for realtime interviews.
 *
 * A live session produces the same thing a text interview does — an ordered
 * sequence of interviewer questions and candidate answers — so it is stored in
 * the existing `InterviewMessage` table rather than a parallel schema. That
 * means the existing report generator, evaluation engine, communication coach
 * and result page all work on a voice interview with no changes.
 *
 * Raw audio and video are never stored. Only finalized text, its offset from
 * the start of the session, and session-level counters.
 */

export type LiveSegmentInput = {
  speaker: "AI" | "CANDIDATE";
  text: string;
  atMs: number;
};

export type PersistLiveTurnsResult = {
  stored: number;
  skipped: number;
  totalMessages: number;
};

/**
 * Appends finalized turns, skipping anything already stored.
 *
 * The client flushes periodically and re-sends on failure, so this must be
 * idempotent. De-duplication is on (role, content) against what is already
 * persisted, which is cheap and correct here: an interviewer asking the exact
 * same question twice verbatim, or a candidate repeating an answer word for
 * word, is not something worth recording twice.
 */
export async function persistLiveTurns(args: {
  userId: string;
  interviewId: string;
  segments: LiveSegmentInput[];
  interruptions: number;
}): Promise<PersistLiveTurnsResult> {
  const interview = await prisma.interview.findFirst({
    where: { id: args.interviewId, userId: args.userId },
    select: { id: true, status: true },
  });
  if (!interview) throw new NotFoundError("We could not find that interview.");
  if (interview.status === "COMPLETED") {
    throw new ConflictError("This interview has already finished.");
  }

  const existing = await prisma.interviewMessage.findMany({
    where: { interviewId: args.interviewId },
    orderBy: { order: "asc" },
    select: { role: true, content: true, order: true },
  });

  const seen = new Set(existing.map((m) => `${m.role}::${m.content}`));
  let order = existing.length > 0 ? existing[existing.length - 1].order + 1 : 0;

  let stored = 0;
  let skipped = 0;

  for (const segment of args.segments) {
    const role = segment.speaker === "AI" ? "INTERVIEWER" : "CANDIDATE";
    const text = segment.text.trim();
    const key = `${role}::${text}`;

    if (!text || seen.has(key)) {
      skipped += 1;
      continue;
    }
    seen.add(key);

    await prisma.interviewMessage.create({
      data: {
        interviewId: args.interviewId,
        role,
        content: text,
        order: order++,
        // Every interviewer turn in a live session is a spoken question; the
        // engine's follow-up bookkeeping is not driving this conversation, so
        // it is recorded as a plain question rather than guessing.
        isQuestion: role === "INTERVIEWER",
        isFollowUp: false,
      },
    });
    stored += 1;
  }

  if (stored > 0) {
    await prisma.interview.update({
      where: { id: args.interviewId },
      data: { status: "IN_PROGRESS", lastActivityAt: new Date() },
    });
  }

  return { stored, skipped, totalMessages: order };
}

/**
 * Pairs a live transcript into question/answer turns for evaluation.
 *
 * The live model speaks freely, so a session is not guaranteed to alternate
 * cleanly. Consecutive turns from one speaker are merged, and a candidate
 * answer with no preceding question is dropped rather than paired with
 * whatever came before it.
 */
export function pairLiveTranscript(
  segments: Array<{ speaker: "AI" | "CANDIDATE"; text: string }>,
): Array<{ question: string; answer: string }> {
  const merged: Array<{ speaker: "AI" | "CANDIDATE"; text: string }> = [];

  for (const segment of segments) {
    const text = segment.text.trim();
    if (!text) continue;

    const last = merged[merged.length - 1];
    if (last && last.speaker === segment.speaker) {
      last.text = `${last.text} ${text}`.trim();
    } else {
      merged.push({ speaker: segment.speaker, text });
    }
  }

  const turns: Array<{ question: string; answer: string }> = [];
  for (let index = 0; index < merged.length - 1; index += 1) {
    if (merged[index].speaker === "AI" && merged[index + 1].speaker === "CANDIDATE") {
      turns.push({
        question: merged[index].text,
        answer: merged[index + 1].text,
      });
    }
  }
  return turns;
}
