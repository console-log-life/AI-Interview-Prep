import type { Metadata } from "next";
import { Suspense } from "react";
import {
  Award,
  Bot,
  Braces,
  ClipboardList,
  ShieldAlert,
} from "lucide-react";

import { DailyPlanCard } from "@/components/dashboard/daily-plan-card";
import { Greeting } from "@/components/dashboard/greeting";
import { MistakeMemoryCard } from "@/components/dashboard/mistake-memory-card";
import { ReviewQueue } from "@/components/practice/review-queue";
import { ProgressChart } from "@/components/dashboard/progress-chart";
import { QuickActions } from "@/components/dashboard/quick-actions";
import { ReadinessV2Card } from "@/components/dashboard/readiness-v2-card";
import {
  RecentAssessments,
  RecentCoding,
  RecentInterviews,
} from "@/components/dashboard/recent-activity";
import { RecommendationsCard } from "@/components/dashboard/recommendations-card";
import {
  SkillFocusList,
  SkillIntelligence,
} from "@/components/dashboard/skill-intelligence";
import { PageHeader } from "@/components/shared/page-header";
import { ServiceNotice } from "@/components/shared/service-notice";
import { StatCard } from "@/components/shared/stat-card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { aiAvailable } from "@/lib/ai";
import { aiKeyEnvHint } from "@/lib/env";
import { requireUserPage } from "@/lib/auth/session";
import { getDashboardIntelligence } from "@/lib/dashboard/intelligence";
import { prisma } from "@/lib/db/prisma";
import { getDashboardData } from "@/lib/db/queries/dashboard";

export const metadata: Metadata = {
  title: "Dashboard",
  description: "Your interview readiness at a glance.",
};

// The dashboard reflects live user activity, so it must never be cached.
export const dynamic = "force-dynamic";

function firstName(name: string | null, email: string): string {
  const source = name?.trim() || email.split("@")[0] || "there";
  return source.split(/\s+/)[0];
}

async function DashboardContent({ userId }: { userId: string }) {
  const [data, intelligence] = await Promise.all([
    getDashboardData(userId),
    getDashboardIntelligence(userId),
  ]);

  const chartData = data.snapshots.map((snapshot) => ({
    date: new Date(snapshot.createdAt).toLocaleDateString(undefined, {
      day: "numeric",
      month: "short",
    }),
    readiness: snapshot.readinessScore,
    interview: Math.round(snapshot.interviewAvg),
    assessment: Math.round(snapshot.assessmentAvg),
    coding: Math.round(snapshot.codingAvg),
  }));

  return (
    <>
      <QuickActions />

      <section aria-labelledby="stats-heading">
        <h2 id="stats-heading" className="sr-only">
          Your totals
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Interviews"
            value={data.totals.interviewsCompleted}
            icon={Bot}
            hint={
              data.totals.interviewsCompleted > 0
                ? `Average ${data.totals.interviewAvg}%`
                : "None completed yet"
            }
          />
          <StatCard
            label="Assessments"
            value={data.totals.assessmentsCompleted}
            icon={ClipboardList}
            hint={
              data.totals.assessmentsCompleted > 0
                ? `Average ${data.totals.assessmentAvg}%`
                : "None completed yet"
            }
          />
          <StatCard
            label="Problems solved"
            value={data.totals.problemsSolved}
            icon={Braces}
            hint={
              data.totals.problemsSolved > 0
                ? `${data.totals.codingAvg}% acceptance`
                : "None solved yet"
            }
          />
          <StatCard
            label="Achievements"
            value={data.achievementCount}
            icon={Award}
            hint="Unlocked by real activity"
          />
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <ReadinessV2Card
          readiness={intelligence.readiness}
          streak={intelligence.streak}
        />
        <div className="space-y-6 lg:col-span-2">
          <DailyPlanCard tasks={intelligence.planTasks} />
          <RecommendationsCard
            recommendations={data.recommendations.map((rec) => ({
              id: rec.id,
              title: rec.title,
              reason: rec.reason,
              priority: rec.priority,
              actionUrl: rec.actionUrl,
              actionLabel: rec.actionLabel,
            }))}
          />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <SkillIntelligence skills={intelligence.headlineSkills} />
        <MistakeMemoryCard mistakes={intelligence.mistakes} />
      </div>

      <ReviewQueue
        due={intelligence.reviews.due}
        upcoming={intelligence.reviews.upcoming}
        dueTotal={intelligence.reviews.dueTotal}
        totalActive={intelligence.reviews.totalActive}
        moreHref="/practice"
      />

      <ProgressChart data={chartData} />

      <div className="grid gap-6 lg:grid-cols-2">
        <SkillFocusList
          title="Weak areas"
          description="Below 60% with enough evidence to be a real signal, not noise."
          skills={intelligence.weakSkills}
          emptyTitle="No confirmed weak areas"
          emptyDescription="A single low score isn't enough to call something a weakness. Keep practising and anything that genuinely slips will appear here."
          tone="weak"
        />
        <SkillFocusList
          title="Strong areas"
          description="Consistently above 75%, backed by repeated evidence."
          skills={intelligence.strongSkills}
          emptyTitle="No confirmed strengths yet"
          emptyDescription="Strengths need several observations before we'll claim them. Keep going."
          tone="strong"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <RecentInterviews interviews={data.recentInterviews} />
        <RecentAssessments attempts={data.recentAttempts} />
        <RecentCoding submissions={data.recentSubmissions} />
      </div>
    </>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, index) => (
          <Skeleton key={index} className="h-24" />
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-28" />
        ))}
      </div>
      <Skeleton className="h-80" />
    </div>
  );
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await requireUserPage("/dashboard");
  const params = await searchParams;

  // Cheap single-column read; the heavy dashboard data stays inside Suspense
  // so the header renders immediately.
  const profile = await prisma.profile.findUnique({
    where: { userId: user.id },
    select: { targetRole: true },
  });
  const targetRole = profile?.targetRole ?? null;

  return (
    <>
      <PageHeader
        eyebrow={targetRole ? `Preparing for ${targetRole}` : undefined}
        title={<Greeting name={firstName(user.name, user.email)} />}
        description="Your interview intelligence centre — what's measured, what's weak, and what to do today."
      />

      {params.error === "forbidden" && (
        <Alert variant="destructive">
          <ShieldAlert aria-hidden="true" />
          <AlertTitle>Access denied</AlertTitle>
          <AlertDescription>
            That area is restricted to administrators.
          </AlertDescription>
        </Alert>
      )}

      {!aiAvailable() && (
        <ServiceNotice
          title="AI features are not configured"
          message="Mock interviews, resume analysis and job-description matching need an AI provider key. Assessments, coding practice and progress tracking all work without one."
          envHint={aiKeyEnvHint()}
        />
      )}

      <Suspense fallback={<DashboardSkeleton />}>
        <DashboardContent userId={user.id} />
      </Suspense>
    </>
  );
}
