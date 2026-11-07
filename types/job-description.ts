export type AnalyzeJobDescriptionInput = {
  title: string;
  company?: string;
  rawText: string;
};

export type SkillLevel = "STRONG" | "MEDIUM" | "WEAK" | "MISSING";

export type SkillMatch = {
  skill: string;
  level: SkillLevel;
  score: number;
  note: string;
};

export type RoadmapStep = {
  step: number;
  title: string;
  detail: string;
  estimatedDays: number;
};

export const SKILL_LEVEL_LABELS: Record<SkillLevel, string> = {
  STRONG: "Strong",
  MEDIUM: "Medium",
  WEAK: "Weak",
  MISSING: "Missing",
};
