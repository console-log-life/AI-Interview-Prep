import { handlers } from "@/auth";

/**
 * Auth.js catch-all endpoint (sign-in, sign-out, session, callbacks).
 * `middleware.ts` deliberately excludes this path from its matcher.
 */
export const { GET, POST } = handlers;
