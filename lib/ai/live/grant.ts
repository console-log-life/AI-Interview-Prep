import "server-only";
import { GoogleGenAI } from "@google/genai";

import { AIError } from "@/lib/api/errors";
import { DEFAULT_LIVE_MODEL, safeSilenceDuration, tuningFor } from "@/lib/ai/live/config";
import { liveInterviewSystemPrompt } from "@/lib/ai/live/prompts";
import type { LiveSessionGrant } from "@/lib/ai/live/types";
import { prisma } from "@/lib/db/prisma";
import { NotFoundError } from "@/lib/api/errors";
import { env } from "@/lib/env";
import { getRepeatedMistakes } from "@/lib/mistakes/service";
import { getWeakSkills } from "@/lib/skills/service";
import { buildCandidateContext } from "@/lib/db/queries/users";

/**
 * Mints a short-lived credential for the browser's Live socket.
 *
 * This is the whole reason the browser can talk to Gemini directly. The
 * permanent GEMINI_API_KEY never leaves the server; what the client receives
 * is an ephemeral token that is single-use, expires in minutes, and is locked
 * to one model and one system instruction.
 *
 * `lockAdditionalFields: []` is the important part — it prevents the client
 * from overriding the system instruction or the model after the token is
 * issued. Without it, a token holder could repoint the session at a different
 * prompt and use the quota for something unrelated.
 */

/** Long enough to set up, short enough that a leaked token is near-useless. */
const TOKEN_TTL_MINUTES = 10;
/** The window in which the socket must actually be opened. */
const SESSION_START_WINDOW_MINUTES = 2;

export function liveModel(): string {
  return env.ai.liveModel || DEFAULT_LIVE_MODEL;
}

export async function createLiveGrant(args: {
  userId: string;
  interviewId: string;
}): Promise<LiveSessionGrant> {
  if (!env.ai.geminiApiKey) {
    throw new AIError(
      "Voice interviews are not configured on this deployment. Set GEMINI_API_KEY to enable them.",
    );
  }

  // Ownership gate: the grant embeds this user's real data, so proving the
  // interview belongs to them is what stops one account priming a session
  // with another's resume claims.
  const interview = await prisma.interview.findFirst({
    where: { id: args.interviewId, userId: args.userId },
    select: {
      id: true,
      targetRole: true,
      experienceLevel: true,
      type: true,
      persona: true,
      difficulty: true,
      durationMin: true,
      plannedQuestions: true,
      resumeId: true,
      jobDescriptionId: true,
      status: true,
      liveStartedAt: true,
    },
  });

  if (!interview) throw new NotFoundError("We could not find that interview.");

  /**
   * Anchor the interview clock on the first join.
   *
   * Set once and never moved, so a refresh or a reconnect resumes the same
   * clock instead of handing the candidate a fresh budget.
   */
  const liveStartedAt =
    interview.liveStartedAt ??
    (
      await prisma.interview.update({
        where: { id: interview.id },
        data: { liveStartedAt: new Date() },
        select: { liveStartedAt: true },
      })
    ).liveStartedAt!;

  const [candidate, weakSkills, repeated, claims, jd] = await Promise.all([
    buildCandidateContext(args.userId, {
      includeResume: Boolean(interview.resumeId),
      jobDescriptionId: interview.jobDescriptionId ?? undefined,
    }),
    getWeakSkills(args.userId, 5),
    getRepeatedMistakes(args.userId, 4),
    interview.resumeId
      ? prisma.resumeClaim.findMany({
          where: { resumeId: interview.resumeId, status: "UNVERIFIED" },
          orderBy: { createdAt: "asc" },
          take: 5,
          select: { text: true },
        })
      : Promise.resolve([]),
    interview.jobDescriptionId
      ? prisma.jobDescription.findFirst({
          where: { id: interview.jobDescriptionId, userId: args.userId },
          select: { requiredSkills: true },
        })
      : Promise.resolve(null),
  ]);

  candidate.targetRole = interview.targetRole;
  candidate.experienceLevel = interview.experienceLevel;

  const systemInstruction = liveInterviewSystemPrompt({
    candidate,
    settings: {
      type: interview.type,
      persona: interview.persona,
      difficulty: interview.difficulty,
      plannedQuestions: interview.plannedQuestions,
    },
    weakTopics: weakSkills.map((skill) => skill.label),
    repeatedMistakes: repeated.map((mistake) => mistake.label),
    resumeClaims: claims.map((claim) => claim.text),
    jobRequirements: toStrings(jd?.requiredSkills).slice(0, 10),
  });

  const tuning = tuningFor(interview.persona);
  const model = liveModel();
  const now = Date.now();
  const expiresAt = new Date(now + TOKEN_TTL_MINUTES * 60_000);

  const client = new GoogleGenAI({ apiKey: env.ai.geminiApiKey });

  let token;
  try {
    token = await client.authTokens.create({
      config: {
        uses: 1,
        expireTime: expiresAt.toISOString(),
        newSessionExpireTime: new Date(
          now + SESSION_START_WINDOW_MINUTES * 60_000,
        ).toISOString(),
        // Bind the token to this exact session shape. The client cannot
        // substitute a different model or prompt.
        liveConnectConstraints: {
          model,
          config: {
            responseModalities: ["AUDIO" as never],
            systemInstruction,
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName: tuning.voiceName },
              },
            },
            inputAudioTranscription: {},
            outputAudioTranscription: {},
            realtimeInputConfig: {
              /**
               * Server VAD is disabled here as well as on the client.
               *
               * `lockAdditionalFields: []` freezes the config carried in these
               * constraints, so whatever is set here is what the session gets
               * — a client asking for `disabled: true` against a token minted
               * with server VAD enabled is silently ignored. Leaving the two
               * out of step meant the model kept replying the instant it heard
               * silence, which is precisely the behaviour the client-owned
               * turn boundary exists to prevent.
               *
               * The persona's patience is still honoured: it travels in the
               * grant as `silenceDurationMs` and drives the client's own
               * detector.
               */
              automaticActivityDetection: { disabled: true },
            },
          },
        },
        lockAdditionalFields: [],
      },
    });
  } catch (error) {
    // Never forward the upstream body — it can echo request detail.
    console.error("[live] failed to mint ephemeral token:", error);
    throw new AIError(
      "Could not start a voice session right now. Please try again, or use the text interview.",
    );
  }

  if (!token.name) {
    throw new AIError("The voice service did not return a usable session token.");
  }

  return {
    planInput: {
      interviewType: interview.type,
      persona: interview.persona,
      difficulty: interview.difficulty,
      targetRole: interview.targetRole,
      durationMin: interview.durationMin,
      plannedQuestions: interview.plannedQuestions,
      resumeClaims: claims.map((claim, index) => ({
        id: `claim-${index}`,
        text: claim.text,
      })),
      jdSkills: toStrings(jd?.requiredSkills).slice(0, 10),
      weakSkills: weakSkills.map((skill) => skill.label),
      candidateSkills: candidate.skills ?? [],
    },
    token: token.name,
    model,
    expiresAt: expiresAt.toISOString(),
    interviewId: interview.id,
    systemInstruction,
    voiceName: tuning.voiceName,
    liveStartedAt: liveStartedAt.toISOString(),
    interviewerName: tuning.displayName,
    interviewerTitle: tuning.title,
    silenceDurationMs: safeSilenceDuration(tuning.silenceDurationMs),
    prefixPaddingMs: tuning.prefixPaddingMs,
  };
}

/**
 * Verifies the voice service is actually reachable for this user.
 *
 * Mints a genuine short-lived credential and throws it away. That round trip
 * is the only thing that distinguishes "GEMINI_API_KEY is set" from "a voice
 * interview will work" — an expired key, a revoked project or an exhausted
 * quota all look identical to a configuration check and all fail at connect
 * time, which is thirty seconds too late.
 *
 * The token is never returned to the caller, and no interview data is read
 * beyond confirming ownership, so this is far cheaper than a full grant.
 */
export async function probeLiveService(args: {
  userId: string;
  interviewId: string;
}): Promise<{ reachable: boolean; latencyMs: number | null }> {
  if (!env.ai.geminiApiKey) return { reachable: false, latencyMs: null };

  const interview = await prisma.interview.findFirst({
    where: { id: args.interviewId, userId: args.userId },
    select: { id: true },
  });
  if (!interview) throw new NotFoundError("We could not find that interview.");

  const client = new GoogleGenAI({ apiKey: env.ai.geminiApiKey });
  const startedAt = Date.now();

  try {
    const token = await client.authTokens.create({
      config: {
        uses: 1,
        // Deliberately brief. This credential is discarded immediately, so a
        // long window would only widen the exposure if the response leaked.
        expireTime: new Date(Date.now() + 60_000).toISOString(),
      },
    });
    // A response without a name is a successful call that produced nothing
    // usable, which for our purposes is not reachable.
    if (!token.name) return { reachable: false, latencyMs: null };
    return { reachable: true, latencyMs: Date.now() - startedAt };
  } catch (error) {
    // Logged without the body — upstream errors can echo request detail.
    console.error(
      "[live] probe failed:",
      error instanceof Error ? error.message : "unknown error",
    );
    return { reachable: false, latencyMs: null };
  }
}

function toStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}
