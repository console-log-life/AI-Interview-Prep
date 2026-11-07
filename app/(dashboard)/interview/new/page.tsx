import type { Metadata } from "next";

import { InterviewSetup } from "@/components/interview/interview-setup";
import { PageHeader } from "@/components/shared/page-header";
import { ServiceNotice } from "@/components/shared/service-notice";
import { aiAvailable } from "@/lib/ai";
import { aiKeyEnvHint, isLiveVoiceConfigured } from "@/lib/env";
import { requireUserPage } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { listJobDescriptions } from "@/lib/job-description/service";
import type { ExperienceLevel } from "@/types/user";

export const metadata: Metadata = {
  title: "New mock interview",
  description: "Configure and start an AI mock interview.",
};

export const dynamic = "force-dynamic";

export default async function NewInterviewPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; difficulty?: string; jd?: string }>;
}) {
  const user = await requireUserPage("/interview/new");
  const params = await searchParams;

  const [profile, analysedResume, jobDescriptions] = await Promise.all([
    prisma.profile.findUnique({
      where: { userId: user.id },
      select: { targetRole: true, experienceLevel: true },
    }),
    prisma.resume.findFirst({
      where: { userId: user.id, status: "ANALYZED" },
      select: { id: true },
    }),
    listJobDescriptions(user.id, 20),
  ]);

  return (
    <>
      <PageHeader
        title="New mock interview"
        description="Set the round up the way your real interview will run."
      />

      {!aiAvailable() ? (
        <ServiceNotice
          title="Mock interviews need an AI key"
          message="This deployment has no AI provider key, so interviews can't be generated. Assessments, coding practice and progress tracking still work."
          envHint={aiKeyEnvHint()}
        />
      ) : (
        <InterviewSetup
          defaultRole={profile?.targetRole ?? "Software Engineer"}
          defaultExperience={
            (profile?.experienceLevel as ExperienceLevel) ?? "FRESHER"
          }
          hasResume={Boolean(analysedResume)}
          jobDescriptions={jobDescriptions.map((jd) => ({
            id: jd.id,
            title: jd.title,
            company: jd.company,
          }))}
          presetType={params.type}
          presetDifficulty={params.difficulty}
          presetJobDescriptionId={params.jd}
          liveAvailable={isLiveVoiceConfigured()}
        />
      )}
    </>
  );
}
