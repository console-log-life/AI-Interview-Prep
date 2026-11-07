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
import { Input } from "@/components/ui/input";
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
  searchParams: Promise<{
    difficulty?: string;
    topic?: string;
    search?: string;
    page?: string;
  }>;
}) {
  const user = await requireUserPage("/coding");
  const params = await searchParams;

  const difficulty =
    params.difficulty === "EASY" ||
    params.difficulty === "MEDIUM" ||
    params.difficulty === "HARD"
      ? params.difficulty
      : undefined;

  const search = params.search?.trim() || undefined;
  const topic = params.topic?.trim() || undefined;

  /**
   * Builds a link that keeps the other filters.
   *
   * With 60 problems the filters are only useful in combination — narrowing to
   * Medium and then losing it when picking a topic is what makes a filter bar
   * feel broken.
   */
  const filterHref = (next: {
    difficulty?: string | null;
    topic?: string | null;
  }): string => {
    const query = new URLSearchParams();
    const nextDifficulty =
      next.difficulty === undefined ? difficulty : next.difficulty;
    const nextTopic = next.topic === undefined ? topic : next.topic;
    if (nextDifficulty) query.set("difficulty", nextDifficulty);
    if (nextTopic) query.set("topic", nextTopic);
    if (search) query.set("search", search);
    const qs = query.toString();
    return qs ? `/coding?${qs}` : "/coding";
  };

  const PAGE_SIZE = 30;
  const page = Math.max(1, Number(params.page) || 1);

  /**
   * Link to another page of results, carrying the filters with it.
   *
   * Separate from `filterHref`, which deliberately drops the page: changing a
   * filter while on page 4 would otherwise land on an empty page of a much
   * shorter result set.
   */
  const pageHref = (target: number): string => {
    const query = new URLSearchParams();
    if (difficulty) query.set("difficulty", difficulty);
    if (topic) query.set("topic", topic);
    if (search) query.set("search", search);
    if (target > 1) query.set("page", String(target));
    const qs = query.toString();
    return qs ? `/coding?${qs}` : "/coding";
  };

  const [{ items, total }, solved, recent, topicRows] = await Promise.all([
    listProblems({
      difficulty,
      topic,
      search,
      page,
      pageSize: PAGE_SIZE,
    }),
    prisma.codingSubmission.findMany({
      where: { userId: user.id, status: "ACCEPTED", isRunOnly: false },
      select: { problemId: true },
      distinct: ["problemId"],
    }),
    listSubmissions(user.id, undefined, 5),
    // Topics come from the bank itself, so the list cannot drift out of date
    // as problems are added.
    prisma.codingProblem.findMany({
      where: { isPublished: true },
      select: { topic: true },
      distinct: ["topic"],
      orderBy: { topic: "asc" },
    }),
  ]);

  const topics = topicRows.map((row) => row.topic);

  const solvedIds = new Set(solved.map((row) => row.problemId));
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

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
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 id="problems-heading" className="type-card-title">
                Problems
                <span className="ml-2 text-sm font-normal text-muted-foreground tabular-nums">
                  {total}
                </span>
              </h2>

              <nav aria-label="Filter by difficulty" className="flex gap-1.5">
                <Button
                  asChild
                  size="sm"
                  variant={!difficulty ? "secondary" : "ghost"}
                  className="rounded-full"
                >
                  <Link href={filterHref({ difficulty: null })}>All</Link>
                </Button>
                {(["EASY", "MEDIUM", "HARD"] as const).map((level) => (
                  <Button
                    key={level}
                    asChild
                    size="sm"
                    variant={difficulty === level ? "secondary" : "ghost"}
                    className="rounded-full"
                  >
                    <Link href={filterHref({ difficulty: level })}>
                      {level.charAt(0) + level.slice(1).toLowerCase()}
                    </Link>
                  </Button>
                ))}
              </nav>
            </div>

            {/*
              A plain GET form, so search works with no client JavaScript and
              no new component. The hidden fields carry the active filters
              through, which is what stops searching from silently clearing
              them.
            */}
            <form method="get" action="/coding" className="flex gap-2" role="search">
              {difficulty && (
                <input type="hidden" name="difficulty" value={difficulty} />
              )}
              {topic && <input type="hidden" name="topic" value={topic} />}
              <label htmlFor="coding-search" className="sr-only">
                Search problems by title
              </label>
              <Input
                id="coding-search"
                type="search"
                name="search"
                defaultValue={search ?? ""}
                placeholder="Search problems by title…"
                className="h-10 rounded-full"
              />
              <Button type="submit" className="h-10 shrink-0 rounded-full px-5">
                Search
              </Button>
              {(search || topic || difficulty) && (
                <Button
                  asChild
                  variant="ghost"
                  className="h-10 shrink-0 rounded-full px-4"
                >
                  <Link href="/coding">Clear</Link>
                </Button>
              )}
            </form>

            <nav aria-label="Filter by topic" className="flex flex-wrap gap-1.5">
              <Button
                asChild
                size="sm"
                variant={!topic ? "secondary" : "ghost"}
                className="h-7 rounded-full px-3 text-xs"
              >
                <Link href={filterHref({ topic: null })}>All topics</Link>
              </Button>
              {topics.map((name) => (
                <Button
                  key={name}
                  asChild
                  size="sm"
                  variant={topic === name ? "secondary" : "ghost"}
                  className="h-7 rounded-full px-3 text-xs"
                >
                  <Link href={filterHref({ topic: name })}>{name}</Link>
                </Button>
              ))}
            </nav>
          </div>

          {items.length === 0 ? (
            <EmptyState
              icon={Braces}
              title="No problems found"
              description={
                search || topic || difficulty
                  ? "Nothing matches those filters. Try clearing one of them."
                  : "No published problems yet. Run the seed script to load the problem set."
              }
              action={
                search || topic || difficulty
                  ? { label: "Clear filters", href: "/coding" }
                  : undefined
              }
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

          {/*
            Pagination. The query already supported a page; nothing rendered a
            way to reach one, so with a bank this size most of the problems
            were simply unreachable.
          */}
          {totalPages > 1 && (
            <nav
              aria-label="Problem pages"
              className="flex items-center justify-between gap-3"
            >
              <Button
                asChild={page > 1}
                variant="outline"
                size="sm"
                disabled={page === 1}
                className="rounded-full"
              >
                {page > 1 ? (
                  <Link href={pageHref(page - 1)} rel="prev">
                    Previous
                  </Link>
                ) : (
                  <span>Previous</span>
                )}
              </Button>

              <p aria-live="polite" className="text-sm text-muted-foreground">
                Page <span className="tabular-nums">{page}</span> of{" "}
                <span className="tabular-nums">{totalPages}</span>
              </p>

              <Button
                asChild={page < totalPages}
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                className="rounded-full"
              >
                {page < totalPages ? (
                  <Link href={pageHref(page + 1)} rel="next">
                    Next
                  </Link>
                ) : (
                  <span>Next</span>
                )}
              </Button>
            </nav>
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
