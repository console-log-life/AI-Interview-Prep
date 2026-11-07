import { ValidationError } from "@/lib/api/errors";
import {
  MAX_RESUME_BYTES,
  resumeUploadMetaSchema,
} from "@/lib/validation/resume";

const PDF_MAGIC = Buffer.from("%PDF-");

export type ValidatedUpload = {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  buffer: Buffer;
};

/**
 * Validates an uploaded resume.
 *
 * Metadata alone is not trustworthy — a browser will happily send
 * `Content-Type: application/pdf` for any file — so the real check is the
 * PDF magic number in the first bytes.
 */
export async function validateResumeUpload(file: File): Promise<ValidatedUpload> {
  if (file.size > MAX_RESUME_BYTES) {
    throw new ValidationError("Resume must be smaller than 5 MB.");
  }
  if (file.size === 0) {
    throw new ValidationError("That file is empty.");
  }

  // Strip any directory component a client might have smuggled in.
  const fileName = file.name.split(/[\\/]/).pop() ?? "resume.pdf";

  const meta = resumeUploadMetaSchema.safeParse({
    fileName,
    sizeBytes: file.size,
    mimeType: file.type || "application/pdf",
  });
  if (!meta.success) {
    throw new ValidationError(
      meta.error.issues[0]?.message ?? "That file could not be accepted.",
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  if (!buffer.subarray(0, PDF_MAGIC.length).equals(PDF_MAGIC)) {
    throw new ValidationError(
      "That file is not a valid PDF. Please export your resume as a PDF and try again.",
    );
  }

  return {
    fileName: meta.data.fileName,
    mimeType: "application/pdf",
    sizeBytes: file.size,
    buffer,
  };
}
