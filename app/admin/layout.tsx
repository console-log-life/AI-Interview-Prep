import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { AppHeader } from "@/components/layout/app-header";
import { AppNav } from "@/components/layout/app-nav";
import { Logo } from "@/components/layout/logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requireAdminPage } from "@/lib/auth/session";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Third and final gate. The middleware blocks /admin for non-admins, and
  // every admin API route calls `requireAdmin()` — this covers page renders.
  const user = await requireAdminPage();

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-64 shrink-0 border-r bg-muted/20 lg:flex lg:flex-col">
        <div className="flex h-16 items-center gap-2 border-b px-6">
          <Logo href="/dashboard" />
          <Badge variant="outline">Admin</Badge>
        </div>
        <div className="flex-1 overflow-y-auto scrollbar-thin">
          <AppNav isAdmin />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <AppHeader user={user} />
        <main id="main-content" className="flex-1 px-4 py-6 lg:px-8 lg:py-8">
          <div className="mx-auto w-full max-w-7xl space-y-8">
            <Button asChild variant="ghost" size="sm" className="-ml-2">
              <Link href="/dashboard">
                <ArrowLeft aria-hidden="true" />
                Back to student view
              </Link>
            </Button>
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
