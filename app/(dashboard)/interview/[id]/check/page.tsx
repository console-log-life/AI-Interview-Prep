import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AlertCircle } from "lucide-react";

import { DeviceCheck } from "@/components/interview/live/device-check";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { requireUserPage } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { isLiveVoiceConfigured } from "@/lib/env";

export const metadata: Metadata = {
  title: "Device check",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * The gate into a mock interview.
 *
 * Deliberately its own route rather than a mode on the interview page. A
 * candidate should be able to land here, run the check, and see the join
 * button — and a chat interview should never be one query parameter away from
 * opening a camera.
 */
export default async function DeviceCheckPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUserPage();
  const { id } = await params;

  const interview = await prisma.interview.findFirst({
    where: { id, userId: user.id },
    select: {
      status: true,
      persona: true,
      type: true,
      targetRole: true,
      durationMin: true,
      difficulty: true,
      plannedQuestions: true,
    },
  });

  if (!interview) notFound();
  if (interview.status === "COMPLETED") redirect(`/interview/${id}/result`);

  if (!isLiveVoiceConfigured()) {
    return (
      <Alert>
        <AlertCircle aria-hidden="true" />
        <AlertTitle>Mock interviews are not available here</AlertTitle>
        <AlertDescription className="space-y-3">
          <p>
            This deployment has no realtime voice provider configured, so the
            camera-and-voice interview cannot run. The chat interview works and
            produces the same scored report, minus the delivery analysis.
          </p>
          <Button asChild size="sm">
            <Link href={`/interview/${id}`}>Open the chat interview</Link>
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <DeviceCheck
      interviewId={id}
      persona={interview.persona}
      interviewType={interview.type}
      targetRole={interview.targetRole}
      durationMin={interview.durationMin}
      difficulty={interview.difficulty}
      plannedQuestions={interview.plannedQuestions}
    />
  );
}
