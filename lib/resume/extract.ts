import "server-only";

import { AppError } from "@/lib/api/errors";

/**
 * PDF → plain text.
 *
 * `unpdf` is a serverless-friendly build of pdf.js; it is loaded dynamically so
 * the (large) wasm/worker bundle is only pulled in when a resume is actually
 * processed, not on every cold start.
 */
export async function extractPdfText(buffer: Buffer): Promise<string> {
  let raw: string;
  try {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    const { text } = await extractText(pdf, { mergePages: true });
    raw = Array.isArray(text) ? text.join("\n") : text;
  } catch (error) {
    console.error("[resume] PDF text extraction failed:", error);
    throw new AppError(
      "We could not read that PDF. If it is a scanned image, please upload a text-based PDF instead.",
      { status: 422, code: "pdf_unreadable" },
    );
  }

  const cleaned = normalizeResumeText(raw);

  if (cleaned.length < 80) {
    throw new AppError(
      "We couldn't find any readable text in that PDF. Scanned or image-only resumes can't be analysed — please upload a text-based PDF.",
      { status: 422, code: "pdf_no_text" },
    );
  }

  return cleaned;
}

/**
 * PDF extraction produces ragged whitespace and stray control characters.
 * Normalising here keeps the AI prompt clean and the token count honest.
 */
export function normalizeResumeText(raw: string): string {
  return (
    raw
      .replace(/\r\n/g, "\n")
      // Strip Unicode control characters, keeping only tab and newline.
      .replace(/\p{Cc}/gu, (ch) => (ch === "\n" || ch === "\t" ? ch : ""))
      .replace(/[ \t]{2,}/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .split("\n")
      .map((line) => line.trim())
      .join("\n")
      .trim()
  );
}
