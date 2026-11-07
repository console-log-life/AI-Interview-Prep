import "server-only";

import { ServiceUnavailableError } from "@/lib/api/errors";
import { aiKeyEnvVar, env, isAiConfigured } from "@/lib/env";
import { AnthropicAIService } from "@/lib/ai/anthropic";
import { GeminiAIService } from "@/lib/ai/gemini";
import type { AIService } from "@/types/ai";

/**
 * Provider registry.
 *
 * Adding a provider is: write a class extending `BaseAIService`, add one entry
 * to this switch, add its key to `.env`. Nothing else in the codebase changes,
 * because nothing else imports a provider directly.
 *
 * There is deliberately NO automatic fallback between providers. If Gemini
 * fails, the request surfaces an AI-unavailable state — silently retrying
 * against Anthropic would start billing a paid account on the strength of an
 * unrelated outage, which is not a decision this code gets to make. Any
 * cross-provider fallback must be an explicit, configured choice.
 */
let cached: AIService | null = null;

const SUPPORTED_PROVIDERS = ["gemini", "anthropic"] as const;

/**
 * Copy for the "AI not configured" notice.
 *
 * Names the exact variable the current provider needs, so the message is
 * actionable rather than generic. It never contains a key value.
 */
export const AI_UNAVAILABLE_MESSAGE = `AI features are not configured on this deployment. Add ${aiKeyEnvVar()} to your .env file to enable them.`;

export function getAIService(): AIService {
  if (cached) return cached;

  if (!isAiConfigured()) {
    throw new ServiceUnavailableError(AI_UNAVAILABLE_MESSAGE, "ai_not_configured");
  }

  switch (env.ai.provider) {
    case "gemini":
      cached = new GeminiAIService(env.ai.geminiApiKey, env.ai.model);
      return cached;
    case "anthropic":
      cached = new AnthropicAIService(env.ai.apiKey, env.ai.model);
      return cached;
    default:
      throw new ServiceUnavailableError(
        `Unknown AI provider "${env.ai.provider}". Set AI_PROVIDER to one of: ${SUPPORTED_PROVIDERS.join(", ")}.`,
        "ai_provider_unknown",
      );
  }
}

/** Non-throwing probe for UI that needs to render a "not configured" state. */
export function aiAvailable(): boolean {
  return isAiConfigured();
}

/** Which provider is active, for admin/observability display. */
export function activeAiProvider(): string {
  return env.ai.provider;
}

/** Test seam — lets tests inject a fake provider. */
export function __setAIService(service: AIService | null): void {
  cached = service;
}

export type { AIService } from "@/types/ai";
