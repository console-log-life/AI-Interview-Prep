import type { Metadata } from "next";

import { AssessmentResult } from "@/components/assessment/assessment-result";
import { PageHeader } from "@/components/shared/page-header";
import { requireUserPage } from "@/lib/auth/session";
import { getAttemptResult } from "@/lib/db/queries/assessments";
import { formatDateTime } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Assessment result",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AssessmentResultPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUserPage();
  const { id } = await params;

  // Ownership is enforced in the query (`where: { id, userId }`), so one user
  // can never open another user's result by guessing the id.
  const result = await getAttemptResult(user.id, id);

  return (
    <>
      <PageHeader
        title={result.title}
        description={`Submitted ${formatDateTime(result.submittedAt)}`}
      />
      <AssessmentResult result={result} />
    </>
  );
}
