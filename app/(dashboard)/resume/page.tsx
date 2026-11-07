import type { Metadata } from "next";

import {
  ExtractedProfile,
  type ExtractedProfileData,
} from "@/components/resume/extracted-profile";
import { ClaimVerification } from "@/components/resume/claim-verification";
import { ResumeManager } from "@/components/resume/resume-manager";
import { PageHeader } from "@/components/shared/page-header";
import { aiAvailable } from "@/lib/ai";
import { requireUserPage } from "@/lib/auth/session";
import { toStringArray } from "@/lib/db/queries/users";
import { getClaims } from "@/lib/resume/claims";
import { getResumes } from "@/lib/resume/service";

export const metadata: Metadata = {
  title: "Resume",
  description: "Upload and analyse your resume.",
};

export const dynamic = "force-dynamic";

/** Narrows an unknown JSON column into an array of objects with defaults. */
function toObjectArray<T extends Record<string, unknown>>(
  value: unknown,
  shape: T,
): T[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (item): item is Record<string, unknown> =>
        typeof item === "object" && item !== null,
    )
    .map((item) => {
      const result = { ...shape };
      for (const key of Object.keys(shape) as Array<keyof T>) {
        const raw = item[key as string];
        if (Array.isArray(shape[key])) {
          result[key] = toStringArray(raw) as T[keyof T];
        } else if (typeof raw === "string") {
          result[key] = raw as T[keyof T];
        }
      }
      return result;
    });
}

export default async function ResumePage() {
  const user = await requireUserPage("/resume");
  const resumes = await getResumes(user.id);
  const primary = resumes.find((resume) => resume.analysis) ?? null;
  const claims = primary ? await getClaims(user.id, primary.id) : [];

  const extracted: ExtractedProfileData | null = primary?.analysis
    ? {
        fullName: primary.analysis.fullName ?? "",
        email: primary.analysis.email ?? "",
        phone: primary.analysis.phone ?? "",
        summary: primary.analysis.summary ?? "",
        yearsExperience: primary.analysis.yearsExperience ?? 0,
        skills: toStringArray(primary.analysis.skills),
        technologies: toStringArray(primary.analysis.technologies),
        certifications: toStringArray(primary.analysis.certifications),
        achievements: toStringArray(primary.analysis.achievements),
        strengths: toStringArray(primary.analysis.strengths),
        gaps: toStringArray(primary.analysis.gaps),
        education: toObjectArray(primary.analysis.education, {
          degree: "",
          institution: "",
          year: "",
          score: "",
        }),
        projects: toObjectArray(primary.analysis.projects, {
          name: "",
          description: "",
          technologies: [] as string[],
        }),
        experience: toObjectArray(primary.analysis.experience, {
          role: "",
          organisation: "",
          duration: "",
          description: "",
        }),
        internships: toObjectArray(primary.analysis.internships, {
          role: "",
          organisation: "",
          duration: "",
          description: "",
        }),
        userVerified: primary.analysis.userVerified,
      }
    : null;

  return (
    <>
      <PageHeader
        title="Resume"
        description="Upload a PDF and we'll turn it into a structured profile you can correct."
      />

      <ResumeManager
        aiEnabled={aiAvailable()}
        resumes={resumes.map((resume) => ({
          id: resume.id,
          fileName: resume.fileName,
          sizeBytes: resume.sizeBytes,
          status: resume.status,
          isPrimary: resume.isPrimary,
          errorMessage: resume.errorMessage,
          createdAt: resume.createdAt.toISOString(),
          hasAnalysis: Boolean(resume.analysis),
          userVerified: resume.analysis?.userVerified ?? false,
        }))}
      />

      {primary && extracted && (
        <>
          <section aria-labelledby="extracted-heading" className="space-y-4">
            <h2 id="extracted-heading" className="text-lg font-semibold">
              Extracted profile
            </h2>
            <ExtractedProfile resumeId={primary.id} data={extracted} />
          </section>

          <ClaimVerification
            resumeId={primary.id}
            aiEnabled={aiAvailable()}
            claims={claims.map((claim) => ({
              id: claim.id,
              claimType: claim.claimType,
              text: claim.text,
              technologies: claim.technologies,
              probes: claim.probes,
              status: claim.status,
              evidence: claim.evidence,
              understanding: claim.understanding,
            }))}
          />
        </>
      )}
    </>
  );
}
