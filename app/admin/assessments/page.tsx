import type { Metadata } from "next";
import Link from "next/link";

import { AssessmentAdminControls } from "@/components/admin/assessment-controls";
import {
  CategoryBadge,
  DifficultyBadge,
} from "@/components/shared/difficulty-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { listAssessments } from "@/lib/db/queries/assessments";
import { ClipboardList } from "lucide-react";

export const metadata: Metadata = {
  title: "Assessments",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AdminAssessmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const params = await searchParams;
  const page = Number(params.page) || 1;

  const { items, total, totalPages } = await listAssessments({
    page,
    pageSize: 25,
    includeUnpublished: true,
  });

  return (
    <>
      <PageHeader
        title="Assessments"
        description={`${total} assessment${total === 1 ? "" : "s"}, including unpublished and auto-generated practice sets.`}
      />

      {items.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="No assessments yet"
          description="Run the seed script to load the starter assessments, or build one from the question bank."
          action={{ label: "Open question bank", href: "/admin/questions" }}
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead className="hidden md:table-cell">Category</TableHead>
              <TableHead>Difficulty</TableHead>
              <TableHead className="hidden sm:table-cell">Questions</TableHead>
              <TableHead className="hidden lg:table-cell">Attempts</TableHead>
              <TableHead className="hidden xl:table-cell">Duration</TableHead>
              <TableHead className="text-right">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((assessment) => (
              <TableRow key={assessment.id}>
                <TableCell className="max-w-[280px]">
                  <p className="truncate text-sm font-medium">
                    {assessment.title}
                  </p>
                  {assessment.isSeed && (
                    <Badge variant="outline" className="mt-1">
                      Demo content
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  <CategoryBadge category={assessment.category} />
                </TableCell>
                <TableCell>
                  <DifficultyBadge difficulty={assessment.difficulty} />
                </TableCell>
                <TableCell className="hidden tabular-nums sm:table-cell">
                  {assessment._count.questions}
                </TableCell>
                <TableCell className="hidden tabular-nums lg:table-cell">
                  {assessment._count.attempts}
                </TableCell>
                <TableCell className="hidden tabular-nums xl:table-cell">
                  {assessment.durationMin} min
                </TableCell>
                <TableCell className="text-right">
                  <AssessmentAdminControls
                    assessmentId={assessment.id}
                    isPublished={assessment.isPublished}
                    attemptCount={assessment._count.attempts}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {totalPages > 1 && (
        <nav
          aria-label="Assessment pagination"
          className="flex items-center justify-between border-t pt-4"
        >
          <Button asChild variant="outline" size="sm" disabled={page <= 1}>
            <Link href={`/admin/assessments?page=${Math.max(1, page - 1)}`}>
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
            <Link
              href={`/admin/assessments?page=${Math.min(totalPages, page + 1)}`}
            >
              Next
            </Link>
          </Button>
        </nav>
      )}
    </>
  );
}
