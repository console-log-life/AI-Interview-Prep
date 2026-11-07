import { z } from "zod";

import { sanitizedBlock, sanitizedText } from "./common";

export const MAX_RESUME_BYTES = 5 * 1024 * 1024; // 5 MB
export const ALLOWED_RESUME_TYPES = ["application/pdf"] as const;

/**
 * Validates the uploaded file itself. The magic-number check lives in
 * `lib/storage/validate.ts` because it needs the file bytes, not just metadata.
 */
export const resumeUploadMetaSchema = z.object({
  fileName: z
    .string()
    .trim()
    .min(1, "File name is required")
    .max(255)
    .refine((name) => name.toLowerCase().endsWith(".pdf"), "Only PDF files are accepted"),
  sizeBytes: z
    .number()
    .int()
    .positive()
    .max(MAX_RESUME_BYTES, "Resume must be smaller than 5 MB"),
  mimeType: z.enum(ALLOWED_RESUME_TYPES, {
    errorMap: () => ({ message: "Only PDF files are accepted" }),
  }),
});

const educationEntry = z.object({
  degree: z.string().max(160).default(""),
  institution: z.string().max(160).default(""),
  year: z.string().max(40).default(""),
  score: z.string().max(40).default(""),
});

const projectEntry = z.object({
  name: z.string().max(160).default(""),
  description: z.string().max(1200).default(""),
  technologies: z.array(z.string().max(60)).max(30).default([]),
});

const experienceEntry = z.object({
  role: z.string().max(160).default(""),
  organisation: z.string().max(160).default(""),
  duration: z.string().max(80).default(""),
  description: z.string().max(1200).default(""),
});

/**
 * Shape of the AI resume extraction. Also used to validate the user's edits,
 * because the extracted profile is fully editable — we never blindly trust the
 * model's output.
 */
export const resumeAnalysisSchema = z.object({
  fullName: z.string().max(120).default(""),
  email: z.string().max(180).default(""),
  phone: z.string().max(40).default(""),
  summary: z.string().max(2000).default(""),
  yearsExperience: z.number().min(0).max(60).default(0),
  education: z.array(educationEntry).max(15).default([]),
  skills: z.array(z.string().max(60)).max(80).default([]),
  projects: z.array(projectEntry).max(25).default([]),
  experience: z.array(experienceEntry).max(25).default([]),
  internships: z.array(experienceEntry).max(15).default([]),
  certifications: z.array(z.string().max(180)).max(30).default([]),
  achievements: z.array(z.string().max(300)).max(30).default([]),
  technologies: z.array(z.string().max(60)).max(80).default([]),
  strengths: z.array(z.string().max(300)).max(15).default([]),
  gaps: z.array(z.string().max(300)).max(15).default([]),
});

/** Payload from the "edit extracted profile" form. */
export const resumeAnalysisUpdateSchema = z.object({
  fullName: sanitizedText(120).optional().or(z.literal("")),
  email: sanitizedText(180).optional().or(z.literal("")),
  phone: sanitizedText(40).optional().or(z.literal("")),
  summary: sanitizedBlock(2000).optional().or(z.literal("")),
  yearsExperience: z.coerce.number().min(0).max(60).default(0),
  skills: z.array(sanitizedText(60, 1)).max(80).default([]),
  technologies: z.array(sanitizedText(60, 1)).max(80).default([]),
  certifications: z.array(sanitizedText(180, 1)).max(30).default([]),
  achievements: z.array(sanitizedText(300, 1)).max(30).default([]),
  education: z.array(educationEntry).max(15).default([]),
  projects: z.array(projectEntry).max(25).default([]),
  experience: z.array(experienceEntry).max(25).default([]),
  internships: z.array(experienceEntry).max(15).default([]),
});

export type ResumeAnalysis = z.infer<typeof resumeAnalysisSchema>;
export type ResumeAnalysisUpdate = z.infer<typeof resumeAnalysisUpdateSchema>;
