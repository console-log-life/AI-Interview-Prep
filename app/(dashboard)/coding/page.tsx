import type { Metadata } from "next";
import Link from "next/link";
import { Braces, CheckCircle2 } from "lucide-react";

import { DifficultyBadge } from "@/components/shared/difficulty-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { ServiceNotice } from "@/components/shared/service-notice";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUserPage } from "@/lib/auth/session";
import { executionAvailable } from "@/lib/coding";
import { listProblems, listSubmissions } from "@/lib/coding/service";
import { prisma } from "@/lib/db/prisma";
import { relativeTime } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Coding practice",
  description: "Coding problems with sample and hidden test cases.",
};

export const dynamic = "force-dynamic";

export default async function CodingPage({
  searchParams,
}: {
  searchParams: Promise<{ difficulty?: string; topic?: string; page?: string }>;
}) {
  const user = await requireUserPage("/coding");
  const params = await searchParams;

  const difficulty =
    params.difficulty === "EASY" ||
    params.difficulty === "MEDIUM" ||
    params.difficulty === "HARD"
      ? params.difficulty
      : undefined;

  const [{ items, total }, solved, recent] = await Promise.all([
    listProblems({
      difficulty,
      topic: params.topic,
      page: Number(params.page) || 1,
      pageSize: 30,
    }),
    prisma.codingSubmission.findMany({
      where: { userId: user.id, status: "ACCEPTED", isRunOnly: false },
      select: { problemId: true },
      distinct: ["problemId"],
    }),
    listSubmissions(user.id, undefined, 5),
  ]);

  const solvedIds = new Set(solved.map((row) => row.problemId));

  return (
    <>
      <PageHeader
        title="Coding practice"
        description="Write, run and submit solutions in Python, Java, C++ or JavaScript."
        actions={
          <Badge variant="outline">
            {solvedIds.size} solved of {total}
          </Badge>
        }
      />

      {!executionAvailable() && (
        <ServiceNotice
          title="Code execution is not configured"
          message="Problems and the editor work, but Run and Submit need a sandbox. See the README for the one-command Judge0 Docker setup."
          envHint={
            'CODE_EXECUTION_PROVIDER="judge0"\nJUDGE0_URL="http://localhost:2358"'
          }
        />
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <section aria-labelledby="problems-heading" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="problems-heading" className="text-sm font-semibold">
              Problems
            </h2>
            <nav aria-label="Filter by difficulty" className="flex gap-1.5">
              <Button
                asChild
                size="sm"
                variant={!difficulty ? "secondary" : "ghost"}
              >
                <Link href="/coding">All</Link>
              </Button>
              {(["EASY", "MEDIUM", "HARD"] as const).map((level) => (
                <Button
                  key={level}
                  asChild
                  size="sm"
                  variant={difficulty === level ? "secondary" : "ghost"}
                >
                  <Link href={`/coding?difficulty=${level}`}>
                    {level.charAt(0) + level.slice(1).toLowerCase()}
                  </Link>
                </Button>
              ))}
            </nav>
          </div>

          {items.length === 0 ? (
            <EmptyState
              icon={Braces}
              title="No problems found"
              description="No published problems match that filter. Run the seed script to load the starter problem set."
            />
          ) : (
            <ul className="divide-y rounded-lg border">
              {items.map((problem) => (
                <li key={problem.id}>
                  <Link
                    href={`/coding/${problem.slug}`}
                    className="flex flex-wrap items-center justify-between gap-3 p-4 transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      {solvedIds.has(problem.id) ? (
                        <CheckCircle2
                          className="h-4 w-4 shrink-0 text-success"
                          aria-label="Solved"
                        />
                      ) : (
                        <span
                          className="h-4 w-4 shrink-0 rounded-full border"
                          aria-label="Not solved"
                        />
                      )}
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {problem.title}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {problem.topic}
                        </p>
                      </div>
                    </div>
                    <DifficultyBadge difficulty={problem.difficulty} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <aside>
          <Card className="rounded-2xl border-border/70">
            <CardHeader>
              <CardTitle className="type-card-title">Recent submissions</CardTitle>
            </CardHeader>
            <CardContent>
              {recent.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nothing submitted yet.
                </p>
              ) : (
                <ul className="divide-y">
                  {recent.map((submission) => (
                    <li key={submission.id}>
                      <Link
                        href={`/coding/${submission.problem.slug}`}
                        className="-mx-2 flex items-center justify-between gap-3 rounded-md px-2 py-3 transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm">
                            {submission.problem.title}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {relativeTime(submission.createdAt)}
                          </p>
                        </div>
                        <Badge
                          variant={
                            submission.status === "ACCEPTED"
                              ? "success"
                              : "destructive"
                          }
                        >
                          {submission.passedTests}/{submission.totalTests}
                        </Badge>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </aside>
      </div>
    </>
  );
}
