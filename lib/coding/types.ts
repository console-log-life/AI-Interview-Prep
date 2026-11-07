import type { CodeLanguage } from "@/types/user";

export type ExecutionVerdict =
  | "ACCEPTED"
  | "WRONG_ANSWER"
  | "TIME_LIMIT_EXCEEDED"
  | "MEMORY_LIMIT_EXCEEDED"
  | "RUNTIME_ERROR"
  | "COMPILE_ERROR"
  | "INTERNAL_ERROR";

export type ExecutionRequest = {
  language: CodeLanguage;
  code: string;
  stdin: string;
  expectedOutput?: string;
  timeLimitMs: number;
  memoryLimitKb: number;
};

export type ExecutionResult = {
  verdict: ExecutionVerdict;
  stdout: string;
  stderr: string;
  compileOutput: string;
  runtimeMs: number | null;
  memoryKb: number | null;
};

/**
 * Contract for running untrusted user code.
 *
 * The critical property: no implementation of this interface may execute code
 * inside the Next.js process. Submitted code is arbitrary and hostile by
 * assumption — it runs in an external sandbox with its own CPU, memory and
 * network limits, and the app only ever sees the transcript.
 */
export interface CodeExecutionProvider {
  readonly name: string;
  /** False when the provider has no credentials — the UI renders a setup hint. */
  readonly available: boolean;

  execute(request: ExecutionRequest): Promise<ExecutionResult>;
}
