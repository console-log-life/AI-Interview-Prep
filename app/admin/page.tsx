import type { Metadata } from "next";
import Link from "next/link";
import {
  Bot,
  Braces,
  ClipboardList,
  FileText,
  TrendingUp,
  UserPlus,
  Users,
} from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
} from "@/lib/db/queries/admin";
import { humanizeEnum } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Admin overview",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AdminOverviewPage() {
  const [stats, categories, roles] = await Promise.all([
    getPlatformStats(),
    getPopularCategories(6),
    getPopularRoles(6),
  ]);

  return (
    <>
      <PageHeader
        title="Platform overview"
        description="Aggregate activity across every account. No private practice content is shown here."
      />

      <section aria-labelledby="admin-stats" className="space-y-4">
        <h2 id="admin-stats" className="sr-only">
          Platform statistics
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Total users" value={stats.totalUsers} icon={Users} />
          <StatCard
            label="New (30 days)"
            value={stats.newUsers30d}
            icon={UserPlus}
          />
          <StatCard
            label="Active (7 days)"
            value={stats.activeUsers7d}
            icon={TrendingUp}
            hint="Users with recorded practice"
          />
          <StatCard
            label="Resumes analysed"
            value={stats.resumesAnalyzed}
            icon={FileText}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <StatCard
            label="Interviews completed"
            value={stats.interviewsCompleted}
            icon={Bot}
            hint={`Average score ${stats.averageInterviewScore}%`}
          />
          <StatCard
            label="Assessments completed"
            value={stats.assessmentsCompleted}
            icon={ClipboardList}
            hint={`Average score ${stats.averageAssessmentScore}%`}
          />
          <StatCard
            label="Coding submissions"
            value={stats.codingSubmissions}
            icon={Braces}
          />
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="rounded-2xl border-border/70">
          <CardHeader>
            <CardTitle className="type-card-title">Popular categories</CardTitle>
            <CardDescription>
              By attempts, with the average score students achieved.
            </CardDescription>
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
                    className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                  >
                    <span className="text-sm font-medium">
                      {humanizeEnum(entry.category)}
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        {entry.attempts} attempt
                        {entry.attempts === 1 ? "" : "s"}
                      </span>
                      <Badge
                        variant={
                          entry.averageScore >= 70
                            ? "success"
                            : entry.averageScore >= 50
                              ? "warning"
                              : "destructive"
                        }
                      >
                        {entry.averageScore}%
                      </Badge>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-border/70">
          <CardHeader>
            <CardTitle className="type-card-title">Popular target roles</CardTitle>
            <CardDescription>
              What students are actually preparing for.
            </CardDescription>
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
                    className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                  >
                    <span className="truncate text-sm font-medium">
                      {entry.role}
                    </span>
                    <Badge variant="secondary">
                      {entry.count} interview{entry.count === 1 ? "" : "s"}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-2xl border-border/70">
        <CardHeader>
          <CardTitle className="type-card-title">Content library</CardTitle>
          <CardDescription>What students can currently practise.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          {[
            {
              label: "Active questions",
              value: stats.totalQuestions,
              href: "/admin/questions",
              cta: "Manage questions",
            },
            {
              label: "Published assessments",
              value: stats.totalAssessments,
              href: "/admin/assessments",
              cta: "Manage assessments",
            },
            {
              label: "Coding problems",
              value: stats.totalProblems,
              href: "/coding",
              cta: "View problems",
            },
          ].map((entry) => (
            <div key={entry.label} className="rounded-lg border p-4">
              <p className="text-xs text-muted-foreground">{entry.label}</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">
                {entry.value}
              </p>
              <Button
                asChild
                variant="link"
                size="sm"
                className="mt-1 h-auto px-0"
              >
                <Link href={entry.href}>{entry.cta}</Link>
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>
    </>
  );
}
