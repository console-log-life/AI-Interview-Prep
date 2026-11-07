import { NextResponse } from "next/server";

import { NotFoundError } from "@/lib/api/errors";
import { route } from "@/lib/api/response";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { getStorage } from "@/lib/storage";

/**
 * GET /api/resume/[id]/download
 *
 * Resume files are NEVER served from a public directory. Every download is
 * authenticated and ownership-checked here, then streamed through the app
 * (or redirected to a short-lived signed URL when the provider offers one).
 */
export const GET = route(
  async (
    _request: Request,
    context: { params: Promise<{ id: string }> },
  ) => {
    const user = await requireUser();
    const { id } = await context.params;

    const resume = await prisma.resume.findFirst({
      where: { id, userId: user.id },
      select: { storageKey: true, fileName: true, mimeType: true },
    });
    if (!resume) throw new NotFoundError("We could not find that resume.");

    const storage = getStorage();

    const signedUrl = await storage.getSignedUrl(resume.storageKey, 120);
    if (signedUrl) return NextResponse.redirect(signedUrl);

    const buffer = await storage.get(resume.storageKey);

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": resume.mimeType,
        // `attachment` + a quoted filename prevents the PDF being rendered
        // inline in a context where it could execute embedded scripts.
        "Content-Disposition": `attachment; filename="${resume.fileName.replace(/"/g, "")}"`,
        "Content-Length": String(buffer.length),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  },
);

export const runtime = "nodejs";

export const dynamic = "force-dynamic";
