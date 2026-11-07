import type { Metadata } from "next";
import Link from "next/link";
import { Bot, ShieldCheck } from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { listInterviewActivity } from "@/lib/db/queries/admin";
import { formatDateTime, humanizeEnum } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Interview activity",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const STATUS_VARIANT: Record<
  string,
  "success" | "warning" | "destructive" | "secondary"
> = {
  COMPLETED: "success",
  IN_PROGRESS: "warning",
  STARTED: "warning",
  PAUSED: "secondary",
  FAILED: "destructive",
};

export default async function AdminInterviewsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const params = await searchParams;
  const page = Number(params.page) || 1;

  const { items, total, totalPages } = await listInterviewActivity({
    page,
    pageSize: 25,
  });

  return (
    <>
      <PageHeader
        title="Interview activity"
        description={`${total} interview${total === 1 ? "" : "s"} run on the platform.`}
      />

      <Alert variant="info">
        <ShieldCheck aria-hidden="true" />
        <AlertTitle>Metadata only</AlertTitle>
        <AlertDescription>
          This view deliberately shows configuration and scores, never
          transcripts. A student&apos;s questions and answers are their private
          practice data and are not readable from the admin panel.
        </AlertDescription>
      </Alert>

      {items.length === 0 ? (
        <EmptyState
          icon={Bot}
          title="No interviews yet"
          description="Interview sessions run by students will appear here."
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Student</TableHead>
              <TableHead className="hidden lg:table-cell">Target role</TableHead>
              <TableHead className="hidden sm:table-cell">Type</TableHead>
              <TableHead className="hidden xl:table-cell">Persona</TableHead>
              <TableHead className="hidden md:table-cell">Answers</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Score</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((interview) => (
              <TableRow key={interview.id}>
                <TableCell>
                  <p className="text-sm font-medium">
                    {interview.user.name ?? "—"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {interview.user.email}
                  </p>
                </TableCell>
                <TableCell className="hidden max-w-[180px] truncate text-sm lg:table-cell">
                  {interview.targetRole}
                </TableCell>
                <TableCell className="hidden sm:table-cell">
                  <Badge variant="secondary">
                    {humanizeEnum(interview.type)}
                  </Badge>
                </TableCell>
                <TableCell className="hidden text-sm text-muted-foreground xl:table-cell">
                  {humanizeEnum(interview.persona)}
                </TableCell>
                <TableCell className="hidden tabular-nums md:table-cell">
                  {interview._count.evaluations}
                </TableCell>
                <TableCell>
                  <Badge variant={STATUS_VARIANT[interview.status] ?? "secondary"}>
                    {humanizeEnum(interview.status)}
                  </Badge>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatDateTime(interview.createdAt)}
                  </p>
                </TableCell>
                <TableCell className="text-right">
                  {interview.report ? (
                    <Badge
                      variant={
                        interview.report.overallScore >= 75
                          ? "success"
                          : interview.report.overallScore >= 50
                            ? "warning"
                            : "destructive"
                      }
                    >
                      {interview.report.overallScore}
                    </Badge>
                  ) : (
                    <span className="text-sm text-muted-foreground">—</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {totalPages > 1 && (
        <nav
          aria-label="Interview pagination"
          className="flex items-center justify-between border-t pt-4"
        >
          <Button asChild variant="outline" size="sm" disabled={page <= 1}>
            <Link href={`/admin/interviews?page=${Math.max(1, page - 1)}`}>
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
              href={`/admin/interviews?page=${Math.min(totalPages, page + 1)}`}
            >
              Next
            </Link>
          </Button>
        </nav>
      )}
    </>
  );
}
