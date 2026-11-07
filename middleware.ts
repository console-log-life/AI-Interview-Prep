import NextAuth from "next-auth";
import { NextResponse } from "next/server";

import { authConfig } from "@/lib/auth/config";

// Edge-safe instance: `authConfig` deliberately contains no Prisma / bcrypt.
const { auth } = NextAuth(authConfig);

/**
 * Routes that require a signed-in user.
 *
 * Adding a page under `app/(dashboard)` means adding it here too. The list is
 * mirrored in `tests/integration/route-protection.test.ts`, which fails if a
 * new dashboard route is left off.
 */
const PROTECTED_PREFIXES = [
  "/dashboard",
  "/profile",
  "/resume",
  "/interview",
  "/assessments",
  "/coding",
  "/progress",
  "/settings",
  "/job-description",
  "/coach",
  "/roadmap",
  "/skills",
  "/practice",
  "/admin",
];

/** Routes only an ADMIN may open. */
const ADMIN_PREFIXES = ["/admin"];

/** Auth pages a signed-in user should be bounced away from. */
const AUTH_PAGES = ["/login", "/register"];

function matches(pathname: string, prefixes: string[]): boolean {
  return prefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export default auth((req) => {
  const { pathname, search } = req.nextUrl;
  const session = req.auth;
  const isLoggedIn = Boolean(session?.user);
  const role = session?.user?.role;

  if (isLoggedIn && matches(pathname, AUTH_PAGES)) {
    return NextResponse.redirect(new URL("/dashboard", req.nextUrl));
  }

  if (!isLoggedIn && matches(pathname, PROTECTED_PREFIXES)) {
    const loginUrl = new URL("/login", req.nextUrl);
    // Preserve the destination so the user lands where they meant to go.
    loginUrl.searchParams.set("callbackUrl", `${pathname}${search}`);
    return NextResponse.redirect(loginUrl);
  }

  if (isLoggedIn && matches(pathname, ADMIN_PREFIXES) && role !== "ADMIN") {
    return NextResponse.redirect(new URL("/dashboard?error=forbidden", req.nextUrl));
  }

  return NextResponse.next();
});

export const config = {
  // Skip static assets, image optimisation and the auth API itself.
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
