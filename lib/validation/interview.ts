import { z } from "zod";

import {
  cuidSchema,
  difficultyEnum,
  experienceLevelEnum,
  interviewTypeEnum,
  personaEnum,
  sanitizedBlock,
  sanitizedText,
} from "./common";

export const createInterviewSchema = z.object({
  targetRole: sanitizedText(120, 2),
  experienceLevel: experienceLevelEnum.default("FRESHER"),
  type: interviewTypeEnum.default("MIXED"),
  persona: personaEnum.default("PROFESSIONAL"),
  difficulty: difficultyEnum.default("MEDIUM"),
  durationMin: z.coerce.number().int().min(5).max(90).default(20),
  plannedQuestions: z.coerce.number().int().min(3).max(20).default(6),
  useResume: z.boolean().default(false),
  jobDescriptionId: cuidSchema.optional().or(z.literal("")),
});

export const interviewMessageSchema = z.object({
  answer: sanitizedBlock(8000, 1),
});

export const completeInterviewSchema = z.object({
  /** Set when the user ends early rather than answering every question. */
  endedEarly: z.boolean().default(false),
});

export type CreateInterviewInput = z.infer<typeof createInterviewSchema>;
export type InterviewMessageInput = z.infer<typeof interviewMessageSchema>;
