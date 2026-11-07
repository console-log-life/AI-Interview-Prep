import type { Metadata } from "next";
import Link from "next/link";

import { UserRoleControls } from "@/components/admin/user-role-controls";
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
import { requireAdminPage } from "@/lib/auth/session";
import { listUsers } from "@/lib/db/queries/admin";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Users",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; role?: string; page?: string }>;
}) {
  const admin = await requireAdminPage();
  const params = await searchParams;

  const role =
    params.role === "ADMIN" || params.role === "STUDENT" ? params.role : undefined;
  const page = Number(params.page) || 1;

  const { items, total, totalPages } = await listUsers({
    search: params.q,
    role,
    page,
    pageSize: 25,
  });

  return (
    <>
      <PageHeader
        title="Users"
        description={`${total} account${total === 1 ? "" : "s"}. Activity counts only — no private practice content.`}
      />

      <nav aria-label="Filter by role" className="flex gap-2">
        <Button asChild size="sm" variant={!role ? "secondary" : "ghost"}>
          <Link href="/admin/users">All</Link>
        </Button>
        <Button asChild size="sm" variant={role === "STUDENT" ? "secondary" : "ghost"}>
          <Link href="/admin/users?role=STUDENT">Students</Link>
        </Button>
        <Button asChild size="sm" variant={role === "ADMIN" ? "secondary" : "ghost"}>
          <Link href="/admin/users?role=ADMIN">Admins</Link>
        </Button>
      </nav>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>User</TableHead>
            <TableHead className="hidden lg:table-cell">Target role</TableHead>
            <TableHead className="hidden xl:table-cell">Joined</TableHead>
            <TableHead className="hidden md:table-cell">Activity</TableHead>
            <TableHead>Role</TableHead>
            <TableHead className="text-right">Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((user) => (
            <TableRow key={user.id}>
              <TableCell>
                <p className="text-sm font-medium">{user.name ?? "—"}</p>
                <p className="text-xs text-muted-foreground">{user.email}</p>
              </TableCell>
              <TableCell className="hidden text-sm text-muted-foreground lg:table-cell">
                {user.profile?.targetRole ?? "—"}
              </TableCell>
              <TableCell className="hidden text-sm text-muted-foreground xl:table-cell">
                {formatDate(user.createdAt)}
              </TableCell>
              <TableCell className="hidden md:table-cell">
                <div className="flex gap-1.5 text-xs text-muted-foreground">
                  <span>{user._count.interviews} int</span>
                  <span>·</span>
                  <span>{user._count.assessmentAttempts} asm</span>
                  <span>·</span>
                  <span>{user._count.codingSubmissions} sub</span>
                </div>
              </TableCell>
              <TableCell>
                {user.id === admin.id ? (
                  <Badge>You</Badge>
                ) : (
                  <UserRoleControls
                    userId={user.id}
                    role={user.role}
                    isActive={user.isActive}
                  />
                )}
              </TableCell>
              <TableCell className="text-right">
                <Badge variant={user.isActive ? "success" : "destructive"}>
                  {user.isActive ? "Active" : "Suspended"}
                </Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {totalPages > 1 && (
        <nav
          aria-label="User pagination"
          className="flex items-center justify-between border-t pt-4"
        >
          <Button asChild variant="outline" size="sm" disabled={page <= 1}>
            <Link href={`/admin/users?page=${Math.max(1, page - 1)}`}>
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
            <Link href={`/admin/users?page=${Math.min(totalPages, page + 1)}`}>
              Next
            </Link>
          </Button>
        </nav>
      )}
    </>
  );
}
