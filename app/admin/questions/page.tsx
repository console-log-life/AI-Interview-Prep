import type { Metadata } from "next";
import Link from "next/link";

import { QuestionTable } from "@/components/admin/question-table";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { listQuestions } from "@/lib/db/queries/questions";
import { humanizeEnum } from "@/lib/utils";
import {
  difficultyEnum,
  questionCategoryEnum,
} from "@/lib/validation/common";

export const metadata: Metadata = {
  title: "Question bank",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const CATEGORIES = [
  "DSA", "DBMS", "OOP", "OPERATING_SYSTEMS", "COMPUTER_NETWORKS",
  "JAVA", "PYTHON", "JAVASCRIPT", "APTITUDE", "LOGICAL_REASONING",
  "HR", "BEHAVIORAL", "SYSTEM_DESIGN",
] as const;

export default async function AdminQuestionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;

  const category = questionCategoryEnum.safeParse(params.category);
  const difficulty = difficultyEnum.safeParse(params.difficulty);
  const page = Number(params.page) || 1;

  const { items, total, totalPages } = await listQuestions({
    category: category.success ? category.data : undefined,
    difficulty: difficulty.success ? difficulty.data : undefined,
    search: params.q,
    page,
    pageSize: 25,
  });

  function href(next: Record<string, string | undefined>) {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries({ ...params, ...next })) {
      if (value) search.set(key, value);
    }
    const query = search.toString();
    return query ? `/admin/questions?${query}` : "/admin/questions";
  }

  return (
    <>
      <PageHeader
        title="Question bank"
        description={`${total} question${total === 1 ? "" : "s"} in the bank.`}
      />

      <Card>
        <CardContent className="flex flex-wrap gap-2 p-4">
          <Button
            asChild
            size="sm"
            variant={category.success ? "ghost" : "secondary"}
          >
            <Link href={href({ category: undefined, page: undefined })}>
              All categories
            </Link>
          </Button>
          {CATEGORIES.map((value) => (
            <Button
              key={value}
              asChild
              size="sm"
              variant={
                category.success && category.data === value
                  ? "secondary"
                  : "ghost"
              }
            >
              <Link href={href({ category: value, page: undefined })}>
                {humanizeEnum(value)}
              </Link>
            </Button>
          ))}
        </CardContent>
      </Card>

      <QuestionTable questions={items} />

      {totalPages > 1 && (
        <nav
          aria-label="Question pagination"
          className="flex items-center justify-between border-t pt-4"
        >
          <Button asChild variant="outline" size="sm" disabled={page <= 1}>
            <Link href={href({ page: String(Math.max(1, page - 1)) })}>
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
          >
            <Link href={href({ page: String(Math.min(totalPages, page + 1)) })}>
              Next
            </Link>
          </Button>
        </nav>
      )}
    </>
  );
}
