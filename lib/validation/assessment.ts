import { z } from "zod";

import {
  cuidSchema,
  difficultyEnum,
  questionCategoryEnum,
  questionTypeEnum,
  sanitizedBlock,
  sanitizedText,
} from "./common";

/** Payload for generating an ad-hoc practice assessment. */
export const startAssessmentSchema = z.object({
  category: questionCategoryEnum,
  difficulty: difficultyEnum.optional(),
  questionCount: z.coerce.number().int().min(5).max(50).default(10),
  durationMin: z.coerce.number().int().min(5).max(180).default(20),
});

/** Autosave of a single answer while the attempt is running. */
export const saveAnswerSchema = z.object({
  questionId: cuidSchema,
  selectedOptions: z.array(cuidSchema).max(10).default([]),
  textAnswer: sanitizedBlock(4000).optional().or(z.literal("")),
  markedForReview: z.boolean().default(false),
  timeSpentSec: z.coerce.number().int().min(0).max(86_400).default(0),
});

export const submitAssessmentSchema = z.object({
  /** Optional final flush of answers so a fast submit never loses the last one. */
  answers: z.array(saveAnswerSchema).max(200).default([]),
  timeSpentSec: z.coerce.number().int().min(0).max(86_400).default(0),
  /** True when the client timer expired rather than the user clicking submit. */
  autoSubmitted: z.boolean().default(false),
});

export const assessmentFilterSchema = z.object({
  category: questionCategoryEnum.optional(),
  difficulty: difficultyEnum.optional(),
  q: sanitizedText(80).optional(),
  page: z.coerce.number().int().min(1).default(1),
});

// --- Admin CRUD -------------------------------------------------------------

const optionSchema = z.object({
  id: cuidSchema.optional(),
  text: sanitizedBlock(600, 1),
  isCorrect: z.boolean().default(false),
});

export const questionUpsertSchema = z
  .object({
    text: sanitizedBlock(4000, 10),
    category: questionCategoryEnum,
    topic: sanitizedText(80, 2),
    difficulty: difficultyEnum,
    type: questionTypeEnum,
    expectedAnswer: sanitizedBlock(4000).optional().or(z.literal("")),
    explanation: sanitizedBlock(4000).optional().or(z.literal("")),
    skillsTested: z.array(sanitizedText(60, 1)).max(20).default([]),
    tags: z.array(sanitizedText(40, 1)).max(20).default([]),
    points: z.coerce.number().int().min(1).max(20).default(1),
    isActive: z.boolean().default(true),
    options: z.array(optionSchema).max(10).default([]),
  })
  .superRefine((data, ctx) => {
    const needsOptions =
      data.type === "MCQ" ||
      data.type === "MULTI_SELECT" ||
      data.type === "TRUE_FALSE";

    if (!needsOptions) {
      if (!data.expectedAnswer) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["expectedAnswer"],
          message: "Open-ended questions need a reference answer",
        });
      }
      return;
    }

    if (data.options.length < 2) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["options"],
        message: "Add at least two options",
      });
      return;
    }

    const correct = data.options.filter((option) => option.isCorrect).length;
    if (correct === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["options"],
        message: "Mark at least one option as correct",
      });
    }
    if (data.type !== "MULTI_SELECT" && correct > 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["options"],
        message: "Single-answer questions can only have one correct option",
      });
    }
    if (data.type === "TRUE_FALSE" && data.options.length !== 2) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["options"],
        message: "True/False questions must have exactly two options",
      });
    }
  });

export const assessmentUpsertSchema = z.object({
  title: sanitizedText(140, 3),
  description: sanitizedBlock(1000).optional().or(z.literal("")),
  category: questionCategoryEnum,
  difficulty: difficultyEnum,
  durationMin: z.coerce.number().int().min(5).max(180).default(20),
  passPercentage: z.coerce.number().int().min(0).max(100).default(60),
  isPublished: z.boolean().default(true),
  questionIds: z.array(cuidSchema).min(1, "Pick at least one question").max(100),
});

export type StartAssessmentInput = z.infer<typeof startAssessmentSchema>;
export type SaveAnswerInput = z.infer<typeof saveAnswerSchema>;
export type SubmitAssessmentInput = z.infer<typeof submitAssessmentSchema>;
export type QuestionUpsertInput = z.infer<typeof questionUpsertSchema>;
export type AssessmentUpsertInput = z.infer<typeof assessmentUpsertSchema>;
