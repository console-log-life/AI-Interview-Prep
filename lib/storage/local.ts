import "server-only";
import fs from "node:fs/promises";
import path from "node:path";

import { NotFoundError } from "@/lib/api/errors";
import type { StorageProvider } from "./types";

/**
 * Filesystem provider — the zero-config default.
 *
 * Good for local development and a viva demo. For a real deployment on
 * serverless infrastructure, switch STORAGE_PROVIDER to "s3": the interface is
 * identical so no calling code changes.
 */
export class LocalStorageProvider implements StorageProvider {
  readonly name = "local";
  private readonly root: string;

  constructor(rootDir: string) {
    this.root = path.resolve(process.cwd(), rootDir);
  }

  /**
   * Resolve a caller-supplied key inside the storage root and refuse anything
   * that escapes it. Keys are generated server-side, but this check means a
   * bug elsewhere can never turn into arbitrary filesystem access.
   */
  private resolve(key: string): string {
    const target = path.resolve(this.root, key);
    const rootWithSep = this.root.endsWith(path.sep)
      ? this.root
      : this.root + path.sep;
    if (target !== this.root && !target.startsWith(rootWithSep)) {
      throw new Error("Invalid storage key");
    }
    return target;
  }

  async put({
    key,
    body,
  }: {
    key: string;
    body: Buffer;
    contentType: string;
  }): Promise<{ key: string }> {
    const target = this.resolve(key);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, body);
    return { key };
  }

  async get(key: string): Promise<Buffer> {
    try {
      return await fs.readFile(this.resolve(key));
    } catch {
      throw new NotFoundError("That file is no longer available.");
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await fs.unlink(this.resolve(key));
    } catch {
      // Deleting something that is already gone is a success, not an error.
    }
  }

  async getSignedUrl(): Promise<string | null> {
    // Local files are streamed through an authenticated route handler instead.
    return null;
  }
}
