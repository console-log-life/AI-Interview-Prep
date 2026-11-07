import bcrypt from "bcryptjs";

const SALT_ROUNDS = 12;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

export async function verifyPassword(
  plain: string,
  hash: string | null | undefined,
): Promise<boolean> {
  if (!hash) {
    // Constant-ish work even when the account has no password, so that a
    // missing account and a wrong password take a similar amount of time.
    await bcrypt.hash(plain, SALT_ROUNDS);
    return false;
  }
  return bcrypt.compare(plain, hash);
}
