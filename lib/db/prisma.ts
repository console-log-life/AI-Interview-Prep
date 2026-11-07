import { PrismaClient } from "@prisma/client";

/**
 * A single PrismaClient per process.
 *
 * Next.js dev-mode hot reload re-evaluates modules, which would otherwise open
 * a new connection pool on every edit and exhaust Postgres connections.
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["warn", "error"]
        : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
