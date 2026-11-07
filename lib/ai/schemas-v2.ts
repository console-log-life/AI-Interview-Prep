import { z } from "zod";

/**
 * JSON Schemas + Zod validators for the V2 AI capabilities.
 *
 * Same two-layer contract as `schemas.ts`: the JSON Schema constrains
 * generation, the Zod schema is the trust boundary. Kept in a separate file
 * purely to stop `schemas.ts` becoming unreadable.
 */

const score10 = z.coerce.number().min(0).max(10);
const score100 = z.coerce.number().min(0).max(100);

function stringArray(description: string) {
  return { type: "array", items: { type: "string" }, description } as const;
}

// --- Resume claims ---------------------------------------------------------

export const claimsJsonSchema = {
  type: "object",
  properties: {
    claims: {
      type: "array",
      items: {
        type: "object",
        properties: {
          claimType: {
            type: "string",
            enum: ["project", "experience", "skill", "achievement"],
          },
          text: {
            type: "string",
            description:
              "The claim in one sentence, quoting the resume's own wording where possible.",
          },
          technologies: stringArray("Technologies named in this specific claim."),
          probes: stringArray(
            "2-4 interview questions that would verify whether the candidate really did this.",
          ),
        },
        required: ["claimType", "text", "technologies", "probes"],
        additionalProperties: false,
      },
    },
  },
  required: ["claims"],
  additionalProperties: false,
} as const;

export const claimsResponseSchema = z.object({
  claims: z
    .array(
      z.object({
        claimType: z.enum(["project", "experience", "skill", "achievement"]),
        text: z.string().min(5).max(600),
        technologies: z.array(z.string().max(60)).max(20).default([]),
        probes: z.array(z.string().max(400)).max(6).default([]),
      }),
    )
    .max(30)
    .default([]),
});

// --- Code review -----------------------------------------------------------

export const codeReviewJsonSchema = {
  type: "object",
  properties: {
    correctness: { type: "number", description: "0-100, informed by the test verdict." },
    timeComplexity: { type: "string", description: "Big-O of the submitted code, e.g. O(n log n)." },
    spaceComplexity: { type: "string", description: "Auxiliary space, e.g. O(1)." },
    readability: { type: "number", description: "0-100." },
    maintainability: { type: "number", description: "0-100." },
    efficiency: { type: "number", description: "0-100 relative to the optimal approach." },
    summary: { type: "string", description: "2-4 sentences on the solution overall." },
    issues: {
      type: "array",
      items: {
        type: "object",
        properties: {
          severity: { type: "string", enum: ["LOW", "MEDIUM", "HIGH"] },
          title: { type: "string" },
          detail: { type: "string" },
          line: { type: "number", description: "1-based line number, or 0 if not line-specific." },
        },
        required: ["severity", "title", "detail", "line"],
        additionalProperties: false,
      },
    },
    edgeCases: stringArray("Edge cases the submitted code does not handle."),
    optimizationNotes: {
      type: "string",
      description: "How the approach could be improved, described in prose. No code.",
    },
    optimizedApproach: {
      type: "string",
      description:
        "A better approach WITH code, but ONLY if explicitly requested; otherwise return an empty string.",
    },
    learningPoints: stringArray("Concepts the candidate should study next."),
  },
  required: [
    "correctness", "timeComplexity", "spaceComplexity", "readability",
    "maintainability", "efficiency", "summary", "issues", "edgeCases",
    "optimizationNotes", "optimizedApproach", "learningPoints",
  ],
  additionalProperties: false,
} as const;

export const codeReviewResponseSchema = z.object({
  correctness: score100,
  timeComplexity: z.string().max(60).default("unknown"),
  spaceComplexity: z.string().max(60).default("unknown"),
  readability: score100,
  maintainability: score100,
  efficiency: score100,
  summary: z.string().max(2000).default(""),
  issues: z
    .array(
      z.object({
        severity: z.enum(["LOW", "MEDIUM", "HIGH"]),
        title: z.string().max(200),
        detail: z.string().max(1000),
        line: z.coerce.number().int().min(0).max(100000).default(0),
      }),
    )
    .max(25)
    .default([]),
  edgeCases: z.array(z.string().max(300)).max(15).default([]),
  optimizationNotes: z.string().max(2500).default(""),
  optimizedApproach: z.string().max(6000).default(""),
  learningPoints: z.array(z.string().max(200)).max(10).default([]),
});

// --- AI coach --------------------------------------------------------------

export const coachJsonSchema = {
  type: "object",
  properties: {
    answer: {
      type: "string",
      description:
        "The reply, in Markdown. Cite the candidate's real numbers. Never invent data.",
    },
    suggestedTasks: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          kind: {
            type: "string",
            enum: ["ASSESSMENT", "INTERVIEW", "CODING", "STUDY", "RESUME", "REVIEW"],
          },
          topic: { type: "string" },
          estimatedMin: { type: "number" },
        },
        required: ["title", "kind", "topic", "estimatedMin"],
        additionalProperties: false,
      },
    },
    citedFacts: stringArray(
      "The specific data points from the context that the answer relied on.",
    ),
  },
  required: ["answer", "suggestedTasks", "citedFacts"],
  additionalProperties: false,
} as const;

export const coachResponseSchema = z.object({
  answer: z.string().min(1).max(6000),
  suggestedTasks: z
    .array(
      z.object({
        title: z.string().max(200),
        kind: z.enum(["ASSESSMENT", "INTERVIEW", "CODING", "STUDY", "RESUME", "REVIEW"]),
        topic: z.string().max(80),
        estimatedMin: z.coerce.number().int().min(5).max(240).default(30),
      }),
    )
    .max(6)
    .default([]),
  citedFacts: z.array(z.string().max(300)).max(12).default([]),
});

// --- Roadmap ---------------------------------------------------------------

export const roadmapJsonSchema = {
  type: "object",
  properties: {
    title: { type: "string" },
    summary: { type: "string", description: "2-3 sentences on the plan's strategy." },
    tasks: {
      type: "array",
      items: {
        type: "object",
        properties: {
          day: { type: "number", description: "1-based day within the horizon." },
          title: { type: "string" },
          detail: { type: "string" },
          kind: {
            type: "string",
            enum: ["ASSESSMENT", "INTERVIEW", "CODING", "STUDY", "RESUME", "REVIEW"],
          },
          topic: { type: "string" },
          estimatedMin: { type: "number" },
        },
        required: ["day", "title", "detail", "kind", "topic", "estimatedMin"],
        additionalProperties: false,
      },
    },
  },
  required: ["title", "summary", "tasks"],
  additionalProperties: false,
} as const;

export const roadmapResponseSchema = z.object({
  title: z.string().max(160),
  summary: z.string().max(1200).default(""),
  tasks: z
    .array(
      z.object({
        day: z.coerce.number().int().min(1).max(120),
        title: z.string().max(200),
        detail: z.string().max(800).default(""),
        kind: z.enum(["ASSESSMENT", "INTERVIEW", "CODING", "STUDY", "RESUME", "REVIEW"]),
        topic: z.string().max(80).default(""),
        estimatedMin: z.coerce.number().int().min(5).max(240).default(30),
      }),
    )
    .max(200)
    .default([]),
});

// --- Question generation ---------------------------------------------------

export const questionsJsonSchema = {
  type: "object",
  properties: {
    questions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          text: { type: "string" },
          type: {
            type: "string",
            enum: ["MCQ", "MULTI_SELECT", "TRUE_FALSE", "SHORT_ANSWER"],
          },
          topic: { type: "string" },
          subtopic: { type: "string" },
          difficulty: { type: "string", enum: ["EASY", "MEDIUM", "HARD"] },
          cognitiveLevel: {
            type: "string",
            enum: ["RECALL", "UNDERSTAND", "APPLY", "ANALYSE"],
          },
          estimatedTimeSec: { type: "number" },
          options: {
            type: "array",
            items: {
              type: "object",
              properties: {
                text: { type: "string" },
                isCorrect: { type: "boolean" },
              },
              required: ["text", "isCorrect"],
              additionalProperties: false,
            },
          },
          expectedAnswer: {
            type: "string",
            description: "Reference answer for SHORT_ANSWER; empty string otherwise.",
          },
          explanation: {
            type: "string",
            description: "Why the correct answer is correct.",
          },
          skillsTested: stringArray("Skills this question tests."),
        },
        required: [
          "text", "type", "topic", "subtopic", "difficulty", "cognitiveLevel",
          "estimatedTimeSec", "options", "expectedAnswer", "explanation",
          "skillsTested",
        ],
        additionalProperties: false,
      },
    },
  },
  required: ["questions"],
  additionalProperties: false,
} as const;

export const questionsResponseSchema = z.object({
  questions: z
    .array(
      z.object({
        text: z.string().min(10).max(3000),
        type: z.enum(["MCQ", "MULTI_SELECT", "TRUE_FALSE", "SHORT_ANSWER"]),
        topic: z.string().min(1).max(80),
        subtopic: z.string().max(80).default(""),
        difficulty: z.enum(["EASY", "MEDIUM", "HARD"]),
        cognitiveLevel: z
          .enum(["RECALL", "UNDERSTAND", "APPLY", "ANALYSE"])
          .default("UNDERSTAND"),
        estimatedTimeSec: z.coerce.number().int().min(10).max(1800).default(60),
        options: z
          .array(
            z.object({
              text: z.string().min(1).max(600),
              isCorrect: z.boolean(),
            }),
          )
          .max(10)
          .default([]),
        expectedAnswer: z.string().max(4000).default(""),
        explanation: z.string().max(3000).default(""),
        skillsTested: z.array(z.string().max(60)).max(15).default([]),
      }),
    )
    .max(40)
    .default([]),
});

// --- Communication analysis ------------------------------------------------

export const communicationJsonSchema = {
  type: "object",
  properties: {
    clarity: { type: "number", description: "0-10." },
    structure: { type: "number", description: "0-10." },
    conciseness: { type: "number", description: "0-10; penalise padding and rambling." },
    technicalExplanation: { type: "number", description: "0-10." },
    starCoverage: {
      type: "object",
      properties: {
        situation: { type: "boolean" },
        task: { type: "boolean" },
        action: { type: "boolean" },
        result: { type: "boolean" },
      },
      required: ["situation", "task", "action", "result"],
      additionalProperties: false,
    },
    observations: stringArray(
      "Specific, observable features of the writing. No psychological claims.",
    ),
    coaching: { type: "string", description: "2-3 sentences of actionable advice." },
  },
  required: [
    "clarity", "structure", "conciseness", "technicalExplanation",
    "starCoverage", "observations", "coaching",
  ],
  additionalProperties: false,
} as const;

export const communicationResponseSchema = z.object({
  clarity: score10,
  structure: score10,
  conciseness: score10,
  technicalExplanation: score10,
  starCoverage: z.object({
    situation: z.boolean(),
    task: z.boolean(),
    action: z.boolean(),
    result: z.boolean(),
  }),
  observations: z.array(z.string().max(300)).max(10).default([]),
  coaching: z.string().max(1500).default(""),
});
