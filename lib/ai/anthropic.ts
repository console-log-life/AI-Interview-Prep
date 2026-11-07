import "server-only";
import Anthropic from "@anthropic-ai/sdk";

import { env } from "@/lib/env";
import {
  BaseAIService,
  ProviderRequestError,
  type CompletionRequest,
  type CompletionResult,
} from "@/lib/ai/provider";

/**
 * Anthropic transport.
 *
 * This file is the only place in the codebase that imports the Anthropic SDK.
 * Everything else — prompts, JSON Schema, Zod validation, telemetry, business
 * post-processing — lives in `BaseAIService` and is shared with every other
 * provider.
 */
export class AnthropicAIService extends BaseAIService {
  readonly providerName = "anthropic";
  readonly model: string;

  private readonly client: Anthropic;

  constructor(apiKey: string, model = env.ai.model) {
    super();
    this.client = new Anthropic({
      apiKey,
      maxRetries: 2,
      timeout: 120_000,
    });
    this.model = model;
  }

  protected async complete(
    request: CompletionRequest,
  ): Promise<CompletionResult> {
    let response;
    try {
      response = await this.client.messages.create({
        model: this.model,
        max_tokens: request.maxTokens,
        system: request.system,
        // Adaptive thinking is the recommended mode; `effort` is the
        // latency/cost dial and defaults to "low" for a responsive chat UI.
        thinking: { type: "adaptive" },
        output_config: {
          effort: request.effort,
          format: { type: "json_schema", schema: request.jsonSchema },
        },
        messages: [{ role: "user", content: request.prompt }],
      });
    } catch (error) {
      throw classifyAnthropicError(error);
    }

    const textBlock = response.content.find((block) => block.type === "text");

    return {
      text: textBlock && textBlock.type === "text" ? textBlock.text : "",
      inputTokens: response.usage?.input_tokens ?? null,
      outputTokens: response.usage?.output_tokens ?? null,
      refused: response.stop_reason === "refusal",
    };
  }
}

/**
 * Maps SDK errors onto the shared categories.
 *
 * The messages name the environment variable to check but never quote the
 * credential or the upstream response body.
 */
function classifyAnthropicError(error: unknown): ProviderRequestError {
  if (error instanceof Anthropic.RateLimitError) {
    return new ProviderRequestError(
      "rate_limit",
      "The AI service is busy right now. Please try again in a moment.",
      error,
    );
  }
  if (error instanceof Anthropic.AuthenticationError) {
    return new ProviderRequestError(
      "auth",
      "The AI service rejected our credentials. Check ANTHROPIC_API_KEY.",
      error,
    );
  }
  if (error instanceof Anthropic.APIConnectionTimeoutError) {
    return new ProviderRequestError(
      "timeout",
      "The AI service took too long to respond. Please try again.",
      error,
    );
  }
  return new ProviderRequestError(
    "transport",
    "Something went wrong talking to the AI service. Please try again.",
    error,
  );
}
