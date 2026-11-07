import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AssessmentRunner } from "@/components/assessment/assessment-runner";
import { requireUserPage } from "@/lib/auth/session";
import { getAttemptForTaking } from "@/lib/db/queries/assessments";

export const metadata: Metadata = {
  title: "Assessment in progress",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * The live attempt screen.
 *
 * `[id]` is the ATTEMPT id, not the assessment id — that is what makes the
 * page resumable: navigating back to this URL rehydrates the same attempt with
 * its saved answers and the original server-side deadline.
 */
export default async function TakeAssessmentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUserPage();
  const { id } = await params;

  const attempt = await getAttemptForTaking(user.id, id);

  // Already submitted? Send them to the result instead of re-opening it.
  if (attempt.status !== "IN_PROGRESS") {
    redirect(`/assessments/${id}/result`);
  }

  return (
    <AssessmentRunner
      attemptId={attempt.attemptId}
      title={attempt.title}
      durationMin={attempt.durationMin}
      secondsRemaining={attempt.secondsRemaining}
      questions={attempt.questions}
    />
  );
}
