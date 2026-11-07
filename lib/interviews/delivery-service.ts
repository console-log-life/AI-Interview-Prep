import "server-only";

import { NotFoundError } from "@/lib/api/errors";
import { prisma } from "@/lib/db/prisma";
import type { SpeechSummary } from "@/lib/interviews/speech-metrics";
import type { EvidenceRecord } from "@/lib/ai/live/memory";
import type { VisualSummary } from "@/lib/interviews/visual";

/**
 * Persistence for live-interview delivery measurements.
 *
 * The visual and speaking figures are computed in the browser — the frames
 * never leave the candidate's machine, which is the whole point — so the
 * server's job is to store the derived summary and to refuse to store anything
 * that did not come from the owner of the interview.
 *
 * Written on an upsert because the client posts once at the end of the
 * session, but a retry after a network failure must not create a second row or
 * fail the request.
 */

export type DeliveryView = {
  visual: VisualSummary;
  speech: SpeechSummary;
  interruptions: number;
  /** Graded exchanges, in order. Empty for a text interview. */
  evidence: EvidenceRecord[];
};

export async function saveInterviewDelivery(args: {
  userId: string;
  interviewId: string;
  visual: VisualSummary;
  speech: SpeechSummary;
  interruptions: number;
  evidence: EvidenceRecord[];
}): Promise<void> {
  const interview = await prisma.interview.findFirst({
    where: { id: args.interviewId, userId: args.userId },
    select: { id: true },
  });
  if (!interview) throw new NotFoundError("We could not find that interview.");

  const data = {
    visualCapability: args.visual.capability,
    visualSamples: args.visual.samples,
    visualDurationMs: Math.round(args.visual.durationMs),
    faceVisibleRatio: args.visual.faceVisibleRatio,
    cameraEngagementRatio: args.visual.cameraEngagementRatio,
    engagementBand: args.visual.engagementBand,
    framingBand: args.visual.framingBand,
    lightingBand: args.visual.lightingBand,
    stabilityBand: args.visual.stabilityBand,
    visualObservations: args.visual.observations,
    visualLimitations: args.visual.limitations,

    speakingTurns: args.speech.turns,
    spokenWords: args.speech.words,
    totalSpeakingMs: Math.round(args.speech.totalSpeakingMs),
    wordsPerMinute: args.speech.wordsPerMinute,
    paceBand: args.speech.paceBand,
    fillers: args.speech.fillers,
    fillersPerHundred: args.speech.fillersPerHundredWords,
    longPauses: args.speech.longPauses,
    meanAnswerWords: args.speech.meanAnswerWords,
    shortAnswers: args.speech.shortAnswers,
    selfCorrections: args.speech.selfCorrections,
    paceEarlyWpm: args.speech.paceShift?.earlyWpm ?? null,
    paceLateWpm: args.speech.paceShift?.lateWpm ?? null,
    speechObservations: args.speech.observations,
    speechLimitations: args.speech.limitations,

    interruptions: args.interruptions,
    evidence: args.evidence,
  };

  await prisma.interviewDelivery.upsert({
    where: { interviewId: args.interviewId },
    create: { interviewId: args.interviewId, ...data },
    update: data,
  });
}

/**
 * Reads back the stored measurements.
 *
 * Returns null when the interview was a text one, or a voice one where the
 * client never got as far as posting — the report must then omit the section
 * rather than render empty bands, which would read as a poor score.
 */
export async function getInterviewDelivery(
  userId: string,
  interviewId: string,
): Promise<DeliveryView | null> {
  const row = await prisma.interviewDelivery.findFirst({
    where: { interviewId, interview: { userId } },
  });
  if (!row) return null;

  return {
    interruptions: row.interruptions,
    evidence: parseEvidence(row.evidence),
    visual: {
      capability: row.visualCapability as VisualSummary["capability"],
      samples: row.visualSamples,
      durationMs: row.visualDurationMs,
      faceVisibleRatio: row.faceVisibleRatio,
      cameraEngagementRatio: row.cameraEngagementRatio,
      engagementBand: row.engagementBand as VisualSummary["engagementBand"],
      framingBand: row.framingBand as VisualSummary["framingBand"],
      lightingBand: row.lightingBand as VisualSummary["lightingBand"],
      stabilityBand: row.stabilityBand as VisualSummary["stabilityBand"],
      observations: row.visualObservations,
      limitations: row.visualLimitations,
    },
    speech: {
      turns: row.speakingTurns,
      words: row.spokenWords,
      totalSpeakingMs: row.totalSpeakingMs,
      wordsPerMinute: row.wordsPerMinute,
      paceBand: row.paceBand as SpeechSummary["paceBand"],
      fillers: parseFillers(row.fillers),
      fillersPerHundredWords: row.fillersPerHundred,
      fillersAreLowerBound: true,
      longPauses: row.longPauses,
      meanAnswerWords: row.meanAnswerWords,
      shortAnswers: row.shortAnswers,
      selfCorrections: row.selfCorrections,
      paceShift:
        row.paceEarlyWpm !== null && row.paceLateWpm !== null && row.paceEarlyWpm > 0
          ? {
              earlyWpm: row.paceEarlyWpm,
              lateWpm: row.paceLateWpm,
              deltaPercent: Math.round(
                ((row.paceLateWpm - row.paceEarlyWpm) / row.paceEarlyWpm) * 100,
              ),
            }
          : null,
      observations: row.speechObservations,
      limitations: row.speechLimitations,
    },
  };
}

/**
 * Reads back stored evidence.
 *
 * Defensive by design: this is JSON the database cannot type-check, and a
 * malformed row must degrade to "no evidence" rather than crash the report or,
 * worse, render a half-populated record that reads as a finding.
 */
function parseEvidence(value: unknown): EvidenceRecord[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (typeof entry !== "object" || entry === null) return [];
    const r = entry as Record<string, unknown>;
    if (typeof r.questionText !== "string" || typeof r.answerText !== "string") return [];
    return [
      {
        turn: typeof r.turn === "number" ? r.turn : 0,
        atMs: typeof r.atMs === "number" ? r.atMs : 0,
        questionText: r.questionText,
        answerText: r.answerText,
        topicLabel: typeof r.topicLabel === "string" ? r.topicLabel : null,
        intent: String(r.intent ?? "SUFFICIENT") as EvidenceRecord["intent"],
        wordCount: typeof r.wordCount === "number" ? r.wordCount : 0,
        strengths: Array.isArray(r.strengths) ? r.strengths.filter((x): x is string => typeof x === "string") : [],
        gaps: Array.isArray(r.gaps) ? r.gaps.filter((x): x is string => typeof x === "string") : [],
      },
    ];
  });
}

function parseFillers(value: unknown): Array<{ term: string; count: number }> {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (typeof entry !== "object" || entry === null) return [];
    const record = entry as Record<string, unknown>;
    return typeof record.term === "string" && typeof record.count === "number"
      ? [{ term: record.term, count: record.count }]
      : [];
  });
}
