export type AppRole = "STUDENT" | "ADMIN";

export type ExperienceLevel = "FRESHER" | "JUNIOR" | "MID" | "SENIOR";

export type CodeLanguage = "PYTHON" | "JAVA" | "CPP" | "JAVASCRIPT";

export const EXPERIENCE_LEVEL_LABELS: Record<ExperienceLevel, string> = {
  FRESHER: "Fresher (0 years)",
  JUNIOR: "Junior (0-2 years)",
  MID: "Mid-level (2-5 years)",
  SENIOR: "Senior (5+ years)",
};

export const LANGUAGE_LABELS: Record<CodeLanguage, string> = {
  PYTHON: "Python",
  JAVA: "Java",
  CPP: "C++",
  JAVASCRIPT: "JavaScript",
};

export type PublicProfile = {
  name: string;
  email: string;
  headline: string | null;
  bio: string | null;
  college: string | null;
  degree: string | null;
  branch: string | null;
  graduationYear: number | null;
  cgpa: number | null;
  experienceLevel: ExperienceLevel;
  targetRole: string | null;
  targetCompanies: string[];
  preferredLangs: CodeLanguage[];
  skills: string[];
  location: string | null;
  phone: string | null;
  githubUrl: string | null;
  linkedinUrl: string | null;
  portfolioUrl: string | null;
};
