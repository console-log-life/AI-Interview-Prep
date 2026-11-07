import "server-only";

/**
 * Compatibility re-export.
 *
 * The Anthropic implementation moved to `lib/ai/anthropic.ts` when Gemini was
 * added, and the provider-agnostic half moved to `lib/ai/provider.ts`. This
 * module is kept so any existing import of `@/lib/ai/client` keeps resolving.
 *
 * New code should import the registry (`@/lib/ai`) rather than a provider
 * directly — that is the whole point of the abstraction.
 */
export { AnthropicAIService } from "@/lib/ai/anthropic";
export { BaseAIService, ProviderRequestError } from "@/lib/ai/provider";
export type {
  CompletionRequest,
  CompletionResult,
  Effort,
  ProviderErrorCategory,
} from "@/lib/ai/provider";
