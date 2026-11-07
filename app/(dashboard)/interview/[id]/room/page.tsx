import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { InterviewRoom } from "@/components/interview/live/interview-room";
import { requireUserPage } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { isLiveVoiceConfigured } from "@/lib/env";
import { tuningFor } from "@/lib/ai/live/config";

export const metadata: Metadata = {
  title: "Interview room",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * The interview room itself.
 *
 * Reached only from the device check, which is why there is no fallback UI
 * here for a missing microphone — that decision was already made one screen
 * earlier, with the candidate looking at the evidence.
 *
 * `startedAt` comes from the database rather than the browser so the interview
 * clock survives a refresh. Anchoring it on mount would hand a candidate a
 * fresh thirty minutes every time they reloaded the page.
 */
export default async function InterviewRoomPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ video?: string }>;
}) {
  const user = await requireUserPage();
  const { id } = await params;
  const query = await searchParams;

  if (!isLiveVoiceConfigured()) redirect(`/interview/${id}/check`);

  const interview = await prisma.interview.findFirst({
    where: { id, userId: user.id },
    select: {
      status: true,
      persona: true,
      type: true,
      targetRole: true,
      durationMin: true,
      plannedQuestions: true,
    },
  });

  if (!interview) notFound();
  if (interview.status === "COMPLETED") redirect(`/interview/${id}/result`);

  // Identity comes from persona configuration, not copy in the component.
  const tuning = tuningFor(interview.persona);

  return (
    <InterviewRoom
      interviewId={id}
      interviewType={interview.type}
      targetRole={interview.targetRole}
      durationMin={interview.durationMin}
      wantVideo={query.video !== "off"}
      interviewerName={tuning.displayName}
      interviewerTitle={tuning.title}
    />
  );
}
