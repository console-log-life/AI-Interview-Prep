import "server-only";
import { randomUUID } from "node:crypto";

import { env } from "@/lib/env";
import { LocalStorageProvider } from "./local";
import { S3StorageProvider } from "./s3";
import type { StorageProvider } from "./types";

let cached: StorageProvider | null = null;

export function getStorage(): StorageProvider {
  if (cached) return cached;

  if (env.storage.provider === "s3") {
    if (
      !env.storage.s3Bucket ||
      !env.storage.s3AccessKeyId ||
      !env.storage.s3SecretAccessKey
    ) {
      throw new Error(
        "STORAGE_PROVIDER=s3 but S3_BUCKET / S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY are not all set.",
      );
    }
    cached = new S3StorageProvider({
      bucket: env.storage.s3Bucket,
      region: env.storage.s3Region,
      accessKeyId: env.storage.s3AccessKeyId,
      secretAccessKey: env.storage.s3SecretAccessKey,
      endpoint: env.storage.s3Endpoint || undefined,
    });
    return cached;
  }

  cached = new LocalStorageProvider(env.storage.localDir);
  return cached;
}

/**
 * Builds a storage key that is namespaced per user and impossible to guess.
 * The original filename is never used in the path — only stored as metadata.
 */
export function buildResumeKey(userId: string, originalName: string): string {
  const ext = originalName.toLowerCase().endsWith(".pdf") ? "pdf" : "bin";
  return `resumes/${userId}/${randomUUID()}.${ext}`;
}

export type { StorageProvider } from "./types";
