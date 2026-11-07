import type { NextRequest } from "next/server";
import { z } from "zod";

import { ok, route } from "@/lib/api/response";
import { requireUser } from "@/lib/auth/session";
import {
  getInterviewDelivery,
  saveInterviewDelivery,
} from "@/lib/interviews/delivery-service";

/**
 * Delivery measurements for a live interview.
 *
 * The visual and speaking analysis runs entirely in the browser, so this
 * endpoint receives a summary rather than any media. That is deliberate: raw
 * frames never leave the candidate's machine, which is both the privacy
 * promise made in the lobby and the reason no video is stored anywhere.
 *
 * Because the numbers arrive from the client they are bounded here — not to
 * detect cheating, which would be pointless on a self-practice tool, but so a
 * buggy client cannot write a ratio of 4.2 into a report.
 */
const ratio = z.coerce.number().min(0).max(1).nullable();

const visualSchema = z.object({
  capability: z.enum(["FULL", "FRAME_ONLY", "UNAVAILABLE"]),
  samples: z.coerce.number().int().min(0).max(100_000),
  durationMs: z.coerce.number().min(0).max(24 * 60 * 60 * 1000),
  faceVisibleRatio: ratio,
  cameraEngagementRatio: ratio,
  engagementBand: z
    .enum(["CONSISTENT", "MOSTLY_CONSISTENT", "INCONSISTENT", "FREQUENTLY_DIVERTED"])
    .nullable(),
  framingBand: z.enum(["WELL_FRAMED", "OFF_CENTRE", "TOO_CLOSE", "TOO_FAR"]).nullable(),
  lightingBand: z.enum(["GOOD", "DIM", "OVEREXPOSED"]).nullable(),
  stabilityBand: z.enum(["STEADY", "SOME_MOVEMENT", "UNSTABLE"]).nullable(),
  observations: z.array(z.string().max(600)).max(20),
  limitations: z.array(z.string().max(600)).max(20),
});

const speechSchema = z.object({
  turns: z.coerce.number().int().min(0).max(1000),
  words: z.coerce.number().int().min(0).max(500_000),
  totalSpeakingMs: z.coerce.number().min(0).max(24 * 60 * 60 * 1000),
  wordsPerMinute: z.coerce.number().int().min(0).max(1000).nullable(),
  paceBand: z.enum(["MEASURED", "CONVERSATIONAL", "BRISK", "RUSHED"]).nullable(),
  fillers: z
    .array(
      z.object({
        term: z.string().trim().min(1).max(40),
        count: z.coerce.number().int().min(1).max(10_000),
      }),
    )
    .max(40),
  fillersPerHundredWords: z.coerce.number().min(0).max(100).nullable(),
  fillersAreLowerBound: z.literal(true),
  longPauses: z.coerce.number().int().min(0).max(10_000),
  meanAnswerWords: z.coerce.number().int().min(0).max(100_000).nullable(),
  shortAnswers: z.coerce.number().int().min(0).max(1000),
  selfCorrections: z.coerce.number().int().min(0).max(10_000),
  paceShift: z
    .object({
      earlyWpm: z.coerce.number().int().min(0).max(1000),
      lateWpm: z.coerce.number().int().min(0).max(1000),
      deltaPercent: z.coerce.number().int().min(-100).max(1000),
    })
    .nullable(),
  observations: z.array(z.string().max(600)).max(20),
  limitations: z.array(z.string().max(600)).max(20),
});

/**
 * One graded exchange.
 *
 * Bounded like everything else here — not to catch cheating, which would be
 * pointless on a self-practice tool, but so a buggy client cannot write a
 * megabyte of text into a report.
 */
const evidenceSchema = z.object({
  turn: z.coerce.number().int().min(0).max(1000),
  atMs: z.coerce.number().min(0).max(24 * 60 * 60 * 1000),
  questionText: z.string().trim().max(2000),
  answerText: z.string().trim().max(8000),
  topicLabel: z.string().trim().max(120).nullable(),
  intent: z.string().trim().max(60),
  wordCount: z.coerce.number().int().min(0).max(100_000),
  strengths: z.array(z.string().max(200)).max(20),
  gaps: z.array(z.string().max(200)).max(20),
});

/**
 * Attention aggregates.
 *
 * Bounded like everything else on this endpoint. Ratios are clamped to 0-1 and
 * counts to a sane ceiling, so a buggy client cannot write "looked away 4000
 * times" into a report. Every field is optional and the object defaults to
 * empty, because the feature is behind a flag and most posts will not carry
 * it at all.
 */
const attentionSchema = z
  .object({
    cameraMeasured: z.boolean(),
    cameraUnavailableReason: z.string().max(600).nullable(),
    lookingAtScreenRatio: z.coerce.number().min(0).max(1).nullable(),
    lookAwayCount: z.coerce.number().int().min(0).max(10_000),
    longestLookAwayMs: z.coerce.number().min(0).max(24 * 60 * 60 * 1000),
    tabSwitches: z.coerce.number().int().min(0).max(10_000),
    fullscreenExits: z.coerce.number().int().min(0).max(10_000),
    maxFacesSeen: z.coerce.number().int().min(0).max(50).nullable(),
  })
  .optional();

const bodySchema = z.object({
  visual: visualSchema,
  speech: speechSchema,
  evidence: z.array(evidenceSchema).max(200).default([]),
  interruptions: z.coerce.number().int().min(0).max(500).default(0),
  attention: attentionSchema,
});

export const POST = route(
  async (request: NextRequest, context: { params: Promise<{ id: string }> }) => {
    const user = await requireUser();
    const { id } = await context.params;

    const input = bodySchema.parse(await request.json());

    await saveInterviewDelivery({
      userId: user.id,
      interviewId: id,
      visual: input.visual,
      speech: input.speech,
      evidence: input.evidence as never,
      interruptions: input.interruptions,
      attention: input.attention ?? null,
    });

    return ok({ stored: true });
  },
);

export const GET = route(
  async (_request: NextRequest, context: { params: Promise<{ id: string }> }) => {
    const user = await requireUser();
    const { id } = await context.params;
    return ok(await getInterviewDelivery(user.id, id));
  },
);

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
