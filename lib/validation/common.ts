import { z } from "zod";

export const cuidSchema = z.string().min(1, "Required").max(64);

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type Pagination = z.infer<typeof paginationSchema>;

export const questionCategoryEnum = z.enum([
  "DSA",
  "DBMS",
  "OOP",
  "OPERATING_SYSTEMS",
  "COMPUTER_NETWORKS",
  "JAVA",
  "PYTHON",
  "JAVASCRIPT",
  "APTITUDE",
  "LOGICAL_REASONING",
  "HR",
  "BEHAVIORAL",
  "SYSTEM_DESIGN",
]);

export const questionTypeEnum = z.enum([
  "MCQ",
  "MULTI_SELECT",
  "TRUE_FALSE",
  "SHORT_ANSWER",
  "CODING",
  "BEHAVIORAL",
  "TECHNICAL",
]);

export const difficultyEnum = z.enum(["EASY", "MEDIUM", "HARD"]);

export const experienceLevelEnum = z.enum([
  "FRESHER",
  "JUNIOR",
  "MID",
  "SENIOR",
]);

export const interviewTypeEnum = z.enum([
  "HR",
  "TECHNICAL",
  "BEHAVIORAL",
  "CODING",
  "MIXED",
  "SYSTEM_DESIGN",
]);

export const personaEnum = z.enum([
  "FRIENDLY",
  "PROFESSIONAL",
  "STRICT",
  "STRESS",
]);

export const codeLanguageEnum = z.enum([
  "PYTHON",
  "JAVA",
  "CPP",
  "JAVASCRIPT",
]);

/** Trim, collapse whitespace, and cap length on any free-text user input. */
export function sanitizedText(max: number, min = 0) {
  return z
    .string()
    .transform((value) => value.replace(/\s+/g, " ").trim())
    .pipe(z.string().min(min).max(max));
}

/** Like `sanitizedText` but preserves newlines (for essays / code / JD text). */
export function sanitizedBlock(max: number, min = 0) {
  return z
    .string()
    .transform((value) =>
      value
        .replace(/\r\n/g, "\n")
        .replace(/[ \t]+$/gm, "")
        .trim(),
    )
    .pipe(z.string().min(min).max(max));
}
