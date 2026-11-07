import "server-only";
import type { Prisma } from "@prisma/client";

import { getAIService } from "@/lib/ai";
import { NotFoundError } from "@/lib/api/errors";
import { prisma } from "@/lib/db/prisma";
import { addUserSkills } from "@/lib/db/queries/profile";
import { recordActivity } from "@/lib/progress/service";
import { refreshRecommendations } from "@/lib/recommendations/service";
import { buildResumeKey, getStorage } from "@/lib/storage";
import { validateResumeUpload } from "@/lib/storage/validate";
import { extractPdfText } from "@/lib/resume/extract";
import type { ResumeAnalysisUpdate } from "@/lib/validation/resume";

/**
 * Resume pipeline:
 *   upload → storage → text extraction → AI analysis → editable profile → DB
 *
 * Each stage updates `Resume.status`, so a failure at any point leaves a row
 * the UI can explain ("failed at extraction") instead of a silent dead end.
 */

export async function uploadResume(userId: string, file: File) {
  const validated = await validateResumeUpload(file);

  const storage = getStorage();
  const key = buildResumeKey(userId, validated.fileName);
  await storage.put({
    key,
    body: validated.buffer,
    contentType: validated.mimeType,
  });

  // Newest upload becomes the primary resume used by interviews.
  await prisma.resume.updateMany({
    where: { userId, isPrimary: true },
    data: { isPrimary: false },
  });

  const resume = await prisma.resume.create({
    data: {
      userId,
      fileName: validated.fileName,
      storageKey: key,
      mimeType: validated.mimeType,
      sizeBytes: validated.sizeBytes,
      status: "UPLOADED",
      isPrimary: true,
    },
  });

  await recordActivity(userId, "RESUME");
  return resume;
}

/**
 * Extracts text and runs the AI analysis.
 *
 * Split from `uploadResume` on purpose: the upload should succeed quickly and
 * the analysis (which is slow and can fail) is a separate, retryable step.
 */
export async function analyzeResume(userId: string, resumeId: string) {
  const resume = await prisma.resume.findFirst({
    where: { id: resumeId, userId },
  });
  if (!resume) throw new NotFoundError("We could not find that resume.");

  await prisma.resume.update({
    where: { id: resumeId },
    data: { status: "PROCESSING", errorMessage: null },
  });

  try {
    let text = resume.extractedText;
    if (!text) {
      const buffer = await getStorage().get(resume.storageKey);
      text = await extractPdfText(buffer);
      await prisma.resume.update({
        where: { id: resumeId },
        data: { extractedText: text },
      });
    }

    const ai = getAIService();
    const analysis = await ai.analyzeResume(text);

    const data = {
      fullName: analysis.fullName || null,
      email: analysis.email || null,
      phone: analysis.phone || null,
      summary: analysis.summary || null,
      yearsExperience: analysis.yearsExperience,
      education: analysis.education as unknown as Prisma.InputJsonValue,
      skills: analysis.skills as unknown as Prisma.InputJsonValue,
      projects: analysis.projects as unknown as Prisma.InputJsonValue,
      experience: analysis.experience as unknown as Prisma.InputJsonValue,
      internships: analysis.internships as unknown as Prisma.InputJsonValue,
      certifications: analysis.certifications as unknown as Prisma.InputJsonValue,
      achievements: analysis.achievements as unknown as Prisma.InputJsonValue,
      technologies: analysis.technologies as unknown as Prisma.InputJsonValue,
      strengths: analysis.strengths as unknown as Prisma.InputJsonValue,
      gaps: analysis.gaps as unknown as Prisma.InputJsonValue,
      modelUsed: ai.model,
      userVerified: false,
    };

    await prisma.resumeAnalysis.upsert({
      where: { resumeId },
      create: { resumeId, ...data },
      update: data,
    });

    await prisma.resume.update({
      where: { id: resumeId },
      data: { status: "ANALYZED" },
    });

    // Merge (never replace) extracted skills into the profile — the user's own
    // list is authoritative, this only adds what they forgot to type.
    const skills = [...analysis.skills, ...analysis.technologies].slice(0, 60);
    if (skills.length > 0) await addUserSkills(userId, skills);

    await refreshRecommendations(userId);

    return prisma.resumeAnalysis.findUniqueOrThrow({ where: { resumeId } });
  } catch (error) {
    await prisma.resume.update({
      where: { id: resumeId },
      data: {
        status: "FAILED",
        errorMessage:
          error instanceof Error
            ? error.message
            : "Resume analysis failed. Please try again.",
      },
    });
    throw error;
  }
}

/**
 * Saves the user's corrections to the extracted profile.
 *
 * This is why `userVerified` exists: AI extraction is a starting point, and a
 * human-reviewed profile is marked as such so the UI can stop nagging.
 */
export async function updateResumeAnalysis(
  userId: string,
  resumeId: string,
  input: ResumeAnalysisUpdate,
) {
  const resume = await prisma.resume.findFirst({
    where: { id: resumeId, userId },
    include: { analysis: true },
  });
  if (!resume?.analysis) {
    throw new NotFoundError("That resume has not been analysed yet.");
  }

  return prisma.resumeAnalysis.update({
    where: { resumeId },
    data: {
      fullName: input.fullName || null,
      email: input.email || null,
      phone: input.phone || null,
      summary: input.summary || null,
      yearsExperience: input.yearsExperience,
      skills: input.skills as unknown as Prisma.InputJsonValue,
      technologies: input.technologies as unknown as Prisma.InputJsonValue,
      certifications: input.certifications as unknown as Prisma.InputJsonValue,
      achievements: input.achievements as unknown as Prisma.InputJsonValue,
      education: input.education as unknown as Prisma.InputJsonValue,
      projects: input.projects as unknown as Prisma.InputJsonValue,
      experience: input.experience as unknown as Prisma.InputJsonValue,
      internships: input.internships as unknown as Prisma.InputJsonValue,
      userVerified: true,
    },
  });
}

export async function deleteResume(userId: string, resumeId: string) {
  const resume = await prisma.resume.findFirst({
    where: { id: resumeId, userId },
  });
  if (!resume) throw new NotFoundError("We could not find that resume.");

  // Storage first: an orphaned DB row is easier to spot than an orphaned blob.
  await getStorage().delete(resume.storageKey);
  await prisma.resume.delete({ where: { id: resumeId } });
}

export async function getResumes(userId: string) {
  return prisma.resume.findMany({
    where: { userId },
    include: { analysis: true },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "desc" }],
  });
}

export async function getPrimaryResume(userId: string) {
  return prisma.resume.findFirst({
    where: { userId },
    include: { analysis: true },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "desc" }],
  });
}
