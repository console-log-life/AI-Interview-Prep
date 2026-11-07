/**
 * Server startup checks.
 *
 * Next runs `register` once per server process, before the first request. It is
 * the only place a configuration problem can be reported *as* a startup
 * problem — anywhere else it surfaces as a Prisma or Auth.js error partway
 * through a page the candidate was already using, naming a library instead of
 * the line to add to `.env`.
 *
 * Deliberately the only thing here: a startup hook that does real work is a
 * startup hook that can fail for reasons that have nothing to do with
 * configuration.
 */
export async function register(): Promise<void> {
  // The Edge runtime loads this too, where `process.env` holds only what was
  // inlined at build time — a check there would report variables as missing
  // that are present on the server.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { missingRequiredEnv, missingEnvMessage } = await import("@/lib/env");

  const missing = missingRequiredEnv();
  if (missing.length === 0) return;

  /**
   * Logged, then thrown.
   *
   * `next dev` prints a thrown error from here without the formatting that
   * makes a multi-line message readable, and this message is a checklist — so
   * it goes to the console as itself first.
   */
  console.error(`\n${missingEnvMessage(missing)}\n`);
  throw new Error(`Missing required environment variable(s): ${missing.join(", ")}`);
}
