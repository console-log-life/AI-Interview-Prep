import "server-only";
import type { ClaimStatus } from "@prisma/client";

import { getAIService } from "@/lib/ai";
import { setAiUsageUser } from "@/lib/ai/observability";
import { NotFoundError } from "@/lib/api/errors";
import { prisma } from "@/lib/db/prisma";

/**
 * Resume claim extraction and verification.
 *
 * This is what turns a resume from a keyword list into an interview plan.
 * A claim like "Built a REST API using Node.js" becomes a set of probe
 * questions the adaptive engine works through, and the candidate's answers
 * mark the claim VERIFIED / PARTIAL / WEAK.
 *
 * The candidate is never penalised for a claim the interview simply did not
 * reach — unprobed claims stay UNVERIFIED, which is a neutral state.
 */

export async function extractClaims(userId: string, resumeId: string) {
  const resume = await prisma.resume.findFirst({
    where: { id: resumeId, userId },
    select: { id: true, extractedText: true, status: true },
  });
  if (!resume) throw new NotFoundError("We could not find that resume.");
  if (!resume.extractedText) {
    throw new NotFoundError(
      "That resume has no extracted text yet. Analyse it first.",
    );
  }

  setAiUsageUser(userId);
  const ai = getAIService();
  const claims = await ai.extractResumeClaims(resume.extractedText);

  // Replace wholesale — re-extraction should not leave stale claims behind.
  await prisma.resumeClaim.deleteMany({ where: { resumeId } });

  if (claims.length > 0) {
    await prisma.resumeClaim.createMany({
      data: claims.map((claim) => ({
        resumeId,
        claimType: claim.claimType,
        text: claim.text,
        technologies: claim.technologies,
        probes: claim.probes,
        status: "UNVERIFIED" as ClaimStatus,
      })),
    });
  }

  return prisma.resumeClaim.findMany({
    where: { resumeId },
    orderBy: { createdAt: "asc" },
  });
}

export async function getClaims(userId: string, resumeId: string) {
  const resume = await prisma.resume.findFirst({
    where: { id: resumeId, userId },
    select: { id: true },
  });
  if (!resume) throw new NotFoundError("We could not find that resume.");

  return prisma.resumeClaim.findMany({
    where: { resumeId },
    orderBy: [{ status: "asc" }, { createdAt: "asc" }],
  });
}

/**
 * Records what an interview revealed about a claim.
 *
 * Called after an answer is graded on a question that came from a claim probe.
 * The 0-10 answer score maps onto a verification status.
 */
export async function recordClaimVerification(args: {
  userId: string;
  claimId: string;
  /** 0-10 from the answer evaluation. */
  score: number;
  evidence: string;
}) {
  const claim = await prisma.resumeClaim.findFirst({
    where: { id: args.claimId, resume: { userId: args.userId } },
    select: { id: true },
  });
  if (!claim) throw new NotFoundError("We could not find that claim.");

  const status: ClaimStatus =
    args.score >= 8
      ? "VERIFIED"
      : args.score >= 6
        ? "PARTIAL"
        : args.score >= 3
          ? "UNCLEAR"
          : "WEAK";

  return prisma.resumeClaim.update({
    where: { id: args.claimId },
    data: {
      status,
      evidence: args.evidence.slice(0, 2000),
      understanding: Math.round(args.score * 10),
      verifiedAt: new Date(),
    },
  });
}

export { CLAIM_STATUS_LABEL } from "@/lib/resume/claim-labels";

/** Summary for the resume page. */
export async function getClaimSummary(userId: string, resumeId: string) {
  const claims = await getClaims(userId, resumeId);
  const byStatus = new Map<ClaimStatus, number>();
  for (const claim of claims) {
    byStatus.set(claim.status, (byStatus.get(claim.status) ?? 0) + 1);
  }
  return {
    total: claims.length,
    verified: byStatus.get("VERIFIED") ?? 0,
    partial: byStatus.get("PARTIAL") ?? 0,
    weak: (byStatus.get("WEAK") ?? 0) + (byStatus.get("UNCLEAR") ?? 0),
    unverified: byStatus.get("UNVERIFIED") ?? 0,
  };
}
