/**
 * Storage abstraction for user-uploaded files.
 *
 * Resume PDFs are binary blobs that would bloat Postgres, break backups and
 * slow every query on the table, so they live behind this interface instead.
 */
export interface StorageProvider {
  readonly name: string;

  /** Persists bytes and returns the provider-scoped key to store in the DB. */
  put(args: {
    key: string;
    body: Buffer;
    contentType: string;
  }): Promise<{ key: string }>;

  get(key: string): Promise<Buffer>;

  delete(key: string): Promise<void>;

  /**
   * A time-limited URL for direct download, when the provider supports one.
   * `null` means "stream it through the app instead".
   */
  getSignedUrl(key: string, expiresInSec?: number): Promise<string | null>;
}
