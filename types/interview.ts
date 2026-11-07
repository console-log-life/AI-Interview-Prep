export type Difficulty = "EASY" | "MEDIUM" | "HARD";

export type ExperienceLevel = "FRESHER" | "JUNIOR" | "MID" | "SENIOR";

export type InterviewType =
  | "HR"
  | "TECHNICAL"
  | "BEHAVIORAL"
  | "CODING"
  | "MIXED"
  | "SYSTEM_DESIGN";

export type InterviewerPersona =
  | "FRIENDLY"
  | "PROFESSIONAL"
  | "STRICT"
  | "STRESS";

export type InterviewStatus =
  | "STARTED"
  | "IN_PROGRESS"
  | "PAUSED"
  | "COMPLETED"
  | "FAILED";

export type MessageRole = "INTERVIEWER" | "CANDIDATE" | "SYSTEM";

export const INTERVIEW_TYPE_LABELS: Record<InterviewType, string> = {
  HR: "HR round",
  TECHNICAL: "Technical",
  BEHAVIORAL: "Behavioural",
  CODING: "Coding discussion",
  MIXED: "Mixed",
  SYSTEM_DESIGN: "System design",
};

export const INTERVIEW_TYPE_DESCRIPTIONS: Record<InterviewType, string> = {
  HR: "Motivation, culture fit, career goals and salary expectations.",
  TECHNICAL: "Core CS fundamentals and role-specific technical depth.",
  BEHAVIORAL: "Past situations scored against the STAR structure.",
  CODING: "Talk-through of algorithms, complexity and trade-offs.",
  MIXED: "A realistic blend of technical, behavioural and HR questions.",
  SYSTEM_DESIGN: "Architecture, scaling, data modelling and trade-offs.",
};

export const PERSONA_LABELS: Record<InterviewerPersona, string> = {
  FRIENDLY: "Friendly",
  PROFESSIONAL: "Professional",
  STRICT: "Strict",
  STRESS: "Stress interview",
};

export const PERSONA_DESCRIPTIONS: Record<InterviewerPersona, string> = {
  FRIENDLY: "Warm and encouraging. Good for your first few sessions.",
  PROFESSIONAL: "Neutral and business-like. The default company experience.",
  STRICT: "Terse and demanding. Presses hard on vague answers.",
  STRESS: "Rapid, sceptical follow-ups that test composure under pressure.",
};

/** Client-visible message shape. */
export type InterviewMessageDTO = {
  id: string;
  role: MessageRole;
  content: string;
  order: number;
  isQuestion: boolean;
  isFollowUp: boolean;
  topic: string | null;
  createdAt: string;
};

export type InterviewStateDTO = {
  id: string;
  status: InterviewStatus;
  targetRole: string;
  type: InterviewType;
  persona: InterviewerPersona;
  difficulty: Difficulty;
  plannedQuestions: number;
  questionsAsked: number;
  answersGiven: number;
  durationMin: number;
  startedAt: string;
  completedAt: string | null;
  messages: InterviewMessageDTO[];
};
