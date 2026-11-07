import "server-only";
import type { Interview, InterviewMessage } from "@prisma/client";

import { getAIService } from "@/lib/ai";
import { AIError, ConflictError, NotFoundError } from "@/lib/api/errors";
import { prisma } from "@/lib/db/prisma";
import { buildCandidateContext } from "@/lib/db/queries/users";
import {
  actionInstruction,
  advanceDepth,
  applyAnswer,
  createInitialState,
  decideNextAction,
  isFollowUpAction,
  type AnswerSignal,
  type InterviewStateSnapshot,
} from "@/lib/interview/adaptive";
import { recordMistakes } from "@/lib/mistakes/service";
import { recordClaimVerification } from "@/lib/resume/claims";
import { recordSkillObservations } from "@/lib/skills/service";
import { interviewScoreToSkillScore } from "@/lib/skills/scoring";
import {
  recordActivity,
  recordTopicPerformance,
  writeProgressSnapshot,
} from "@/lib/progress/service";
import { evaluateAchievements } from "@/lib/recommendations/achievements";
import { refreshRecommendations } from "@/lib/recommendations/service";
import { inferSkillCategory } from "@/lib/db/queries/profile";
import type {
  AnswerEvaluation,
  EvaluatedTurn,
  GenerateQuestionContext,
  InterviewSettings,
  InterviewTurn,
} from "@/types/ai";
import type { CreateInterviewInput } from "@/lib/validation/interview";
import type { InterviewStateDTO } from "@/types/interview";

/**
 * Mock-interview orchestration.
 *
 * The whole conversation lives in Postgres (`InterviewMessage`, ordered by an
 * explicit `order` column). Nothing about an in-flight interview is held in
 * browser memory, so a refresh, a closed tab or a dropped connection resumes
 * exactly where the candidate left off.
 *
 * The question sequence is NOT fixed. Each turn the model receives the
 * transcript, the candidate context, and its own private evaluation of the last
 * answer, and decides whether to drill deeper or move on.
 */

function toSettings(interview: Interview): InterviewSettings {
  return {
    type: interview.type,
    persona: interview.persona,
    difficulty: interview.difficulty,
    plannedQuestions: interview.plannedQuestions,
  };
}

function toTurns(messages: InterviewMessage[]): InterviewTurn[] {
  return messages
    .filter((message) => message.role !== "SYSTEM")
    .map((message) => ({
      role: message.role as "INTERVIEWER" | "CANDIDATE",
      content: message.content,
      topic: message.topic,
    }));
}

/** DB row → the pure engine's snapshot type. */
function toSnapshot(
  row: {
    currentDifficulty: string;
    followUpDepth: number;
    turnCount: number;
    coveredTopics: string[];
    masteredTopics: string[];
    strugglingTopics: string[];
    skillEstimate: number;
    confidence: number;
    streakStrong: number;
    streakWeak: number;
    pendingProbes: string[];
  } | null,
  fallbackDifficulty: "EASY" | "MEDIUM" | "HARD",
): InterviewStateSnapshot {
  if (!row) return createInitialState({ currentDifficulty: fallbackDifficulty });
  return {
    currentDifficulty: row.currentDifficulty as "EASY" | "MEDIUM" | "HARD",
    followUpDepth: row.followUpDepth,
    turnCount: row.turnCount,
    coveredTopics: row.coveredTopics,
    masteredTopics: row.masteredTopics,
    strugglingTopics: row.strugglingTopics,
    skillEstimate: row.skillEstimate,
    confidence: row.confidence,
    streakStrong: row.streakStrong,
    streakWeak: row.streakWeak,
    pendingProbes: row.pendingProbes,
  };
}

async function persistState(
  interviewId: string,
  state: InterviewStateSnapshot,
): Promise<void> {
  await prisma.interviewState.upsert({
    where: { interviewId },
    create: { interviewId, ...state },
    update: state,
  });
}

async function nextOrder(interviewId: string): Promise<number> {
  const last = await prisma.interviewMessage.findFirst({
    where: { interviewId },
    orderBy: { order: "desc" },
    select: { order: true },
  });
  return (last?.order ?? -1) + 1;
}

/**
 * Creates the interview and asks the opening question.
 *
 * If the AI call fails, the interview row is still created and marked FAILED
 * with a readable message rather than vanishing — the user sees a real error
 * state and can retry.
 */
export async function createInterview(
  userId: string,
  input: CreateInterviewInput,
) {
  const jobDescriptionId = input.jobDescriptionId || undefined;

  // Verify JD ownership before it reaches a prompt.
  if (jobDescriptionId) {
    const owned = await prisma.jobDescription.findFirst({
      where: { id: jobDescriptionId, userId },
      select: { id: true },
    });
    if (!owned) throw new NotFoundError("That job description was not found.");
  }

  let resumeId: string | null = null;
  if (input.useResume) {
    const resume = await prisma.resume.findFirst({
      where: { userId, status: "ANALYZED" },
      orderBy: [{ isPrimary: "desc" }, { createdAt: "desc" }],
      select: { id: true },
    });
    resumeId = resume?.id ?? null;
  }

  const interview = await prisma.interview.create({
    data: {
      userId,
      targetRole: input.targetRole,
      experienceLevel: input.experienceLevel,
      type: input.type,
      persona: input.persona,
      difficulty: input.difficulty,
      durationMin: input.durationMin,
      plannedQuestions: input.plannedQuestions,
      resumeId,
      jobDescriptionId: jobDescriptionId ?? null,
      status: "STARTED",
    },
  });

  try {
    const candidate = await buildCandidateContext(userId, {
      includeResume: Boolean(resumeId),
      jobDescriptionId,
    });
    // The setup form's role wins over the stored profile role.
    candidate.targetRole = input.targetRole;
    candidate.experienceLevel = input.experienceLevel;

    // Resume claims and JD requirements become probe targets the adaptive
    // engine will work through during the interview.
    const pendingProbes = await collectProbes(userId, resumeId, jobDescriptionId);

    const initialState = createInitialState({
      currentDifficulty: input.difficulty,
      pendingProbes,
    });
    await persistState(interview.id, initialState);

    const ai = getAIService();
    const question = await ai.generateInterviewQuestion({
      candidate,
      settings: toSettings(interview),
      transcript: [],
      questionNumber: 1,
      coveredTopics: [],
      lastEvaluation: null,
      adaptiveState: {
        difficulty: initialState.currentDifficulty,
        skillEstimate: initialState.skillEstimate,
        masteredTopics: [],
        strugglingTopics: [],
      },
    });

    await prisma.interviewMessage.create({
      data: {
        interviewId: interview.id,
        role: "INTERVIEWER",
        content: question.question,
        order: 0,
        isQuestion: true,
        isFollowUp: false,
        topic: question.topic,
      },
    });

    await prisma.interview.update({
      where: { id: interview.id },
      data: { status: "IN_PROGRESS", lastActivityAt: new Date() },
    });

    await recordActivity(userId, "INTERVIEW");

    return interview.id;
  } catch (error) {
    await prisma.interview.update({
      where: { id: interview.id },
      data: {
        status: "FAILED",
        errorMessage:
          error instanceof AIError
            ? error.message
            : "We couldn't start the interview. Please try again.",
      },
    });
    throw error;
  }
}

/**
 * Builds the list of things the interviewer should verify: unverified resume
 * claims first, then required skills from the target job description.
 *
 * This is what makes a resume-based interview genuinely grounded — the engine
 * carries a concrete to-do list rather than hoping the model remembers.
 */
async function collectProbes(
  userId: string,
  resumeId: string | null,
  jobDescriptionId?: string,
): Promise<string[]> {
  const probes: string[] = [];

  if (resumeId) {
    const claims = await prisma.resumeClaim.findMany({
      where: { resumeId, status: "UNVERIFIED" },
      orderBy: { createdAt: "asc" },
      take: 6,
      select: { text: true },
    });
    probes.push(...claims.map((claim) => claim.text));
  }

  if (jobDescriptionId) {
    const jd = await prisma.jobDescription.findFirst({
      where: { id: jobDescriptionId, userId },
      select: { requiredSkills: true },
    });
    const required = Array.isArray(jd?.requiredSkills)
      ? (jd.requiredSkills as unknown[]).filter(
          (item): item is string => typeof item === "string",
        )
      : [];
    probes.push(...required.slice(0, 4).map((skill) => `Job requirement: ${skill}`));
  }

  return probes.slice(0, 10);
}

/**
 * Maps a probe string back to the claim row it came from.
 *
 * `collectProbes` puts the claim's own text into the state, so an exact match
 * is the correct lookup. Returning null (JD requirements, or a claim deleted
 * mid-interview) is a supported outcome, not an error.
 */
async function resolveClaimId(
  resumeId: string | null,
  probe: string,
): Promise<string | null> {
  if (!resumeId) return null;
  const claim = await prisma.resumeClaim.findFirst({
    where: { resumeId, text: probe },
    select: { id: true },
  });
  return claim?.id ?? null;
}

export type AnswerResult = {
  evaluation: AnswerEvaluation;
  nextQuestion: { id: string; content: string; topic: string; isFollowUp: boolean } | null;
  /** True when this was the final question and the report can be generated. */
  finished: boolean;
  questionsAsked: number;
  plannedQuestions: number;
};

/**
 * Records an answer, grades it, and decides what happens next.
 *
 * Ordering matters: the answer is persisted BEFORE the AI is called. If the AI
 * then fails, the candidate's words are already safe in the database and the
 * request can simply be retried.
 */
export async function submitAnswer(
  userId: string,
  interviewId: string,
  answerText: string,
): Promise<AnswerResult> {
  const interview = await prisma.interview.findFirst({
    where: { id: interviewId, userId },
    include: { messages: { orderBy: { order: "asc" } }, state: true },
  });

  if (!interview) throw new NotFoundError("We could not find that interview.");
  if (interview.status === "COMPLETED") {
    throw new ConflictError("This interview has already finished.");
  }

  const lastQuestion = [...interview.messages]
    .reverse()
    .find((message) => message.role === "INTERVIEWER" && message.isQuestion);

  if (!lastQuestion) {
    throw new ConflictError("There is no question waiting for an answer.");
  }

  // Guard against a double submit for the same question.
  const alreadyAnswered = interview.messages.some(
    (message) => message.role === "CANDIDATE" && message.order > lastQuestion.order,
  );
  if (alreadyAnswered) {
    throw new ConflictError("You have already answered that question.");
  }

  const answerOrder = await nextOrder(interviewId);
  const answerMessage = await prisma.interviewMessage.create({
    data: {
      interviewId,
      role: "CANDIDATE",
      content: answerText,
      order: answerOrder,
      topic: lastQuestion.topic,
    },
  });

  await prisma.interview.update({
    where: { id: interviewId },
    data: { status: "IN_PROGRESS", lastActivityAt: new Date() },
  });

  const candidate = await buildCandidateContext(userId, {
    includeResume: Boolean(interview.resumeId),
    jobDescriptionId: interview.jobDescriptionId ?? undefined,
  });
  candidate.targetRole = interview.targetRole;
  candidate.experienceLevel = interview.experienceLevel;

  const settings = toSettings(interview);
  const ai = getAIService();

  const evaluation = await ai.evaluateInterviewAnswer({
    candidate,
    settings,
    question: lastQuestion.content,
    answer: answerText,
    topic: lastQuestion.topic ?? "General",
  });

  await prisma.interviewEvaluation.create({
    data: {
      interviewId,
      messageId: answerMessage.id,
      questionText: lastQuestion.content,
      answerText,
      score: evaluation.score,
      correctness: evaluation.correctness,
      relevance: evaluation.relevance,
      clarity: evaluation.clarity,
      technicalDepth: evaluation.technicalDepth,
      completeness: evaluation.completeness,
      structure: evaluation.structure,
      strengths: evaluation.strengths,
      missingPoints: evaluation.missingPoints,
      feedback: evaluation.feedback,
      improvedAnswer: evaluation.improvedAnswer,
      topic: lastQuestion.topic,
    },
  });

  const questionsAsked = interview.messages.filter(
    (message) => message.isQuestion,
  ).length;

  const topic = lastQuestion.topic ?? "General";

  // ---- Adaptive state: fold this answer in, then decide the next move -----
  const probedClaim = lastQuestion.probeClaimId
    ? await prisma.resumeClaim.findUnique({
        where: { id: lastQuestion.probeClaimId },
        select: { id: true, text: true },
      })
    : null;

  const priorState = toSnapshot(interview.state, interview.difficulty);
  const signal: AnswerSignal = {
    score: evaluation.score,
    missingPoints: evaluation.missingPoints,
    topic,
    wasFollowUp: lastQuestion.isFollowUp,
    probedClaim: probedClaim?.text ?? null,
  };
  const updatedState = applyAnswer(priorState, signal);

  // ---- Intelligence side-effects (never block the interview) -------------
  // Wrapped so a failure in analytics can never lose the candidate's turn.
  try {
    await recordSkillObservations([
      {
        userId,
        topic,
        score: interviewScoreToSkillScore(evaluation.score),
        source: "INTERVIEW",
        sourceId: interviewId,
        difficulty: updatedState.currentDifficulty,
      },
    ]);
    await recordMistakes({
      userId,
      source: "INTERVIEW",
      sourceId: interviewId,
      topic,
      score: evaluation.score,
      missingPoints: evaluation.missingPoints,
    });

    // If this question existed to probe a resume claim, the answer is the
    // evidence that verifies or undermines it.
    if (probedClaim) {
      await recordClaimVerification({
        userId,
        claimId: probedClaim.id,
        score: evaluation.score,
        evidence: evaluation.feedback,
      });
    }
  } catch (error) {
    console.error("[interview] intelligence update failed:", error);
  }

  const action = decideNextAction({
    state: updatedState,
    lastSignal: signal,
    plannedQuestions: interview.plannedQuestions,
    questionsAsked,
  });

  if (action.type === "FINISH") {
    await persistState(interviewId, updatedState);
    return {
      evaluation,
      nextQuestion: null,
      finished: true,
      questionsAsked,
      plannedQuestions: interview.plannedQuestions,
    };
  }

  const stateForNext = advanceDepth(updatedState, action);

  const transcript = toTurns([...interview.messages, answerMessage]);
  const coveredTopics = [
    ...new Set(
      interview.messages
        .filter((message) => message.isQuestion && message.topic)
        .map((message) => message.topic as string),
    ),
  ];

  const questionContext: GenerateQuestionContext = {
    candidate,
    settings,
    transcript,
    questionNumber: questionsAsked + 1,
    coveredTopics,
    lastEvaluation: evaluation,
    instruction: actionInstruction(action),
    adaptiveState: {
      difficulty: stateForNext.currentDifficulty,
      skillEstimate: stateForNext.skillEstimate,
      masteredTopics: stateForNext.masteredTopics,
      strugglingTopics: stateForNext.strugglingTopics,
    },
  };

  const generated = isFollowUpAction(action)
    ? await ai.generateFollowUpQuestion(questionContext)
    : await ai.generateInterviewQuestion(questionContext);

  await persistState(interviewId, stateForNext);

  // A PROBE_CLAIM question is tied back to the claim row so that, once the
  // answer is graded, the claim can be marked verified or weak. JD-derived
  // probes deliberately resolve to null — they are requirements, not claims.
  const probeClaimId =
    action.type === "PROBE_CLAIM"
      ? await resolveClaimId(interview.resumeId, action.claim)
      : null;

  const created = await prisma.interviewMessage.create({
    data: {
      interviewId,
      role: "INTERVIEWER",
      content: generated.question,
      order: answerOrder + 1,
      isQuestion: true,
      // The ENGINE decides whether this is a follow-up, not the model — the
      // model could otherwise mislabel it and break the depth ceiling.
      isFollowUp: isFollowUpAction(action),
      topic: generated.topic,
      probeClaimId,
    },
  });

  await prisma.interview.update({
    where: { id: interviewId },
    data: { lastActivityAt: new Date() },
  });

  return {
    evaluation,
    nextQuestion: {
      id: created.id,
      content: created.content,
      topic: created.topic ?? generated.topic,
      isFollowUp: created.isFollowUp,
    },
    finished: false,
    questionsAsked: questionsAsked + 1,
    plannedQuestions: interview.plannedQuestions,
  };
}

/**
 * Ends the interview and produces the report.
 *
 * If report generation fails, the interview is still marked COMPLETED — the
 * transcript and per-answer evaluations are the user's data and must not be
 * lost because one API call failed. The result page then offers a retry.
 */
export async function completeInterview(userId: string, interviewId: string) {
  const interview = await prisma.interview.findFirst({
    where: { id: interviewId, userId },
    include: {
      messages: { orderBy: { order: "asc" } },
      evaluations: { orderBy: { createdAt: "asc" } },
      report: true,
    },
  });

  if (!interview) throw new NotFoundError("We could not find that interview.");
  if (interview.report) return interview.report;

  const turns: EvaluatedTurn[] = interview.evaluations.map((evaluation) => ({
    question: evaluation.questionText,
    answer: evaluation.answerText,
    topic: evaluation.topic ?? "General",
    evaluation: {
      score: evaluation.score,
      correctness: evaluation.correctness,
      relevance: evaluation.relevance ?? 0,
      clarity: evaluation.clarity ?? 0,
      technicalDepth: evaluation.technicalDepth,
      completeness: evaluation.completeness,
      structure: evaluation.structure,
      strengths: evaluation.strengths,
      missingPoints: evaluation.missingPoints,
      feedback: evaluation.feedback,
      improvedAnswer: evaluation.improvedAnswer ?? "",
    },
  }));

  await prisma.interview.update({
    where: { id: interviewId },
    data: { status: "COMPLETED", completedAt: new Date() },
  });

  if (turns.length === 0) {
    // Nothing was answered — no report to write, and no fake scores either.
    return null;
  }

  const candidate = await buildCandidateContext(userId, {
    includeResume: Boolean(interview.resumeId),
    jobDescriptionId: interview.jobDescriptionId ?? undefined,
  });
  candidate.targetRole = interview.targetRole;

  const ai = getAIService();
  const payload = await ai.generateInterviewReport({
    candidate,
    settings: toSettings(interview),
    turns,
  });

  const report = await prisma.interviewReport.create({
    data: {
      interviewId,
      overallScore: payload.overallScore,
      technicalScore: payload.technicalScore,
      communicationScore: payload.communicationScore,
      problemSolvingScore: payload.problemSolvingScore,
      behavioralScore: payload.behavioralScore,
      structureScore: payload.structureScore,
      summary: payload.summary,
      strengths: payload.strengths,
      weaknesses: payload.weaknesses,
      repeatedMistakes: payload.repeatedMistakes,
      recommendations: payload.recommendations,
      suggestedTopics: payload.suggestedTopics,
      questionBreakdown: turns.map((turn, index) => ({
        index: index + 1,
        topic: turn.topic,
        score: turn.evaluation.score,
        question: turn.question,
      })),
      modelUsed: ai.model,
    },
  });

  // Per-answer scores are 0-10; topic performance is stored 0-100.
  await recordTopicPerformance(
    userId,
    turns.map((turn) => ({
      topic: turn.topic,
      category: inferSkillCategory(turn.topic),
      score: turn.evaluation.score * 10,
    })),
  );
  await writeProgressSnapshot(userId);
  await evaluateAchievements(userId);
  await refreshRecommendations(userId);

  return report;
}

/** Everything the live interview screen needs to rehydrate after a refresh. */
export async function getInterviewState(
  userId: string,
  interviewId: string,
): Promise<InterviewStateDTO> {
  const interview = await prisma.interview.findFirst({
    where: { id: interviewId, userId },
    include: { messages: { orderBy: { order: "asc" } } },
  });

  if (!interview) throw new NotFoundError("We could not find that interview.");

  return {
    id: interview.id,
    status: interview.status,
    targetRole: interview.targetRole,
    type: interview.type,
    persona: interview.persona,
    difficulty: interview.difficulty,
    plannedQuestions: interview.plannedQuestions,
    questionsAsked: interview.messages.filter((m) => m.isQuestion).length,
    answersGiven: interview.messages.filter((m) => m.role === "CANDIDATE").length,
    durationMin: interview.durationMin,
    startedAt: interview.startedAt.toISOString(),
    completedAt: interview.completedAt?.toISOString() ?? null,
    messages: interview.messages.map((message) => ({
      id: message.id,
      role: message.role,
      content: message.content,
      order: message.order,
      isQuestion: message.isQuestion,
      isFollowUp: message.isFollowUp,
      topic: message.topic,
      createdAt: message.createdAt.toISOString(),
    })),
  };
}

export async function getInterviewResult(userId: string, interviewId: string) {
  const interview = await prisma.interview.findFirst({
    where: { id: interviewId, userId },
    include: {
      report: true,
      evaluations: { orderBy: { createdAt: "asc" } },
      messages: { orderBy: { order: "asc" } },
    },
  });

  if (!interview) throw new NotFoundError("We could not find that interview.");
  return interview;
}

export async function listUserInterviews(userId: string, limit = 10) {
  return prisma.interview.findMany({
    where: { userId },
    include: { report: { select: { overallScore: true } } },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}
