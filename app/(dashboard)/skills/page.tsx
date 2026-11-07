import type { Metadata } from "next";
import { Suspense } from "react";
import { Brain } from "lucide-react";

import { MistakeMemoryCard } from "@/components/dashboard/mistake-memory-card";
import { SkillTable } from "@/components/skills/skill-table";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { requireUserPage } from "@/lib/auth/session";
import { getMistakes, refreshMistakeStatuses } from "@/lib/mistakes/service";
import { HALF_LIFE_DAYS } from "@/lib/skills/scoring";
import { getAllSkills } from "@/lib/skills/service";

export const metadata: Metadata = {
  title: "Skills",
  description: "Every skill we have measured, with the evidence behind it.",
};

export const dynamic = "force-dynamic";

async function SkillsContent({ userId }: { userId: string }) {
  await refreshMistakeStatuses(userId);
  const [skills, mistakes] = await Promise.all([
    getAllSkills(userId),
    getMistakes(userId, { includeResolved: true, limit: 10 }),
  ]);

  return (
    <div className="space-y-6">
      <Card className="rounded-2xl border-border/70">
        <CardHeader>
          <CardTitle>Skill ledger</CardTitle>
          <CardDescription>
            Weakest first. Scores are recency-weighted with a {HALF_LIFE_DAYS}
            -day half-life, so old results fade rather than propping up a number
            you can no longer reproduce.
          </CardDescription>
        </CardHeader>
        <CardContent className={skills.length === 0 ? undefined : "px-0"}>
          {skills.length === 0 ? (
            <EmptyState
              icon={Brain}
              title="No skills measured yet"
              description="A skill appears here the moment there is real evidence for it — an interview answer, an assessment question or a coding submission."
              action={{ label: "Start an interview", href: "/interview/new" }}
              secondaryAction={{
                label: "Take an assessment",
                href: "/assessments",
              }}
            />
          ) : (
            <SkillTable skills={skills} />
          )}
        </CardContent>
      </Card>

      <MistakeMemoryCard mistakes={mistakes} />
    </div>
  );
}

export default async function SkillsPage() {
  const user = await requireUserPage("/skills");

  return (
    <>
      <PageHeader
        title="Skill intelligence"
        description="What you're actually good at, how sure we are, and which way it's moving."
      />

      <Suspense
        fallback={
          <div className="space-y-6">
            <Skeleton className="h-96" />
            <Skeleton className="h-64" />
          </div>
        }
      >
        <SkillsContent userId={user.id} />
      </Suspense>
    </>
  );
}
