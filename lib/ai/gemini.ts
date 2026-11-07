import "server-only";
import { GoogleGenAI } from "@google/genai";

import { env } from "@/lib/env";
import {
  BaseAIService,
  ProviderRequestError,
  type CompletionRequest,
  type CompletionResult,
  type Effort,
} from "@/lib/ai/provider";

/**
 * Google Gemini transport.
 *
 * This file is the only place that imports `@google/genai`. It supplies the
 * raw call; prompts, JSON Schema, Zod validation and telemetry are shared with
 * Anthropic through `BaseAIService`, so switching providers cannot change what
 * the application accepts into its database.
 *
 * Structured output uses `responseJsonSchema` with `responseMimeType:
 * "application/json"`, which is Gemini's equivalent of Anthropic's
 * `json_schema` output format. Zod still runs afterwards — a provider claiming
 * to honour a schema is not the same as it having done so.
 */

/** Documented default when `AI_MODEL` is unset. See README → AI setup. */
export const GEMINI_DEFAULT_MODEL = "gemini-2.5-flash";

export class GeminiAIService extends BaseAIService {
  readonly providerName = "gemini";
  readonly model: string;

  private readonly client: GoogleGenAI;

  constructor(apiKey: string, model = env.ai.model) {
    super();
    // The SDK reads GEMINI_API_KEY from the environment if not passed, but we
    // pass it explicitly so the only source of the key is `lib/env.ts`.
    this.client = new GoogleGenAI({ apiKey });
    this.model = model || GEMINI_DEFAULT_MODEL;
  }

  protected async complete(
    request: CompletionRequest,
  ): Promise<CompletionResult> {
    let response;
    try {
      response = await this.client.models.generateContent({
        model: this.model,
        contents: [{ role: "user", parts: [{ text: request.prompt }] }],
        config: {
          systemInstruction: request.system,
          responseMimeType: "application/json",
          responseJsonSchema: toGeminiSchema(request.jsonSchema),
          maxOutputTokens: request.maxTokens,
          thinkingConfig: { thinkingBudget: thinkingBudgetFor(request.effort) },
        },
      });
    } catch (error) {
      throw classifyGeminiError(error);
    }

    const usage = response.usageMetadata;

    return {
      text: response.text ?? "",
      inputTokens: usage?.promptTokenCount ?? null,
      outputTokens: usage?.candidatesTokenCount ?? null,
      refused: isRefusal(response),
    };
  }
}

/**
 * Maps the shared effort dial onto Gemini's thinking budget.
 *
 * `0` disables thinking outright, which is the right trade for a single
 * interview turn where latency is what the candidate feels. `-1` hands the
 * decision to the model, which suits the longer analytical calls (reports,
 * roadmaps, code review) better than a number picked here would — the valid
 * budget range differs per model, so guessing one risks an API rejection on a
 * model this file has never seen.
 */
export function thinkingBudgetFor(effort: Effort): number {
  return effort === "low" ? 0 : -1;
}

/**
 * Adapts a standard JSON Schema for Gemini.
 *
 * Two adjustments, applied recursively:
 *
 *  - `additionalProperties` is dropped. Gemini's schema dialect has rejected
 *    it in the past, and it costs nothing to remove: every Zod object schema
 *    strips unknown keys anyway, so an extra field the model invents is
 *    discarded at the validation boundary rather than reaching the database.
 *  - `$schema` is dropped as a no-op that some versions reject.
 *
 * Everything that actually constrains generation — types, enums, required,
 * items, descriptions — is passed through untouched.
 */
export function toGeminiSchema(schema: unknown): Record<string, unknown> {
  return strip(schema) as Record<string, unknown>;
}

const DROPPED_KEYWORDS = new Set(["additionalProperties", "$schema"]);

function strip(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(strip);
  if (node === null || typeof node !== "object") return node;

  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    if (DROPPED_KEYWORDS.has(key)) continue;
    out[key] = strip(value);
  }
  return out;
}

/**
 * Whether the response was declined rather than answered.
 *
 * Gemini reports this through `promptFeedback.blockReason` (input rejected) or
 * a candidate `finishReason` of SAFETY / PROHIBITED_CONTENT / BLOCKLIST /
 * SPII (output stopped). All of them arrive as a successful HTTP call, which
 * is exactly why the base class needs the flag rather than an exception.
 */
const REFUSAL_FINISH_REASONS = new Set([
  "SAFETY",
  "PROHIBITED_CONTENT",
  "BLOCKLIST",
  "SPII",
  "IMAGE_SAFETY",
]);

function isRefusal(response: {
  promptFeedback?: { blockReason?: unknown } | undefined;
  candidates?: Array<{ finishReason?: unknown }> | undefined;
}): boolean {
  if (response.promptFeedback?.blockReason) return true;

  const finishReason = response.candidates?.[0]?.finishReason;
  return (
    typeof finishReason === "string" && REFUSAL_FINISH_REASONS.has(finishReason)
  );
}

/**
 * Classifies a Gemini failure without leaking the upstream body.
 *
 * The SDK surfaces HTTP failures as errors carrying a status and a message.
 * We read only the status and a few well-known substrings; the raw error is
 * attached as `cause` for the server log and never sent to the client.
 */
export function classifyGeminiError(error: unknown): ProviderRequestError {
  const status = readStatus(error);
  const message = error instanceof Error ? error.message.toLowerCase() : "";

  if (status === 429 || message.includes("resource_exhausted")) {
    return new ProviderRequestError(
      "rate_limit",
      "The AI service is busy or the daily quota is used up. Please try again later.",
      error,
    );
  }
  if (status === 401 || status === 403 || message.includes("api key")) {
    return new ProviderRequestError(
      "auth",
      "The AI service rejected our credentials. Check GEMINI_API_KEY.",
      error,
    );
  }
  if (status === 504 || message.includes("deadline") || message.includes("timeout")) {
    return new ProviderRequestError(
      "timeout",
      "The AI service took too long to respond. Please try again.",
      error,
    );
  }
  // 400 on a structured-output call is usually a schema the model rejected,
  // which is a bug on our side rather than something the user can retry into.
  if (status === 400) {
    return new ProviderRequestError(
      "transport",
      "The AI service could not process that request. Please try again.",
      error,
    );
  }
  return new ProviderRequestError(
    "transport",
    "Something went wrong talking to the AI service. Please try again.",
    error,
  );
}

function readStatus(error: unknown): number | null {
  if (typeof error !== "object" || error === null) return null;
  const record = error as Record<string, unknown>;

  for (const key of ["status", "code", "statusCode"]) {
    const value = record[key];
    if (typeof value === "number") return value;
  }
  // Some SDK errors nest the HTTP detail one level down.
  const response = record.response;
  if (typeof response === "object" && response !== null) {
    const status = (response as Record<string, unknown>).status;
    if (typeof status === "number") return status;
  }
  return null;
}
