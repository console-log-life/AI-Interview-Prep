import type { JobDescriptionAnalysis } from "@/lib/validation/job-description";
import type { ResumeAnalysis } from "@/lib/validation/resume";
import type {
  Difficulty,
  ExperienceLevel,
  InterviewType,
  InterviewerPersona,
} from "@/types/interview";

/** Minimal candidate context handed to every prompt. */
export type CandidateContext = {
  name: string;
  targetRole: string;
  experienceLevel: ExperienceLevel;
  skills: string[];
  college?: string | null;
  degree?: string | null;
  graduationYear?: number | null;
  /** Condensed resume summary — never the raw PDF. */
  resumeSummary?: string | null;
  resumeSkills?: string[];
  resumeProjects?: string[];
  /** Condensed job-description requirements. */
  jobRequirements?: string[];
  weakTopics?: string[];
};

export type InterviewSettings = {
  type: InterviewType;
  persona: InterviewerPersona;
  difficulty: Difficulty;
  plannedQuestions: number;
};

export type InterviewTurn = {
  role: "INTERVIEWER" | "CANDIDATE";
  content: string;
  topic?: string | null;
};

export type GenerateQuestionContext = {
  candidate: CandidateContext;
  settings: InterviewSettings;
  transcript: InterviewTurn[];
  /** 1-based index of the question about to be asked. */
  questionNumber: number;
  /** Topics already covered, so the model does not repeat itself. */
  coveredTopics: string[];
  /** Evaluation of the most recent answer, when there is one. */
  lastEvaluation?: AnswerEvaluation | null;
  /**
   * Directive produced by the adaptive engine (`lib/interview/adaptive.ts`).
   * The ENGINE decides what kind of question to ask; the model only writes it.
   * Keeping the decision in code is what makes the adaptivity testable.
   */
  instruction?: string;
  /** Live state, so the prompt can reflect how the candidate is doing. */
  adaptiveState?: {
    difficulty: Difficulty;
    skillEstimate: number;
    masteredTopics: string[];
    strugglingTopics: string[];
  };
};

export type GeneratedQuestion = {
  question: string;
  topic: string;
  isFollowUp: boolean;
  /** Why this question was chosen — logged, not shown to the candidate. */
  rationale: string;
};

export type EvaluateAnswerContext = {
  candidate: CandidateContext;
  settings: InterviewSettings;
  question: string;
  answer: string;
  topic: string;
};

export type AnswerEvaluation = {
  score: number;
  correctness: number | null;
  relevance: number;
  clarity: number;
  technicalDepth: number | null;
  completeness: number | null;
  structure: number | null;
  strengths: string[];
  missingPoints: string[];
  feedback: string;
  improvedAnswer: string;
};

export type EvaluatedTurn = {
  question: string;
  answer: string;
  topic: string;
  evaluation: AnswerEvaluation;
};

export type GenerateReportContext = {
  candidate: CandidateContext;
  settings: InterviewSettings;
  turns: EvaluatedTurn[];
};

/**
 * One strength or weakness, with the answer it came from.
 *
 * `questionIndex` is 1-based over the graded turns, matching the numbering the
 * report prompt shows the model. It is the model's claim about which answer
 * supports the point and is validated before it is stored or rendered — see
 * `lib/interviews/report-evidence.ts`.
 */
export type ReportEvidence = {
  kind: "STRENGTH" | "WEAKNESS";
  point: string;
  questionIndex: number;
};

export type InterviewReportPayload = {
  overallScore: number;
  technicalScore: number;
  communicationScore: number;
  problemSolvingScore: number;
  behavioralScore: number;
  structureScore: number;
  summary: string;
  strengths: string[];
  weaknesses: string[];
  repeatedMistakes: string[];
  recommendations: string[];
  suggestedTopics: string[];
  /**
   * Cited strengths and weaknesses.
   *
   * Additive: `strengths` and `weaknesses` above are unchanged, so a report
   * generated before this existed still renders as a plain list.
   */
  evidence: ReportEvidence[];
};

export type AnalyzeJobDescriptionContext = {
  candidate: CandidateContext;
  title: string;
  company?: string | null;
  rawText: string;
};

export type PerformanceSignal = {
  topic: string;
  averageScore: number;
  attempts: number;
};

export type GenerateRecommendationsContext = {
  candidate: CandidateContext;
  weakTopics: PerformanceSignal[];
  strongTopics: PerformanceSignal[];
  interviewsCompleted: number;
  assessmentsCompleted: number;
  problemsSolved: number;
};

export type AiRecommendation = {
  title: string;
  reason: string;
  topic: string;
  kind: "ASSESSMENT" | "INTERVIEW" | "CODING" | "TOPIC_STUDY" | "RESUME" | "PROFILE";
  priority: "LOW" | "MEDIUM" | "HIGH";
};

// --- V2: resume claims -----------------------------------------------------

export type ExtractedClaim = {
  claimType: "project" | "experience" | "skill" | "achievement";
  text: string;
  technologies: string[];
  /** Questions an interviewer could use to verify this claim. */
  probes: string[];
};

// --- V2: code review -------------------------------------------------------

export type CodeReviewContext = {
  problemTitle: string;
  problemDescription: string;
  language: string;
  code: string;
  /** Verdict from the sandbox, so the reviewer knows if it even passed. */
  verdict: string;
  passedTests: number;
  totalTests: number;
  /** Only requested explicitly — never generated automatically. */
  includeOptimizedApproach: boolean;
};

export type CodeReviewResult = {
  correctness: number;
  timeComplexity: string;
  spaceComplexity: string;
  readability: number;
  maintainability: number;
  efficiency: number;
  summary: string;
  issues: Array<{
    severity: "LOW" | "MEDIUM" | "HIGH";
    title: string;
    detail: string;
    line: number | null;
  }>;
  edgeCases: string[];
  optimizationNotes: string;
  optimizedApproach: string;
  learningPoints: string[];
};

// --- V2: AI coach ----------------------------------------------------------

/**
 * The real, measured facts a coach answer must be grounded in.
 * Passing this explicitly is what stops the coach inventing progress.
 */
export type CoachGrounding = {
  targetRole: string;
  experienceLevel: ExperienceLevel;
  readiness: number;
  confidenceLevel: string;
  interviewsCompleted: number;
  assessmentsCompleted: number;
  problemsSolved: number;
  streakDays: number;
  skills: Array<{ label: string; score: number; confidence: number; trend: number }>;
  weakSkills: Array<{ label: string; score: number }>;
  strongSkills: Array<{ label: string; score: number }>;
  repeatedMistakes: Array<{ label: string; frequency: number; lastSeen: string }>;
  recentActivity: string[];
  hasResume: boolean;
  targetJob?: string | null;
  jobGaps?: string[];
};

export type CoachContext = {
  grounding: CoachGrounding;
  /** Prior turns, oldest first. */
  history: Array<{ role: "user" | "assistant"; content: string }>;
  question: string;
};

export type CoachReply = {
  answer: string;
  /** Concrete next actions the UI turns into real task rows. */
  suggestedTasks: Array<{
    title: string;
    kind: "ASSESSMENT" | "INTERVIEW" | "CODING" | "STUDY" | "RESUME" | "REVIEW";
    topic: string;
    estimatedMin: number;
  }>;
  /** Which grounding facts were used — shown to the user for transparency. */
  citedFacts: string[];
};

// --- V2: roadmap -----------------------------------------------------------

export type RoadmapContext = {
  grounding: CoachGrounding;
  horizonDays: number;
  /** Realistic minutes per day the candidate has. */
  minutesPerDay: number;
};

export type GeneratedRoadmap = {
  title: string;
  summary: string;
  tasks: Array<{
    day: number;
    title: string;
    detail: string;
    kind: "ASSESSMENT" | "INTERVIEW" | "CODING" | "STUDY" | "RESUME" | "REVIEW";
    topic: string;
    estimatedMin: number;
  }>;
};

// --- V2: question generation -----------------------------------------------

export type GenerateQuestionsContext = {
  category: string;
  topic: string;
  difficulty: Difficulty;
  count: number;
  types: string[];
  targetRole: string;
  experienceLevel: ExperienceLevel;
  /** Existing question text, so the model avoids near-duplicates. */
  avoidTexts: string[];
};

export type GeneratedQuestionItem = {
  text: string;
  type: "MCQ" | "MULTI_SELECT" | "TRUE_FALSE" | "SHORT_ANSWER";
  topic: string;
  subtopic: string;
  difficulty: Difficulty;
  cognitiveLevel: "RECALL" | "UNDERSTAND" | "APPLY" | "ANALYSE";
  estimatedTimeSec: number;
  options: Array<{ text: string; isCorrect: boolean }>;
  expectedAnswer: string;
  explanation: string;
  skillsTested: string[];
};

// --- V2: communication analysis --------------------------------------------

export type CommunicationContext = {
  question: string;
  answer: string;
  isBehavioural: boolean;
};

export type CommunicationResult = {
  clarity: number;
  structure: number;
  conciseness: number;
  technicalExplanation: number;
  starCoverage: {
    situation: boolean;
    task: boolean;
    action: boolean;
    result: boolean;
  };
  observations: string[];
  coaching: string;
};

/**
 * The contract every AI provider must satisfy.
 *
 * UI components and route handlers depend on THIS type, never on the Anthropic
 * SDK — swapping providers means writing one new class and one registry line.
 */
export interface AIService {
  readonly providerName: string;
  readonly model: string;

  generateInterviewQuestion(ctx: GenerateQuestionContext): Promise<GeneratedQuestion>;
  generateFollowUpQuestion(ctx: GenerateQuestionContext): Promise<GeneratedQuestion>;
  evaluateInterviewAnswer(ctx: EvaluateAnswerContext): Promise<AnswerEvaluation>;
  generateInterviewReport(ctx: GenerateReportContext): Promise<InterviewReportPayload>;
  analyzeResume(resumeText: string): Promise<ResumeAnalysis>;
  analyzeJobDescription(
    ctx: AnalyzeJobDescriptionContext,
  ): Promise<JobDescriptionAnalysis>;
  generateRecommendations(
    ctx: GenerateRecommendationsContext,
  ): Promise<AiRecommendation[]>;

  // --- V2 -----------------------------------------------------------------
  extractResumeClaims(resumeText: string): Promise<ExtractedClaim[]>;
  reviewCode(ctx: CodeReviewContext): Promise<CodeReviewResult>;
  coach(ctx: CoachContext): Promise<CoachReply>;
  generateRoadmap(ctx: RoadmapContext): Promise<GeneratedRoadmap>;
  generateQuestions(
    ctx: GenerateQuestionsContext,
  ): Promise<GeneratedQuestionItem[]>;
  analyzeCommunication(
    ctx: CommunicationContext,
  ): Promise<CommunicationResult>;
}
