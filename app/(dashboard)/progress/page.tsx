import type { Metadata } from "next";
import {
  Award,
  Bot,
  Braces,
  ClipboardList,
  Flame,
  Target,
} from "lucide-react";

import { ProgressChart } from "@/components/dashboard/progress-chart";
import { AchievementGrid } from "@/components/progress/achievement-grid";
import { TopicTable } from "@/components/progress/topic-table";
import { PageHeader } from "@/components/shared/page-header";
import { ScoreRing } from "@/components/shared/score-ring";
import { StatCard } from "@/components/shared/stat-card";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { requireUserPage } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import {
  computeReadinessScore,
  computeTotals,
  getStreak,
} from "@/lib/progress/service";
import { getAchievementProgress } from "@/lib/recommendations/achievements";

export const metadata: Metadata = {
  title: "Progress",
  description: "Your improvement over time.",
};

export const dynamic = "force-dynamic";

export default async function ProgressPage() {
  const user = await requireUserPage("/progress");

  const [totals, streak, topics, snapshots, achievements] = await Promise.all([
    computeTotals(user.id),
    getStreak(user.id),
    prisma.topicPerformance.findMany({
      where: { userId: user.id },
      orderBy: { averageScore: "asc" },
      take: 60,
    }),
    prisma.progressSnapshot.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "asc" },
      take: 60,
    }),
    getAchievementProgress(user.id),
  ]);

  const readinessScore = computeReadinessScore(totals);

  // Improvement is measured against the FIRST recorded snapshot, so it answers
  // "how far have I come" rather than "how did the last session go".
  const first = snapshots[0] ?? null;
  const improvement = first ? readinessScore - first.readinessScore : null;

  const chartData = snapshots.map((snapshot) => ({
    date: new Date(snapshot.createdAt).toLocaleDateString(undefined, {
      day: "numeric",
      month: "short",
    }),
    readiness: snapshot.readinessScore,
    interview: Math.round(snapshot.interviewAvg),
    assessment: Math.round(snapshot.assessmentAvg),
    coding: Math.round(snapshot.codingAvg),
  }));

  const weak = topics.filter((topic) => topic.averageScore < 60);
  const strong = topics.filter((topic) => topic.averageScore >= 75);
  const unlockedCount = achievements.filter((item) => item.unlocked).length;

  return (
    <>
      <PageHeader
        title="Your progress"
        description="Every number here comes from something you actually completed."
      />

      <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
        <Card className="rounded-2xl border-border/70">
          <CardHeader>
            <CardTitle className="type-card-title">Readiness</CardTitle>
            <CardDescription>
              Weighted across interviews, assessments and coding.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-center">
              <ScoreRing score={readinessScore} label="Overall" />
            </div>

            {improvement !== null && snapshots.length >= 2 ? (
              <p className="rounded-lg border bg-muted/40 p-3 text-center text-sm">
                {improvement > 0 ? (
                  <>
                    You&apos;re up{" "}
                    <span className="font-semibold tabular-nums text-success">
                      {improvement} points
                    </span>{" "}
                    since you started.
                  </>
                ) : improvement < 0 ? (
                  <>
                    You&apos;re down{" "}
                    <span className="font-semibold tabular-nums text-destructive">
                      {Math.abs(improvement)} points
                    </span>{" "}
                    from your first session.
                  </>
                ) : (
                  <>Level with where you started. Keep going.</>
                )}
              </p>
            ) : (
              <p className="rounded-lg border border-dashed p-3 text-center text-sm text-muted-foreground text-pretty">
                Complete a couple more activities and we&apos;ll show how much
                you&apos;ve improved.
              </p>
            )}

            <div className="flex items-center justify-between border-t pt-3 text-sm">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <Flame className="h-4 w-4" aria-hidden="true" />
                Current streak
              </span>
              <span className="font-medium tabular-nums">
                {streak} day{streak === 1 ? "" : "s"}
              </span>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Interview average"
              value={`${totals.interviewAvg}%`}
              icon={Bot}
              hint={`${totals.interviewsCompleted} completed`}
            />
            <StatCard
              label="Assessment average"
              value={`${totals.assessmentAvg}%`}
              icon={ClipboardList}
              hint={`${totals.assessmentsCompleted} completed`}
            />
            <StatCard
              label="Coding acceptance"
              value={`${totals.codingAvg}%`}
              icon={Braces}
              hint={`${totals.problemsSolved} problems solved`}
            />
            <StatCard
              label="Achievements"
              value={`${unlockedCount}/${achievements.length}`}
              icon={Award}
              hint="Earned by real activity"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Card className="rounded-2xl border-border/70">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Target className="h-4 w-4 text-destructive" aria-hidden="true" />
                  Weak areas
                </CardTitle>
              </CardHeader>
              <CardContent>
                {weak.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Nothing under 60% right now.
                  </p>
                ) : (
                  <ul className="space-y-1.5">
                    {weak.slice(0, 5).map((topic) => (
                      <li
                        key={topic.id}
                        className="flex items-center justify-between text-sm"
                      >
                        <span className="truncate">{topic.topic}</span>
                        <span className="tabular-nums text-destructive">
                          {Math.round(topic.averageScore)}%
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card className="rounded-2xl border-border/70">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Award className="h-4 w-4 text-success" aria-hidden="true" />
                  Strong areas
                </CardTitle>
              </CardHeader>
              <CardContent>
                {strong.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Nothing above 75% yet — keep practising.
                  </p>
                ) : (
                  <ul className="space-y-1.5">
                    {strong.slice(0, 5).map((topic) => (
                      <li
                        key={topic.id}
                        className="flex items-center justify-between text-sm"
                      >
                        <span className="truncate">{topic.topic}</span>
                        <span className="tabular-nums text-success">
                          {Math.round(topic.averageScore)}%
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      <ProgressChart data={chartData} />

      <Tabs defaultValue="topics">
        <TabsList>
          <TabsTrigger value="topics">Topic performance</TabsTrigger>
          <TabsTrigger value="achievements">
            Achievements ({unlockedCount}/{achievements.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="topics">
          <Card className="rounded-2xl border-border/70">
            <CardHeader>
              <CardTitle className="type-card-title">Every topic you&apos;ve practised</CardTitle>
              <CardDescription>
                Sorted weakest first — that&apos;s where practice pays off most.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <TopicTable topics={topics} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="achievements">
          <AchievementGrid items={achievements} />
        </TabsContent>
      </Tabs>
    </>
  );
}
