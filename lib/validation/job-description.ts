import { z } from "zod";

import { sanitizedBlock, sanitizedText } from "./common";

export const analyzeJobDescriptionSchema = z.object({
  title: sanitizedText(140, 2),
  company: sanitizedText(140).optional().or(z.literal("")),
  rawText: sanitizedBlock(20_000, 80),
});

const skillLevel = z.enum(["STRONG", "MEDIUM", "WEAK", "MISSING"]);

const skillMatchEntry = z.object({
  skill: z.string().max(80),
  level: skillLevel,
  /** 0-100 — how well the candidate covers this requirement. */
  score: z.number().min(0).max(100).default(0),
  note: z.string().max(400).default(""),
});

const roadmapStep = z.object({
  step: z.number().int().min(1).max(20),
  title: z.string().max(160),
  detail: z.string().max(800).default(""),
  estimatedDays: z.number().int().min(1).max(120).default(3),
});

/** Shape the AI must return for a job-description analysis. */
export const jobDescriptionAnalysisSchema = z.object({
  requiredSkills: z.array(z.string().max(80)).max(40).default([]),
  preferredSkills: z.array(z.string().max(80)).max(40).default([]),
  technologies: z.array(z.string().max(80)).max(40).default([]),
  responsibilities: z.array(z.string().max(400)).max(25).default([]),
  keywords: z.array(z.string().max(60)).max(50).default([]),
  experienceReq: z.string().max(200).default(""),
  skillMatch: z.array(skillMatchEntry).max(40).default([]),
  missingSkills: z.array(z.string().max(80)).max(40).default([]),
  matchScore: z.number().min(0).max(100).default(0),
  roadmap: z.array(roadmapStep).max(20).default([]),
  suggestedTopics: z.array(z.string().max(80)).max(20).default([]),
});

export type JobDescriptionAnalysis = z.infer<typeof jobDescriptionAnalysisSchema>;
export type SkillMatchEntry = z.infer<typeof skillMatchEntry>;
export type RoadmapStep = z.infer<typeof roadmapStep>;
