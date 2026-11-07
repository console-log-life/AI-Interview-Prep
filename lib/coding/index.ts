import "server-only";

import { ServiceUnavailableError } from "@/lib/api/errors";
import { env, isCodeExecutionConfigured } from "@/lib/env";
import { Judge0Provider } from "./judge0";
import type { CodeExecutionProvider } from "./types";

let cached: CodeExecutionProvider | null = null;

export const EXECUTION_UNAVAILABLE_MESSAGE =
  "Code execution is not configured on this deployment. Set CODE_EXECUTION_PROVIDER=judge0 and JUDGE0_URL in your .env file to enable Run and Submit.";

export function getCodeExecutionProvider(): CodeExecutionProvider {
  if (cached) return cached;

  if (!isCodeExecutionConfigured()) {
    throw new ServiceUnavailableError(
      EXECUTION_UNAVAILABLE_MESSAGE,
      "execution_not_configured",
    );
  }

  switch (env.codeExecution.provider) {
    case "judge0":
      cached = new Judge0Provider({
        url: env.codeExecution.judge0Url,
        apiKey: env.codeExecution.judge0ApiKey,
        apiHost: env.codeExecution.judge0ApiHost,
      });
      return cached;
    default:
      throw new ServiceUnavailableError(
        EXECUTION_UNAVAILABLE_MESSAGE,
        "execution_not_configured",
      );
  }
}

export function executionAvailable(): boolean {
  return isCodeExecutionConfigured();
}

/** Test seam. */
export function __setCodeExecutionProvider(
  provider: CodeExecutionProvider | null,
): void {
  cached = provider;
}

export type {
  CodeExecutionProvider,
  ExecutionRequest,
  ExecutionResult,
  ExecutionVerdict,
} from "./types";
