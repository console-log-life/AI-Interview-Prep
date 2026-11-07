import "server-only";

/**
 * Server-side environment access.
 *
 * Every secret is read here and nowhere else, so it is impossible for a value
 * to leak into a client bundle by accident — this module is `server-only` and
 * importing it from a client component is a build error.
 */

function optional(key: string, fallback = ""): string {
  return process.env[key]?.trim() || fallback;
}

function requiredAtRuntime(key: string): string {
  const value = process.env[key]?.trim();
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${key}. See .env.example.`,
    );
  }
  return value;
}

function intOr(key: string, fallback: number): number {
  const parsed = Number.parseInt(optional(key), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * Per-provider default model.
 *
 * `AI_MODEL` is shared across providers, so a single hardcoded default would
 * hand a Claude model id to Gemini the moment someone flips `AI_PROVIDER`
 * without also changing `AI_MODEL`. Resolving the default from the selected
 * provider means the common case — set the provider and the key, leave the
 * model blank — just works.
 */
const AI_MODEL_DEFAULTS: Record<string, string> = {
  anthropic: "claude-opus-5",
  gemini: "gemini-2.5-flash",
};

const AI_PROVIDER = optional("AI_PROVIDER", "anthropic").toLowerCase();

function resolveAiModel(): string {
  const configured = optional("AI_MODEL");
  if (configured) return configured;
  return AI_MODEL_DEFAULTS[AI_PROVIDER] ?? "";
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  isProduction: process.env.NODE_ENV === "production",

  appUrl: optional("NEXT_PUBLIC_APP_URL", "http://localhost:3000"),

  get databaseUrl() {
    return requiredAtRuntime("DATABASE_URL");
  },

  adminEmails: optional("ADMIN_EMAILS")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean),

  ai: {
    provider: AI_PROVIDER,
    /** Anthropic credential. Optional — only needed when provider=anthropic. */
    apiKey: optional("ANTHROPIC_API_KEY"),
    /** Gemini credential. Optional — only needed when provider=gemini. */
    geminiApiKey: optional("GEMINI_API_KEY"),
    model: resolveAiModel(),
    /** Gemini Live (realtime voice) model. Empty → the documented default. */
    liveModel: optional("AI_LIVE_MODEL"),
    effort: optional("AI_EFFORT", "low"),
  },

  storage: {
    provider: optional("STORAGE_PROVIDER", "local"),
    localDir: optional("STORAGE_LOCAL_DIR", "./storage"),
    s3Bucket: optional("S3_BUCKET"),
    s3Region: optional("S3_REGION", "us-east-1"),
    s3AccessKeyId: optional("S3_ACCESS_KEY_ID"),
    s3SecretAccessKey: optional("S3_SECRET_ACCESS_KEY"),
    s3Endpoint: optional("S3_ENDPOINT"),
  },

  codeExecution: {
    provider: optional("CODE_EXECUTION_PROVIDER", "disabled"),
    judge0Url: optional("JUDGE0_URL").replace(/\/$/, ""),
    judge0ApiKey: optional("JUDGE0_API_KEY"),
    judge0ApiHost: optional("JUDGE0_API_HOST", "judge0-ce.p.rapidapi.com"),
  },

  voice: {
    sttProvider: optional("VOICE_STT_PROVIDER", "disabled"),
    sttApiKey: optional("VOICE_STT_API_KEY"),
    sttBaseUrl: optional("VOICE_STT_BASE_URL"),
    ttsProvider: optional("VOICE_TTS_PROVIDER", "disabled"),
    ttsApiKey: optional("VOICE_TTS_API_KEY"),
  },

  rateLimit: {
    aiPerMinute: intOr("RATE_LIMIT_AI_PER_MINUTE", 12),
    uploadPerHour: intOr("RATE_LIMIT_UPLOAD_PER_HOUR", 10),
    /** Daily per-user AI budget — the slow-drain guard. */
    aiPerDay: intOr("RATE_LIMIT_AI_PER_DAY", 200),
  },

  limits: {
    /** Hard ceiling on interview turns, regardless of what the user requests. */
    maxInterviewTurns: intOr("MAX_INTERVIEW_TURNS", 20),
    /** Rough context ceiling used to truncate long inputs before a call. */
    maxAiContextChars: intOr("MAX_AI_CONTEXT_CHARS", 60_000),
  },
} as const;

/**
 * True when the AI provider has everything it needs to make a real call.
 *
 * Each provider is checked against its own credential: having an Anthropic key
 * present must not make a Gemini deployment look configured, or the UI would
 * offer AI features that then fail at the first request.
 */
export function isAiConfigured(): boolean {
  switch (env.ai.provider) {
    case "anthropic":
      return Boolean(env.ai.apiKey);
    case "gemini":
      return Boolean(env.ai.geminiApiKey);
    default:
      return false;
  }
}

/**
 * True when a realtime voice interview can actually run.
 *
 * Live sessions are Gemini-only in this deployment: the browser connects with
 * an ephemeral Google token, which has no Anthropic equivalent. An Anthropic
 * deployment therefore reports voice as unavailable rather than offering a
 * control that cannot work.
 */
export function isLiveVoiceConfigured(): boolean {
  return env.ai.provider === "gemini" && Boolean(env.ai.geminiApiKey);
}

/** The env var name a deployment needs to set, for "not configured" copy. */
export function aiKeyEnvVar(): string {
  return env.ai.provider === "gemini" ? "GEMINI_API_KEY" : "ANTHROPIC_API_KEY";
}

/**
 * `.env` line to show in a "not configured" notice.
 *
 * Provider-aware so a Gemini deployment is not told to add an Anthropic key —
 * a hint that names the wrong variable is worse than no hint, because the user
 * follows it and the feature still does not work.
 */
export function aiKeyEnvHint(): string {
  return env.ai.provider === "gemini"
    ? 'GEMINI_API_KEY="AIza..."'
    : 'ANTHROPIC_API_KEY="sk-ant-..."';
}

/** True when a real sandbox is wired up for running submitted code. */
export function isCodeExecutionConfigured(): boolean {
  return env.codeExecution.provider === "judge0"
    ? Boolean(env.codeExecution.judge0Url)
    : false;
}
