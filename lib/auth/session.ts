import "server-only";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { ForbiddenError, UnauthorizedError } from "@/lib/api/errors";
import type { AppRole } from "@/types/user";

export type SessionUser = {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  role: AppRole;
};

/** Returns the signed-in user, or null. Never throws. */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const session = await auth();
  if (!session?.user?.id) return null;
  return {
    id: session.user.id,
    email: session.user.email ?? "",
    name: session.user.name ?? null,
    image: session.user.image ?? null,
    role: (session.user.role as AppRole) ?? "STUDENT",
  };
}

/**
 * For API routes / server actions: throws a typed 401 that `handleRouteError`
 * turns into a clean JSON response.
 */
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new UnauthorizedError();
  return user;
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "ADMIN") {
    throw new ForbiddenError("This area is restricted to administrators.");
  }
  return user;
}

/**
 * For server components: redirects to /login instead of throwing, so the user
 * gets a page rather than an error boundary.
 */
export async function requireUserPage(callbackUrl?: string): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) {
    const target = callbackUrl
      ? `/login?callbackUrl=${encodeURIComponent(callbackUrl)}`
      : "/login";
    redirect(target);
  }
  return user;
}

export async function requireAdminPage(): Promise<SessionUser> {
  const user = await requireUserPage("/admin");
  if (user.role !== "ADMIN") redirect("/dashboard?error=forbidden");
  return user;
}
