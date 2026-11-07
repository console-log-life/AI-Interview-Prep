import type { NextRequest } from "next/server";

import { ValidationError } from "@/lib/api/errors";
import { ok, route } from "@/lib/api/response";
import { requireUser } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { enforceRateLimit } from "@/lib/rate-limit";
import { uploadResume } from "@/lib/resume/service";

/**
 * POST /api/resume/upload — multipart PDF upload.
 *
 * Validation (size, extension, declared MIME type AND the PDF magic number)
 * happens in `validateResumeUpload` before a single byte is written.
 */
export const POST = route(async (request: NextRequest) => {
  const user = await requireUser();
  enforceRateLimit(
    `resume:upload:${user.id}`,
    env.rateLimit.uploadPerHour,
    60 * 60 * 1000,
  );

  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    throw new ValidationError("No file was uploaded.");
  }

  const resume = await uploadResume(user.id, file);

  return ok(
    {
      id: resume.id,
      fileName: resume.fileName,
      sizeBytes: resume.sizeBytes,
      status: resume.status,
    },
    201,
  );
});

export const runtime = "nodejs";
export const maxDuration = 60;

export const dynamic = "force-dynamic";
