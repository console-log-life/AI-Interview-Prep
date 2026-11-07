import type { NextAuthConfig } from "next-auth";

/**
 * Edge-safe half of the Auth.js configuration.
 *
 * `middleware.ts` runs on the Edge runtime, where Prisma and bcrypt cannot run.
 * So the config is split: this file holds everything the middleware needs
 * (pages, session strategy, token/session callbacks) and `auth.ts` adds the
 * Node-only pieces (Prisma adapter + the Credentials provider).
 */
export const authConfig = {
  trustHost: true,
  pages: {
    signIn: "/login",
    newUser: "/register",
    error: "/login",
  },
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  callbacks: {
    /**
     * Runs on sign-in (with `user`) and on every subsequent request (without).
     * We copy id + role onto the token once so later requests never hit the DB
     * just to know who is asking.
     */
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = user.id as string;
        token.role = (user as { role?: string }).role ?? "STUDENT";
      }
      // `useSession().update()` after a profile edit refreshes the display name.
      if (trigger === "update" && session && typeof session === "object") {
        const next = session as { name?: string; image?: string };
        if (next.name) token.name = next.name;
        if (next.image) token.picture = next.image;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = (token.id as string) ?? token.sub ?? "";
        session.user.role = (token.role as "STUDENT" | "ADMIN") ?? "STUDENT";
      }
      return session;
    },
  },
  providers: [], // populated in auth.ts (Node runtime only)
} satisfies NextAuthConfig;
