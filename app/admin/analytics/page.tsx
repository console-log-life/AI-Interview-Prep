import type { Metadata } from "next";

import { SignupChart } from "@/components/admin/signup-chart";
import { PageHeader } from "@/components/shared/page-header";
import { ScoreBar } from "@/components/shared/score-bar";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  getPlatformStats,
  getPopularCategories,
  getPopularRoles,
  getSignupTrend,
} from "@/lib/db/queries/admin";
import { prisma } from "@/lib/db/prisma";
import { humanizeEnum } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Analytics",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AdminAnalyticsPage() {
  const [stats, categories, roles, signups, hardestTopics] = await Promise.all([
    getPlatformStats(),
    getPopularCategories(10),
    getPopularRoles(10),
    getSignupTrend(30),
    // Platform-wide topic difficulty — averaged across every student, so it
    // shows where the CONTENT is hard, not who is struggling.
    prisma.topicPerformance.groupBy({
      by: ["topic"],
      _avg: { averageScore: true },
      _count: { _all: true },
      having: { topic: { _count: { gte: 2 } } },
      orderBy: { _avg: { averageScore: "asc" } },
      take: 10,
    }),
  ]);

  return (
    <>
      <PageHeader
        title="Analytics"
        description="Aggregate platform trends. Individual practice content is never exposed."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Total users", value: stats.totalUsers },
          { label: "Active (7 days)", value: stats.activeUsers7d },
          {
            label: "Avg interview score",
            value: `${stats.averageInterviewScore}%`,
          },
          {
            label: "Avg assessment score",
            value: `${stats.averageAssessmentScore}%`,
          },
        ].map((entry) => (
          <Card key={entry.label}>
            <CardContent className="p-5">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {entry.label}
              </p>
              <p className="mt-1.5 text-2xl font-semibold tabular-nums">
                {entry.value}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <SignupChart data={signups} />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Hardest topics platform-wide
            </CardTitle>
            <CardDescription>
              Lowest average scores across all students — useful for spotting
              content that needs better explanations.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {hardestTopics.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Not enough data yet. Topics need at least two students before
                they show up here.
              </p>
            ) : (
              hardestTopics.map((topic) => (
                <ScoreBar
                  key={topic.topic}
                  label={topic.topic}
                  score={topic._avg.averageScore ?? 0}
                  detail={`${Math.round(topic._avg.averageScore ?? 0)}% · ${topic._count._all} student${topic._count._all === 1 ? "" : "s"}`}
                />
              ))
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Category engagement</CardTitle>
            </CardHeader>
            <CardContent>
              {categories.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No attempts recorded yet.
                </p>
              ) : (
                <ul className="divide-y">
                  {categories.map((entry) => (
                    <li
                      key={entry.category}
                      className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
                    >
                      <span className="text-sm">
                        {humanizeEnum(entry.category)}
                      </span>
                      <span className="flex items-center gap-2 text-xs text-muted-foreground">
                        {entry.attempts} attempts
                        <Badge variant="outline">{entry.averageScore}%</Badge>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Target roles</CardTitle>
            </CardHeader>
            <CardContent>
              {roles.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No interviews recorded yet.
                </p>
              ) : (
                <ul className="divide-y">
                  {roles.map((entry) => (
                    <li
                      key={entry.role}
                      className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
                    >
                      <span className="truncate text-sm">{entry.role}</span>
                      <Badge variant="secondary">{entry.count}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
