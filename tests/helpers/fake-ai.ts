import type {
  AIService,
  AnswerEvaluation,
  CoachContext,
  CoachReply,
  CodeReviewContext,
  CodeReviewResult,
  CommunicationContext,
  CommunicationResult,
  ExtractedClaim,
  GenerateQuestionContext,
  GenerateQuestionsContext,
  GeneratedQuestion,
  GeneratedQuestionItem,
  GeneratedRoadmap,
  RoadmapContext,
} from "@/types/ai";

/**
 * Deterministic in-memory `AIService`.
 *
 * The point of the provider abstraction is that the entire application can be
 * exercised without an API key or a network call. This fake is that proof —
 * every test that touches AI behaviour runs against it.
 */

export function makeEvaluation(
  overrides: Partial<AnswerEvaluation> = {},
): AnswerEvaluation {
  return {
    rubricNotes: {
      correctness: "Fake note: the facts checked out.",
      clarity: "Fake note: followed on first listen.",
    },
    score: 7,
    correctness: 7,
    relevance: 8,
    clarity: 7,
    technicalDepth: 6,
    completeness: 6,
    structure: 6,
    strengths: ["Clear explanation"],
    missingPoints: [],
    feedback: "Reasonable answer.",
    improvedAnswer: "A tidier version of the same answer.",
    ...overrides,
  };
}

export class FakeAIService implements AIService {
  readonly providerName = "fake";
  readonly model = "fake-model-1";

  questionCalls: GenerateQuestionContext[] = [];
  followUpCalls: GenerateQuestionContext[] = [];
  coachCalls: CoachContext[] = [];
  reviewCalls: CodeReviewContext[] = [];
  evaluation: AnswerEvaluation = makeEvaluation();

  async generateInterviewQuestion(
    ctx: GenerateQuestionContext,
  ): Promise<GeneratedQuestion> {
    this.questionCalls.push(ctx);
    return {
      question: `Question ${ctx.questionNumber} about ${ctx.candidate.targetRole}`,
      topic: `Topic ${ctx.questionNumber}`,
      isFollowUp: false,
      rationale: "fake",
    };
  }

  async generateFollowUpQuestion(
    ctx: GenerateQuestionContext,
  ): Promise<GeneratedQuestion> {
    this.followUpCalls.push(ctx);
    return {
      question: "Can you be more specific about that?",
      topic: ctx.coveredTopics.at(-1) ?? "Follow-up",
      isFollowUp: true,
      rationale: "fake",
    };
  }

  async evaluateInterviewAnswer(): Promise<AnswerEvaluation> {
    return this.evaluation;
  }

  async generateInterviewReport() {
    return {
      overallScore: 70,
      technicalScore: 68,
      communicationScore: 75,
      problemSolvingScore: 66,
      behavioralScore: 72,
      structureScore: 64,
      summary: "Fake summary.",
      strengths: [],
      weaknesses: [],
      repeatedMistakes: [],
      recommendations: [],
      suggestedTopics: [],
      evidence: [],
    };
  }

  async analyzeResume() {
    return {
      fullName: "",
      email: "",
      phone: "",
      summary: "",
      yearsExperience: 0,
      education: [],
      skills: [],
      projects: [],
      experience: [],
      internships: [],
      certifications: [],
      achievements: [],
      technologies: [],
      strengths: [],
      gaps: [],
    };
  }

  async analyzeJobDescription() {
    return {
      requiredSkills: [],
      preferredSkills: [],
      technologies: [],
      responsibilities: [],
      keywords: [],
      experienceReq: "",
      skillMatch: [],
      missingSkills: [],
      matchScore: 0,
      roadmap: [],
      suggestedTopics: [],
    };
  }

  async generateRecommendations() {
    return [];
  }

  // --- V2 -----------------------------------------------------------------

  async extractResumeClaims(): Promise<ExtractedClaim[]> {
    return [
      {
        claimType: "project",
        text: "Built a REST API using Node.js",
        technologies: ["Node.js", "REST"],
        probes: ["Why REST rather than GraphQL?", "How did you handle auth?"],
      },
    ];
  }

  async reviewCode(ctx: CodeReviewContext): Promise<CodeReviewResult> {
    this.reviewCalls.push(ctx);
    return {
      correctness: ctx.passedTests === ctx.totalTests ? 100 : 40,
      timeComplexity: "O(n)",
      spaceComplexity: "O(1)",
      readability: 80,
      maintainability: 75,
      efficiency: 70,
      summary: "Fake review.",
      issues: [
        {
          severity: "MEDIUM",
          title: "Recomputes length in the loop",
          detail: "Hoist the length out of the loop condition.",
          line: 4,
        },
      ],
      edgeCases: ["Empty input"],
      optimizationNotes: "Use a hash map to avoid the nested scan.",
      // Honours the request flag, exactly like the real provider.
      optimizedApproach: ctx.includeOptimizedApproach ? "def solve(): ..." : "",
      learningPoints: ["Hash maps"],
    };
  }

  async coach(ctx: CoachContext): Promise<CoachReply> {
    this.coachCalls.push(ctx);
    return {
      answer: `Your readiness is ${ctx.grounding.readiness}/100.`,
      suggestedTasks: [
        { title: "Drill SQL joins", kind: "ASSESSMENT", topic: "SQL joins", estimatedMin: 20 },
      ],
      citedFacts: [`readiness=${ctx.grounding.readiness}`],
    };
  }

  async generateRoadmap(ctx: RoadmapContext): Promise<GeneratedRoadmap> {
    return {
      title: `${ctx.horizonDays}-day plan`,
      summary: "Fake plan.",
      tasks: Array.from({ length: Math.min(ctx.horizonDays, 3) }, (_, index) => ({
        day: index + 1,
        title: `Day ${index + 1} task`,
        detail: "Fake detail.",
        kind: "STUDY" as const,
        topic: "SQL",
        estimatedMin: 30,
      })),
    };
  }

  async generateQuestions(
    ctx: GenerateQuestionsContext,
  ): Promise<GeneratedQuestionItem[]> {
    return Array.from({ length: ctx.count }, (_, index) => ({
      text: `Generated question ${index + 1} about ${ctx.topic}?`,
      type: "MCQ" as const,
      topic: ctx.topic,
      subtopic: ctx.topic,
      difficulty: ctx.difficulty,
      cognitiveLevel: "UNDERSTAND" as const,
      estimatedTimeSec: 60,
      options: [
        { text: "Correct option", isCorrect: true },
        { text: "Wrong option A", isCorrect: false },
        { text: "Wrong option B", isCorrect: false },
        { text: "Wrong option C", isCorrect: false },
      ],
      expectedAnswer: "",
      explanation: "Because that is how it works.",
      skillsTested: [ctx.topic],
    }));
  }

  async analyzeCommunication(
    ctx: CommunicationContext,
  ): Promise<CommunicationResult> {
    return {
      clarity: 7,
      structure: ctx.isBehavioural ? 5 : 7,
      conciseness: 6,
      technicalExplanation: 7,
      starCoverage: {
        situation: true,
        task: true,
        action: false,
        result: false,
      },
      observations: ["Long opening sentence."],
      coaching: "Lead with the outcome.",
    };
  }
}
