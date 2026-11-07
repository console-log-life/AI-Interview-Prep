import "server-only";
import type { z } from "zod";

import { AIError } from "@/lib/api/errors";
import { env } from "@/lib/env";
import {
  evaluationJsonSchema,
  evaluationResponseSchema,
  jobDescriptionJsonSchema,
  questionJsonSchema,
  questionResponseSchema,
  recommendationsJsonSchema,
  recommendationsResponseSchema,
  reportJsonSchema,
  reportResponseSchema,
  resumeJsonSchema,
} from "@/lib/ai/schemas";
import {
  evaluationPrompt,
  evaluationSystemPrompt,
  followUpPrompt,
  interviewSystemPrompt,
  jobDescriptionPrompt,
  jobDescriptionSystemPrompt,
  nextQuestionPrompt,
  recommendationsPrompt,
  recommendationsSystemPrompt,
  reportPrompt,
  reportSystemPrompt,
  resumePrompt,
  resumeSystemPrompt,
} from "@/lib/ai/prompts";
import {
  claimsJsonSchema,
  claimsResponseSchema,
  coachJsonSchema,
  coachResponseSchema,
  codeReviewJsonSchema,
  codeReviewResponseSchema,
  communicationJsonSchema,
  communicationResponseSchema,
  questionsJsonSchema,
  questionsResponseSchema,
  roadmapJsonSchema,
  roadmapResponseSchema,
} from "@/lib/ai/schemas-v2";
import {
  claimsPrompt,
  claimsSystemPrompt,
  coachPrompt,
  coachSystemPrompt,
  codeReviewPrompt,
  codeReviewSystemPrompt,
  communicationPrompt,
  communicationSystemPrompt,
  questionsPrompt,
  questionsSystemPrompt,
  roadmapPrompt,
  roadmapSystemPrompt,
} from "@/lib/ai/prompts-v2";
import { recordAiUsage } from "@/lib/ai/observability";
import { jobDescriptionAnalysisSchema } from "@/lib/validation/job-description";
import { resumeAnalysisSchema } from "@/lib/validation/resume";
import type {
  AIService,
  AiRecommendation,
  AnalyzeJobDescriptionContext,
  AnswerEvaluation,
  CoachContext,
  CoachReply,
  CodeReviewContext,
  CodeReviewResult,
  CommunicationContext,
  CommunicationResult,
  EvaluateAnswerContext,
  ExtractedClaim,
  GenerateQuestionContext,
  GenerateQuestionsContext,
  GenerateRecommendationsContext,
  GenerateReportContext,
  GeneratedQuestion,
  GeneratedQuestionItem,
  GeneratedRoadmap,
  InterviewReportPayload,
  RoadmapContext,
} from "@/types/ai";
import type { JobDescriptionAnalysis } from "@/lib/validation/job-description";
import type { ResumeAnalysis } from "@/lib/validation/resume";

/**
 * Provider-agnostic half of the AI layer.
 *
 * Every capability lives here exactly once. A provider supplies only
 * `complete()` — the raw "send these instructions, get JSON text back" call —
 * so the prompt construction, JSON-Schema constraining, Zod validation,
 * business post-processing and telemetry are guaranteed identical across
 * providers. Duplicating thirteen method bodies per provider is how the two
 * would silently drift apart.
 *
 * The trust boundary is unchanged: JSON Schema constrains generation, Zod
 * decides what is allowed to reach the database.
 */

export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

const VALID_EFFORTS: Effort[] = ["low", "medium", "high", "xhigh", "max"];

export function resolveEffort(): Effort {
  const configured = env.ai.effort as Effort;
  return VALID_EFFORTS.includes(configured) ? configured : "low";
}

/** What a provider is asked to do. */
export type CompletionRequest = {
  system: string;
  prompt: string;
  /** Standard JSON Schema; a provider may adapt it to its own dialect. */
  jsonSchema: Record<string, unknown>;
  maxTokens: number;
  effort: Effort;
};

/** What a provider must return. */
export type CompletionResult = {
  /** Raw JSON text. Parsing and validation happen in the base class. */
  text: string;
  inputTokens: number | null;
  outputTokens: number | null;
  /**
   * True when a safety classifier declined the request. Providers signal this
   * rather than throwing, because it arrives as a successful HTTP response and
   * needs a different user-facing message from a transport failure.
   */
  refused: boolean;
};

export type ProviderErrorCategory =
  | "rate_limit"
  | "auth"
  | "timeout"
  | "quota"
  | "transport";

/**
 * A failed provider call, already classified.
 *
 * Providers throw this instead of their SDK's own error type so the base class
 * can log a consistent category and pick a message without knowing which SDK
 * it is talking to. `userMessage` is safe to show; the original error is never
 * forwarded to the client.
 */
export class ProviderRequestError extends Error {
  constructor(
    readonly category: ProviderErrorCategory,
    readonly userMessage: string,
    readonly cause?: unknown,
  ) {
    super(userMessage);
    this.name = "ProviderRequestError";
  }
}

export abstract class BaseAIService implements AIService {
  abstract readonly providerName: string;
  abstract readonly model: string;

  protected readonly effort: Effort = resolveEffort();

  /**
   * The one provider-specific operation: send the request, return JSON text.
   *
   * Implementations must throw `ProviderRequestError` for failures and set
   * `refused` for safety declines. They must not parse or validate — that is
   * the base class's job, and doing it twice is how the two providers would
   * end up enforcing different rules.
   */
  protected abstract complete(
    request: CompletionRequest,
  ): Promise<CompletionResult>;

  /**
   * One request → JSON constrained by `jsonSchema` → validated by `zodSchema`.
   */
  protected async structured<T>(args: {
    system: string;
    prompt: string;
    jsonSchema: Record<string, unknown>;
    // Input is `unknown` because we hand it freshly-parsed JSON — writing
    // `z.ZodType<T>` would force the schema's INPUT type to equal T too, which
    // breaks for any schema using `.default()`.
    zodSchema: z.ZodType<T, z.ZodTypeDef, unknown>;
    maxTokens?: number;
    effort?: Effort;
    /** Feature name for the observability log. */
    feature?: string;
  }): Promise<T> {
    const startedAt = Date.now();
    const feature = args.feature ?? "unknown";

    let response: CompletionResult;
    try {
      response = await this.complete({
        system: args.system,
        prompt: args.prompt,
        jsonSchema: args.jsonSchema,
        maxTokens: args.maxTokens ?? 4096,
        effort: args.effort ?? this.effort,
      });
    } catch (error) {
      // The provider already classified this. Nothing about the underlying
      // error — which can quote a URL or a header — reaches the client.
      const category =
        error instanceof ProviderRequestError ? error.category : "transport";
      console.error(`[ai] ${this.providerName} request failed:`, error);

      recordAiUsage({
        feature,
        provider: this.providerName,
        model: this.model,
        latencyMs: Date.now() - startedAt,
        success: false,
        validationOk: false,
        errorCategory: category,
      });

      throw new AIError(
        error instanceof ProviderRequestError ? error.userMessage : undefined,
      );
    }

    const latencyMs = Date.now() - startedAt;
    const usage = {
      inputTokens: response.inputTokens,
      outputTokens: response.outputTokens,
    };

    const logFailure = (errorCategory: string) =>
      recordAiUsage({
        feature,
        provider: this.providerName,
        model: this.model,
        latencyMs,
        success: false,
        validationOk: errorCategory !== "validation",
        errorCategory,
        ...usage,
      });

    // Safety classifiers can decline a request; that arrives as a normal 200.
    if (response.refused) {
      logFailure("refusal");
      throw new AIError(
        "The AI declined to answer that request. Try rephrasing your input.",
      );
    }

    if (!response.text.trim()) {
      logFailure("empty_response");
      throw new AIError("The AI returned an empty response. Please try again.");
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(response.text);
    } catch {
      console.error(
        "[ai] response was not valid JSON:",
        response.text.slice(0, 500),
      );
      logFailure("invalid_json");
      throw new AIError("The AI returned an unreadable response. Please try again.");
    }

    const result = args.zodSchema.safeParse(parsed);
    if (!result.success) {
      console.error("[ai] response failed validation:", result.error.issues);
      logFailure("validation");
      throw new AIError(
        "The AI returned data we could not use. Please try again.",
      );
    }

    recordAiUsage({
      feature,
      provider: this.providerName,
      model: this.model,
      latencyMs,
      success: true,
      validationOk: true,
      ...usage,
    });

    return result.data;
  }

  // ------------------------------------------------------------ interview --

  async generateInterviewQuestion(
    ctx: GenerateQuestionContext,
  ): Promise<GeneratedQuestion> {
    return this.structured({
      system: interviewSystemPrompt(ctx.candidate, ctx.settings),
      prompt: nextQuestionPrompt(ctx),
      jsonSchema: questionJsonSchema as unknown as Record<string, unknown>,
      zodSchema: questionResponseSchema,
      maxTokens: 2048,
      feature: "interview_question",
    });
  }

  async generateFollowUpQuestion(
    ctx: GenerateQuestionContext,
  ): Promise<GeneratedQuestion> {
    const result = await this.structured({
      system: interviewSystemPrompt(ctx.candidate, ctx.settings),
      prompt: followUpPrompt(ctx),
      jsonSchema: questionJsonSchema as unknown as Record<string, unknown>,
      zodSchema: questionResponseSchema,
      maxTokens: 2048,
      feature: "interview_followup",
    });
    return { ...result, isFollowUp: true };
  }

  async evaluateInterviewAnswer(
    ctx: EvaluateAnswerContext,
  ): Promise<AnswerEvaluation> {
    const raw = await this.structured({
      system: evaluationSystemPrompt(ctx.settings),
      prompt: evaluationPrompt(ctx),
      jsonSchema: evaluationJsonSchema as unknown as Record<string, unknown>,
      zodSchema: evaluationResponseSchema,
      maxTokens: 3072,
      feature: "answer_evaluation",
    });

    const behavioural =
      ctx.settings.type === "BEHAVIORAL" || ctx.settings.type === "HR";

    return {
      score: Math.round(raw.score),
      // Sub-scores that carry no meaning for this round type are stored as
      // null rather than a misleading 0.
      correctness: behavioural ? null : Math.round(raw.correctness),
      relevance: Math.round(raw.relevance),
      clarity: Math.round(raw.clarity),
      technicalDepth: behavioural ? null : Math.round(raw.technicalDepth),
      completeness: Math.round(raw.completeness),
      structure: Math.round(raw.structure),
      strengths: raw.strengths,
      missingPoints: raw.missingPoints,
      feedback: raw.feedback,
      improvedAnswer: raw.improvedAnswer,
    };
  }

  async generateInterviewReport(
    ctx: GenerateReportContext,
  ): Promise<InterviewReportPayload> {
    const raw = await this.structured({
      system: reportSystemPrompt(),
      prompt: reportPrompt(ctx),
      jsonSchema: reportJsonSchema as unknown as Record<string, unknown>,
      zodSchema: reportResponseSchema,
      maxTokens: 4096,
      // The report is the deliverable — worth more thinking than a single turn.
      effort: "medium",
      feature: "interview_report",
    });

    return {
      overallScore: Math.round(raw.overallScore),
      technicalScore: Math.round(raw.technicalScore),
      communicationScore: Math.round(raw.communicationScore),
      problemSolvingScore: Math.round(raw.problemSolvingScore),
      behavioralScore: Math.round(raw.behavioralScore),
      structureScore: Math.round(raw.structureScore),
      summary: raw.summary,
      strengths: raw.strengths,
      weaknesses: raw.weaknesses,
      repeatedMistakes: raw.repeatedMistakes,
      recommendations: raw.recommendations,
      suggestedTopics: raw.suggestedTopics,
    };
  }

  // --------------------------------------------------------------- resume --

  async analyzeResume(resumeText: string): Promise<ResumeAnalysis> {
    // Keep the prompt well inside a sane token budget for very long resumes.
    const trimmed = resumeText.slice(0, 30_000);
    return this.structured({
      system: resumeSystemPrompt(),
      prompt: resumePrompt(trimmed),
      jsonSchema: resumeJsonSchema as unknown as Record<string, unknown>,
      zodSchema: resumeAnalysisSchema,
      maxTokens: 8192,
      effort: "medium",
      feature: "resume_analysis",
    });
  }

  async analyzeJobDescription(
    ctx: AnalyzeJobDescriptionContext,
  ): Promise<JobDescriptionAnalysis> {
    return this.structured({
      system: jobDescriptionSystemPrompt(),
      prompt: jobDescriptionPrompt(ctx),
      jsonSchema: jobDescriptionJsonSchema as unknown as Record<string, unknown>,
      zodSchema: jobDescriptionAnalysisSchema,
      maxTokens: 8192,
      effort: "medium",
      feature: "jd_analysis",
    });
  }

  async generateRecommendations(
    ctx: GenerateRecommendationsContext,
  ): Promise<AiRecommendation[]> {
    const raw = await this.structured({
      system: recommendationsSystemPrompt(),
      prompt: recommendationsPrompt(ctx),
      jsonSchema: recommendationsJsonSchema as unknown as Record<string, unknown>,
      zodSchema: recommendationsResponseSchema,
      maxTokens: 3072,
      feature: "recommendations",
    });
    return raw.recommendations;
  }

  // ------------------------------------------------------------------ V2 --

  async extractResumeClaims(resumeText: string): Promise<ExtractedClaim[]> {
    const raw = await this.structured({
      system: claimsSystemPrompt(),
      prompt: claimsPrompt(resumeText.slice(0, 30_000)),
      jsonSchema: claimsJsonSchema as unknown as Record<string, unknown>,
      zodSchema: claimsResponseSchema,
      maxTokens: 8192,
      effort: "medium",
      feature: "resume_claims",
    });
    return raw.claims;
  }

  async reviewCode(ctx: CodeReviewContext): Promise<CodeReviewResult> {
    const raw = await this.structured({
      system: codeReviewSystemPrompt(),
      prompt: codeReviewPrompt({
        ...ctx,
        // Bound the prompt regardless of what the editor allows.
        code: ctx.code.slice(0, 20_000),
        problemDescription: ctx.problemDescription.slice(0, 4_000),
      }),
      jsonSchema: codeReviewJsonSchema as unknown as Record<string, unknown>,
      zodSchema: codeReviewResponseSchema,
      maxTokens: 8192,
      effort: "medium",
      feature: "code_review",
    });

    return {
      correctness: Math.round(raw.correctness),
      timeComplexity: raw.timeComplexity,
      spaceComplexity: raw.spaceComplexity,
      readability: Math.round(raw.readability),
      maintainability: Math.round(raw.maintainability),
      efficiency: Math.round(raw.efficiency),
      summary: raw.summary,
      issues: raw.issues.map((issue) => ({
        severity: issue.severity,
        title: issue.title,
        detail: issue.detail,
        line: issue.line > 0 ? issue.line : null,
      })),
      edgeCases: raw.edgeCases,
      optimizationNotes: raw.optimizationNotes,
      // Belt-and-braces: even if the model ignores the instruction, we do not
      // hand over a solution the candidate did not ask for.
      optimizedApproach: ctx.includeOptimizedApproach ? raw.optimizedApproach : "",
      learningPoints: raw.learningPoints,
    };
  }

  async coach(ctx: CoachContext): Promise<CoachReply> {
    return this.structured({
      system: coachSystemPrompt(),
      prompt: coachPrompt(ctx),
      jsonSchema: coachJsonSchema as unknown as Record<string, unknown>,
      zodSchema: coachResponseSchema,
      maxTokens: 4096,
      effort: "medium",
      feature: "coach",
    });
  }

  async generateRoadmap(ctx: RoadmapContext): Promise<GeneratedRoadmap> {
    const raw = await this.structured({
      system: roadmapSystemPrompt(),
      prompt: roadmapPrompt(ctx),
      jsonSchema: roadmapJsonSchema as unknown as Record<string, unknown>,
      zodSchema: roadmapResponseSchema,
      maxTokens: 8192,
      effort: "medium",
      feature: "roadmap",
    });

    // Drop anything outside the requested horizon rather than trusting it.
    return {
      ...raw,
      tasks: raw.tasks.filter((task) => task.day <= ctx.horizonDays),
    };
  }

  async generateQuestions(
    ctx: GenerateQuestionsContext,
  ): Promise<GeneratedQuestionItem[]> {
    const raw = await this.structured({
      system: questionsSystemPrompt(),
      prompt: questionsPrompt(ctx),
      jsonSchema: questionsJsonSchema as unknown as Record<string, unknown>,
      zodSchema: questionsResponseSchema,
      maxTokens: 16000,
      effort: "medium",
      feature: "question_generation",
    });
    return raw.questions;
  }

  async analyzeCommunication(
    ctx: CommunicationContext,
  ): Promise<CommunicationResult> {
    const raw = await this.structured({
      system: communicationSystemPrompt(),
      prompt: communicationPrompt(ctx),
      jsonSchema: communicationJsonSchema as unknown as Record<string, unknown>,
      zodSchema: communicationResponseSchema,
      maxTokens: 2048,
      feature: "communication",
    });

    return {
      clarity: Math.round(raw.clarity),
      structure: Math.round(raw.structure),
      conciseness: Math.round(raw.conciseness),
      technicalExplanation: Math.round(raw.technicalExplanation),
      starCoverage: raw.starCoverage,
      observations: raw.observations,
      coaching: raw.coaching,
    };
  }
}
