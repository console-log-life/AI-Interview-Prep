import { z } from "zod";

import {
  codeLanguageEnum,
  experienceLevelEnum,
  sanitizedBlock,
  sanitizedText,
} from "./common";

const currentYear = new Date().getFullYear();

const optionalUrl = z
  .string()
  .trim()
  .max(300)
  .optional()
  .or(z.literal(""))
  .transform((value) => (value ? value : undefined))
  .refine(
    (value) => !value || /^https?:\/\/.+\..+/.test(value),
    "Enter a full URL starting with http:// or https://",
  );

export const profileSchema = z.object({
  name: sanitizedText(80, 2),
  headline: sanitizedText(120).optional().or(z.literal("")),
  bio: sanitizedBlock(1000).optional().or(z.literal("")),
  college: sanitizedText(140).optional().or(z.literal("")),
  degree: sanitizedText(120).optional().or(z.literal("")),
  branch: sanitizedText(120).optional().or(z.literal("")),
  graduationYear: z.coerce
    .number()
    .int()
    .min(1970, "That graduation year looks wrong")
    .max(currentYear + 8, "That graduation year is too far ahead)")
    .optional()
    .or(z.literal("").transform(() => undefined)),
  cgpa: z.coerce
    .number()
    .min(0)
    .max(10, "CGPA is on a 0-10 scale")
    .optional()
    .or(z.literal("").transform(() => undefined)),
  experienceLevel: experienceLevelEnum.default("FRESHER"),
  targetRole: sanitizedText(120).optional().or(z.literal("")),
  targetCompanies: z.array(sanitizedText(80, 1)).max(15).default([]),
  preferredLangs: z.array(codeLanguageEnum).max(8).default([]),
  skills: z.array(sanitizedText(60, 1)).max(50).default([]),
  location: sanitizedText(120).optional().or(z.literal("")),
  phone: z
    .string()
    .trim()
    .max(24)
    .optional()
    .or(z.literal(""))
    .refine(
      (value) => !value || /^[+\d][\d\s()-]{6,23}$/.test(value),
      "Enter a valid phone number",
    ),
  githubUrl: optionalUrl,
  linkedinUrl: optionalUrl,
  portfolioUrl: optionalUrl,
});

export type ProfileInput = z.infer<typeof profileSchema>;
