import "server-only";

import { prisma } from "@/lib/db/prisma";
import { CLAIM_STATUS_LABEL } from "@/lib/resume/claim-labels";
import { skillLabel } from "@/lib/skills/graph";
import type { ClaimStatus } from "@prisma/client";

/**
 * What this interview actually changed.
 *
 * The V1 report scored the session in isolation. This answers the question a
 * candidate genuinely has afterwards — "so what moved?" — by reading back the
 * rows the interview wrote: skill observations, mistake occurrences and resume
 * claims it verified.
 *
 * Everything is filtered by `sourceId = interviewId`, so it reports only this
 * session's contribution and never the running totals.
 */

export type InterviewSkillImpact = {
  skillKey: string;
  label: string;
  /** Mean 0-100 across this interview's observations for the skill. */
  score: number;
  observations: number;
};

export type InterviewMistakeImpact = {
  id: string;
  label: string;
  severity: "LOW" | "MEDIUM" | "HIGH";
  detail: string;
  /** Lifetime count, so "3rd time" is visible. */
  frequency: number;
  isRepeated: boolean;
};

export type InterviewClaimImpact = {
  id: string;
  text: string;
  status: ClaimStatus;
  statusLabel: string;
  understanding: number | null;
};

export type InterviewIntelligence = {
  skills: InterviewSkillImpact[];
  mistakes: InterviewMistakeImpact[];
  claims: InterviewClaimImpact[];
};

export async function getInterviewIntelligence(
  userId: string,
  interviewId: string,
): Promise<InterviewIntelligence> {
  // Ownership gate: everything below is scoped by this interview id, so it
  // must be proven to belong to the caller first.
  const owned = await prisma.interview.findFirst({
    where: { id: interviewId, userId },
    select: { id: true },
  });
  if (!owned) return { skills: [], mistakes: [], claims: [] };

  const [observations, occurrences, probeMessages] = await Promise.all([
    prisma.skillObservation.findMany({
      where: { userId, sourceId: interviewId, source: "INTERVIEW" },
      select: { skillKey: true, score: true },
    }),
    prisma.mistakeOccurrence.findMany({
      where: { sourceId: interviewId, source: "INTERVIEW" },
      orderBy: { createdAt: "asc" },
      select: {
        detail: true,
        mistake: {
          select: { id: true, label: true, severity: true, frequency: true },
        },
      },
    }),
    prisma.interviewMessage.findMany({
      where: { interviewId, probeClaimId: { not: null } },
      select: {
        probeClaim: {
          select: {
            id: true,
            text: true,
            status: true,
            understanding: true,
          },
        },
      },
    }),
  ]);

  // --- Skills: mean per skill, strongest first --------------------------
  const grouped = new Map<string, { total: number; count: number }>();
  for (const observation of observations) {
    const entry = grouped.get(observation.skillKey) ?? { total: 0, count: 0 };
    entry.total += observation.score;
    entry.count += 1;
    grouped.set(observation.skillKey, entry);
  }

  const skills: InterviewSkillImpact[] = [...grouped.entries()]
    .map(([skillKey, entry]) => ({
      skillKey,
      label: skillLabel(skillKey),
      score: Math.round(entry.total / entry.count),
      observations: entry.count,
    }))
    .sort((a, b) => b.score - a.score);

  // --- Mistakes: one row per concept, even if it fired on two answers ----
  const seenMistakes = new Set<string>();
  const mistakes: InterviewMistakeImpact[] = [];
  for (const occurrence of occurrences) {
    if (seenMistakes.has(occurrence.mistake.id)) continue;
    seenMistakes.add(occurrence.mistake.id);
    mistakes.push({
      id: occurrence.mistake.id,
      label: occurrence.mistake.label,
      severity: occurrence.mistake.severity,
      detail: occurrence.detail,
      frequency: occurrence.mistake.frequency,
      isRepeated: occurrence.mistake.frequency > 1,
    });
  }

  // --- Claims probed during this interview ------------------------------
  const seenClaims = new Set<string>();
  const claims: InterviewClaimImpact[] = [];
  for (const message of probeMessages) {
    const claim = message.probeClaim;
    if (!claim || seenClaims.has(claim.id)) continue;
    seenClaims.add(claim.id);
    claims.push({
      id: claim.id,
      text: claim.text,
      status: claim.status,
      statusLabel: CLAIM_STATUS_LABEL[claim.status],
      understanding: claim.understanding,
    });
  }

  return { skills, mistakes, claims };
}
