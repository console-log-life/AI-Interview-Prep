import type { Metadata } from "next";
import Link from "next/link";
import { ClipboardList, Clock, ListChecks } from "lucide-react";

import { PracticeGenerator } from "@/components/assessment/practice-generator";
import { StartAssessmentButton } from "@/components/assessment/start-assessment-button";
import {
  CategoryBadge,
  DifficultyBadge,
} from "@/components/shared/difficulty-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireUserPage } from "@/lib/auth/session";
import {
  listAssessments,
  listUserAttempts,
} from "@/lib/db/queries/assessments";
import { assessmentFilterSchema } from "@/lib/validation/assessment";
import { formatDate, humanizeEnum } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Assessments",
  description: "Timed assessments across 13 categories.",
};

export const dynamic = "force-dynamic";

export default async function AssessmentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requireUserPage("/assessments");
  const raw = await searchParams;

  // Query strings are user input too — parse them, don't trust them.
  const filters = assessmentFilterSchema.safeParse(raw);
  const parsed = filters.success ? filters.data : { page: 1 };

  const [{ items, total, page, totalPages }, recentAttempts] = await Promise.all([
    listAssessments({
      category: parsed.category,
      difficulty: parsed.difficulty,
      search: parsed.q,
      page: parsed.page,
      pageSize: 12,
    }),
    listUserAttempts(user.id, 5),
  ]);

  return (
    <>
      <PageHeader
        title="Assessments"
        description="Timed, auto-graded question sets with a topic-by-topic breakdown."
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <section aria-labelledby="catalogue-heading" className="space-y-4">
          <h2 id="catalogue-heading" className="text-sm font-semibold">
            Assessment catalogue
            {total > 0 && (
              <span className="ml-2 font-normal text-muted-foreground">
                {total} available
              </span>
            )}
          </h2>

          {items.length === 0 ? (
            <EmptyState
              icon={ClipboardList}
              title="No assessments match"
              description="No published assessments were found. Try building a practice set from the question bank instead."
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {items.map((assessment) => (
                <Card key={assessment.id} className="flex flex-col">
                  <CardHeader className="flex-1">
                    <div className="mb-2 flex flex-wrap gap-1.5">
                      <CategoryBadge category={assessment.category} />
                      <DifficultyBadge difficulty={assessment.difficulty} />
                    </div>
                    <CardTitle className="text-base">
                      {assessment.title}
                    </CardTitle>
                    {assessment.description && (
                      <CardDescription className="line-clamp-2">
                        {assessment.description}
                      </CardDescription>
                    )}
                  </CardHeader>
                  <CardContent className="flex items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <ListChecks className="h-3.5 w-3.5" aria-hidden="true" />
                        {assessment._count.questions} questions
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                        {assessment.durationMin} min
                      </span>
                    </div>
                    <StartAssessmentButton assessmentId={assessment.id} />
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {totalPages > 1 && (
            <nav
              aria-label="Assessment pagination"
              className="flex items-center justify-between border-t pt-4"
            >
              <Button
                asChild
                variant="outline"
                size="sm"
                disabled={page <= 1}
                aria-disabled={page <= 1}
              >
                <Link href={`/assessments?page=${Math.max(1, page - 1)}`}>
                  Previous
                </Link>
              </Button>
              <span className="text-sm text-muted-foreground">
                Page {page} of {totalPages}
              </span>
              <Button
                asChild
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                aria-disabled={page >= totalPages}
              >
                <Link
                  href={`/assessments?page=${Math.min(totalPages, page + 1)}`}
                >
                  Next
                </Link>
              </Button>
            </nav>
          )}
        </section>

        <aside className="space-y-6">
          <PracticeGenerator defaultCategory={parsed.category} />

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Your recent attempts</CardTitle>
            </CardHeader>
            <CardContent>
              {recentAttempts.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nothing yet. Your completed attempts will appear here.
                </p>
              ) : (
                <ul className="divide-y">
                  {recentAttempts.map((attempt) => (
                    <li key={attempt.id}>
                      <Link
                        href={`/assessments/${attempt.id}/result`}
                        className="-mx-2 flex items-center justify-between gap-3 rounded-md px-2 py-3 transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">
                            {attempt.assessment.title}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {humanizeEnum(attempt.assessment.category)} ·{" "}
                            {formatDate(attempt.submittedAt)}
                          </p>
                        </div>
                        <Badge
                          variant={attempt.passed ? "success" : "destructive"}
                        >
                          {Math.round(attempt.percentage)}%
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
