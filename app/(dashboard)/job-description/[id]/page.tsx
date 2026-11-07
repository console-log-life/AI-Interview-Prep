import type { Metadata } from "next";

import { JdResult } from "@/components/job-description/jd-result";
import { JobReadinessCard } from "@/components/job-description/job-readiness-card";
import { PageHeader } from "@/components/shared/page-header";
import { getJobReadiness } from "@/lib/analytics/job-readiness";
import { requireUserPage } from "@/lib/auth/session";
import { toStringArray } from "@/lib/db/queries/users";
import { getJobDescription } from "@/lib/job-description/service";
import { formatDateTime } from "@/lib/utils";
import type { RoadmapStep, SkillLevel, SkillMatch } from "@/types/job-description";

export const metadata: Metadata = {
  title: "Job match",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const VALID_LEVELS: SkillLevel[] = ["STRONG", "MEDIUM", "WEAK", "MISSING"];

/** Narrows the stored JSON back into typed skill-match rows. */
function toSkillMatch(value: unknown): SkillMatch[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (typeof item !== "object" || item === null) return [];
    const record = item as Record<string, unknown>;
    const level = record.level;
    if (typeof record.skill !== "string") return [];
    return [
      {
        skill: record.skill,
        level: VALID_LEVELS.includes(level as SkillLevel)
          ? (level as SkillLevel)
          : "MISSING",
        score: typeof record.score === "number" ? record.score : 0,
        note: typeof record.note === "string" ? record.note : "",
      },
    ];
  });
}

function toRoadmap(value: unknown): RoadmapStep[] {
  if (!Array.isArray(value)) return [];
  return value
    .flatMap((item) => {
      if (typeof item !== "object" || item === null) return [];
      const record = item as Record<string, unknown>;
      if (typeof record.title !== "string") return [];
      return [
        {
          step: typeof record.step === "number" ? record.step : 0,
          title: record.title,
          detail: typeof record.detail === "string" ? record.detail : "",
          estimatedDays:
            typeof record.estimatedDays === "number" ? record.estimatedDays : 3,
        },
      ];
    })
    .sort((a, b) => a.step - b.step);
}

export default async function JobDescriptionResultPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUserPage();
  const { id } = await params;

  // Both are ownership-scoped; readiness is a pure DB read, so it costs
  // nothing and works with no AI key configured.
  const [jd, readiness] = await Promise.all([
    getJobDescription(user.id, id),
    getJobReadiness(user.id, id),
  ]);

  return (
    <>
      <PageHeader
        title={jd.title}
        description={`${jd.company ? `${jd.company} · ` : ""}Analysed ${formatDateTime(jd.createdAt)}`}
      />

      <JobReadinessCard readiness={readiness} />

      <JdResult
        id={jd.id}
        title={jd.title}
        company={jd.company}
        matchScore={jd.matchScore}
        experienceReq={jd.experienceReq}
        requiredSkills={toStringArray(jd.requiredSkills)}
        preferredSkills={toStringArray(jd.preferredSkills)}
        technologies={toStringArray(jd.technologies)}
        responsibilities={toStringArray(jd.responsibilities)}
        keywords={toStringArray(jd.keywords)}
        skillMatch={toSkillMatch(jd.skillMatch)}
        missingSkills={toStringArray(jd.missingSkills)}
        roadmap={toRoadmap(jd.roadmap)}
        suggestedTopics={jd.suggestedTopics}
      />
    </>
  );
}
