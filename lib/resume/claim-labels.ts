import type { ClaimStatus } from "@prisma/client";

/**
 * Client-safe display labels for claim status.
 *
 * Kept out of `lib/resume/claims.ts` because that module is `server-only` —
 * importing it from a client component would pull the Prisma client into the
 * browser bundle.
 */
export const CLAIM_STATUS_LABEL: Record<ClaimStatus, string> = {
  UNVERIFIED: "Not yet discussed",
  VERIFIED: "Explained well",
  PARTIAL: "Partially explained",
  UNCLEAR: "Explanation unclear",
  WEAK: "Weak understanding",
};
