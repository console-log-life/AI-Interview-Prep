import "server-only";

import type {
  CodeExecutionProvider,
  ExecutionRequest,
  ExecutionResult,
  ExecutionVerdict,
} from "./types";
import type { CodeLanguage } from "@/types/user";

/** Judge0 language ids (CE distribution). */
const LANGUAGE_IDS: Record<CodeLanguage, number> = {
  PYTHON: 71, // Python 3.8.1
  JAVA: 62, // Java OpenJDK 13.0.1
  CPP: 54, // C++ GCC 9.2.0
  JAVASCRIPT: 63, // JavaScript Node.js 12.14.0
};

/** Judge0 status ids → our verdicts. */
function mapStatus(statusId: number): ExecutionVerdict {
  switch (statusId) {
    case 3:
      return "ACCEPTED";
    case 4:
      return "WRONG_ANSWER";
    case 5:
      return "TIME_LIMIT_EXCEEDED";
    case 6:
      return "COMPILE_ERROR";
    case 7:
    case 8:
    case 9:
    case 10:
    case 11:
    case 12:
      return "RUNTIME_ERROR";
    case 13:
    case 14:
      return "INTERNAL_ERROR";
    default:
      return "INTERNAL_ERROR";
  }
}

function decode(value: string | null | undefined): string {
  if (!value) return "";
  try {
    return Buffer.from(value, "base64").toString("utf8");
  } catch {
    return "";
  }
}

type Judge0Response = {
  stdout?: string | null;
  stderr?: string | null;
  compile_output?: string | null;
  message?: string | null;
  time?: string | null;
  memory?: number | null;
  status?: { id: number; description: string };
};

/**
 * Judge0 sandbox provider.
 *
 * Works against a self-hosted Judge0 (`docker compose up`, recommended — no
 * quota, no third party sees student code) or the RapidAPI-hosted instance.
 */
export class Judge0Provider implements CodeExecutionProvider {
  readonly name = "judge0";
  readonly available: boolean;

  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly apiHost: string;

  constructor(config: { url: string; apiKey?: string; apiHost?: string }) {
    this.baseUrl = config.url.replace(/\/$/, "");
    this.apiKey = config.apiKey ?? "";
    this.apiHost = config.apiHost ?? "";
    this.available = Boolean(this.baseUrl);
  }

  private headers(): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (this.apiKey) {
      headers["X-RapidAPI-Key"] = this.apiKey;
      headers["X-RapidAPI-Host"] = this.apiHost;
    }
    return headers;
  }

  async execute(request: ExecutionRequest): Promise<ExecutionResult> {
    const body = {
      language_id: LANGUAGE_IDS[request.language],
      // base64 everywhere so arbitrary bytes in code/stdin survive transport.
      source_code: Buffer.from(request.code, "utf8").toString("base64"),
      stdin: Buffer.from(request.stdin ?? "", "utf8").toString("base64"),
      expected_output:
        request.expectedOutput !== undefined
          ? Buffer.from(request.expectedOutput, "utf8").toString("base64")
          : undefined,
      cpu_time_limit: Math.max(1, Math.ceil(request.timeLimitMs / 1000)),
      memory_limit: request.memoryLimitKb,
      // Cut off anything that tries to spew output forever.
      max_file_size: 4096,
    };

    // `wait=true` makes Judge0 hold the connection until the run finishes, so
    // we do not need a polling loop for the short programs used here.
    const url = `${this.baseUrl}/submissions?base64_encoded=true&wait=true&fields=*`;

    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(45_000),
        cache: "no-store",
      });
    } catch (error) {
      console.error("[judge0] request failed:", error);
      return {
        verdict: "INTERNAL_ERROR",
        stdout: "",
        stderr: "",
        compileOutput: "",
        runtimeMs: null,
        memoryKb: null,
      };
    }

    if (!response.ok) {
      console.error(
        "[judge0] non-OK response:",
        response.status,
        await response.text().catch(() => ""),
      );
      return {
        verdict: "INTERNAL_ERROR",
        stdout: "",
        stderr: "",
        compileOutput: "",
        runtimeMs: null,
        memoryKb: null,
      };
    }

    const data = (await response.json()) as Judge0Response;
    const statusId = data.status?.id ?? 0;
    let verdict = mapStatus(statusId);

    // Judge0 only reports WRONG_ANSWER when expected_output is supplied; for a
    // bare "Run" we treat a clean exit as accepted.
    if (verdict === "ACCEPTED" && request.expectedOutput === undefined) {
      verdict = "ACCEPTED";
    }

    // Judge0 folds OOM into runtime error; surface it as its own verdict.
    const stderr = decode(data.stderr);
    if (
      verdict === "RUNTIME_ERROR" &&
      /memory|bad_alloc|OutOfMemory/i.test(stderr)
    ) {
      verdict = "MEMORY_LIMIT_EXCEEDED";
    }

    return {
      verdict,
      stdout: decode(data.stdout),
      stderr: stderr || decode(data.message),
      compileOutput: decode(data.compile_output),
      runtimeMs: data.time ? Math.round(Number.parseFloat(data.time) * 1000) : null,
      memoryKb: data.memory ?? null,
    };
  }
}
