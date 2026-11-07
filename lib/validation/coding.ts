import { z } from "zod";

import { codeLanguageEnum, sanitizedBlock } from "./common";

export const MAX_CODE_LENGTH = 60_000;

export const runCodeSchema = z.object({
  language: codeLanguageEnum,
  code: z
    .string()
    .min(1, "Write some code first")
    .max(MAX_CODE_LENGTH, "Your solution is too long"),
  /** Ad-hoc stdin from the "Custom input" box. */
  stdin: sanitizedBlock(10_000).optional().or(z.literal("")),
});

export const submitCodeSchema = z.object({
  language: codeLanguageEnum,
  code: z
    .string()
    .min(1, "Write some code first")
    .max(MAX_CODE_LENGTH, "Your solution is too long"),
});

export type RunCodeInput = z.infer<typeof runCodeSchema>;
export type SubmitCodeInput = z.infer<typeof submitCodeSchema>;
