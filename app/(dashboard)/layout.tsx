import { AppHeader } from "@/components/layout/app-header";
import { Sidebar } from "@/components/layout/sidebar";
import { requireUserPage } from "@/lib/auth/session";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Server-side guard. The middleware also blocks these routes, but this
  // second check means a page can never render for an anonymous user even if
  // the matcher is ever misconfigured — defence in depth.
  const user = await requireUserPage();

  return (
    <div className="flex min-h-screen">
      <Sidebar isAdmin={user.role === "ADMIN"} />

      <div className="flex min-w-0 flex-1 flex-col">
        <AppHeader user={user} />
        <main
          id="main-content"
          className="flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8"
        >
          <div className="mx-auto w-full max-w-6xl space-y-6 lg:space-y-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
