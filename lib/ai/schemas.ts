import { z } from "zod";

/**
 * JSON Schemas passed to the model via `output_config.format`, plus the Zod
 * validators applied to whatever comes back.
 *
 * Two layers on purpose: the JSON Schema constrains generation, the Zod schema
 * is the trust boundary. A provider that ignores the schema (or a future
 * provider without structured-output support) still cannot write malformed
 * data into the database.
 *
 * Structured-output limits to respect: every object needs
 * `additionalProperties: false` and a complete `required` list, and numeric
 * bounds (`minimum`/`maximum`) are NOT supported — we clamp in Zod instead.
 */

const score = z.coerce.number().min(0).max(10);
const percent = z.coerce.number().min(0).max(100);

function stringArray(description: string) {
  return { type: "array", items: { type: "string" }, description } as const;
}

// --- Interview question -----------------------------------------------------

export const questionJsonSchema = {
  type: "object",
  properties: {
    question: {
      type: "string",
      description: "The exact words the interviewer says to the candidate.",
    },
    topic: {
      type: "string",
      description: "Short topic label, e.g. 'SQL joins' or 'Conflict handling'.",
    },
    isFollowUp: {
      type: "boolean",
      description: "True when this drills into the candidate's previous answer.",
    },
    rationale: {
      type: "string",
      description: "One sentence on why this question was chosen. Internal only.",
    },
  },
  required: ["question", "topic", "isFollowUp", "rationale"],
  additionalProperties: false,
} as const;

export const questionResponseSchema = z.object({
  question: z.string().min(1).max(1500),
  topic: z.string().min(1).max(80),
  isFollowUp: z.boolean(),
  rationale: z.string().max(600).default(""),
});

// --- Answer evaluation ------------------------------------------------------

export const evaluationJsonSchema = {
  type: "object",
  properties: {
    score: { type: "number", description: "Overall answer quality, 0-10." },
    correctness: { type: "number", description: "Factual accuracy 0-10, or 0 if not applicable." },
    relevance: { type: "number", description: "How well it answers the question, 0-10." },
    clarity: { type: "number", description: "Clarity and conciseness, 0-10." },
    technicalDepth: { type: "number", description: "Depth of technical detail, 0-10." },
    completeness: { type: "number", description: "Coverage of what was asked, 0-10." },
    structure: { type: "number", description: "For behavioural answers, STAR structure 0-10." },
    strengths: stringArray("What the candidate genuinely did well."),
    missingPoints: stringArray("Concrete points a strong answer would have included."),
    feedback: {
      type: "string",
      description: "2-4 sentences of specific, actionable coaching.",
    },
    improvedAnswer: {
      type: "string",
      description:
        "The candidate's own answer rewritten with better structure and wording. Use ONLY facts the candidate stated. Never invent experience, employers, projects or numbers.",
    },
  },
  required: [
    "score",
    "correctness",
    "relevance",
    "clarity",
    "technicalDepth",
    "completeness",
    "structure",
    "strengths",
    "missingPoints",
    "feedback",
    "improvedAnswer",
  ],
  additionalProperties: false,
} as const;

export const evaluationResponseSchema = z.object({
  score,
  correctness: score,
  relevance: score,
  clarity: score,
  technicalDepth: score,
  completeness: score,
  structure: score,
  strengths: z.array(z.string().max(300)).max(10).default([]),
  missingPoints: z.array(z.string().max(300)).max(10).default([]),
  feedback: z.string().max(2000).default(""),
  improvedAnswer: z.string().max(4000).default(""),
});

// --- Interview report -------------------------------------------------------

export const reportJsonSchema = {
  type: "object",
  properties: {
    overallScore: { type: "number", description: "0-100 overall performance." },
    technicalScore: { type: "number", description: "0-100." },
    communicationScore: { type: "number", description: "0-100." },
    problemSolvingScore: { type: "number", description: "0-100." },
    behavioralScore: { type: "number", description: "0-100." },
    structureScore: { type: "number", description: "0-100 answer structure." },
    summary: { type: "string", description: "3-5 sentence honest summary." },
    strengths: stringArray("Strongest areas, grounded in specific answers."),
    weaknesses: stringArray("Weakest areas, grounded in specific answers."),
    repeatedMistakes: stringArray("Patterns that appeared more than once."),
    recommendations: stringArray("Concrete next actions for the candidate."),
    suggestedTopics: stringArray("Topic labels to practise next."),
    evidence: {
      type: "array",
      description:
        "One entry per strength and per weakness, citing the question number it came from.",
      items: {
        type: "object",
        properties: {
          kind: { type: "string", enum: ["STRENGTH", "WEAKNESS"] },
          point: {
            type: "string",
            description: "The strength or weakness, same wording as in the list above.",
          },
          questionIndex: {
            type: "number",
            description:
              "The question number from the transcript that shows this. Must be a real number from the transcript.",
          },
        },
        required: ["kind", "point", "questionIndex"],
        additionalProperties: false,
      },
    },
  },
  required: [
    "overallScore",
    "technicalScore",
    "communicationScore",
    "problemSolvingScore",
    "behavioralScore",
    "structureScore",
    "summary",
    "strengths",
    "weaknesses",
    "repeatedMistakes",
    "recommendations",
    "suggestedTopics",
    "evidence",
  ],
  additionalProperties: false,
} as const;

export const reportResponseSchema = z.object({
  overallScore: percent,
  technicalScore: percent,
  communicationScore: percent,
  problemSolvingScore: percent,
  behavioralScore: percent,
  structureScore: percent,
  summary: z.string().max(3000).default(""),
  strengths: z.array(z.string().max(300)).max(12).default([]),
  weaknesses: z.array(z.string().max(300)).max(12).default([]),
  repeatedMistakes: z.array(z.string().max(300)).max(12).default([]),
  recommendations: z.array(z.string().max(400)).max(12).default([]),
  suggestedTopics: z.array(z.string().max(80)).max(15).default([]),
  /**
   * Defaulted rather than required, so a provider that omits it produces a
   * report with a plain list instead of a failed generation. The index is only
   * bounded here; whether it points at a real answer is decided against the
   * actual turns in `resolveReportEvidence`.
   */
  evidence: z
    .array(
      z.object({
        kind: z.enum(["STRENGTH", "WEAKNESS"]),
        point: z.string().max(300),
        questionIndex: z.coerce.number().int().min(0).max(1000),
      }),
    )
    .max(24)
    .default([]),
});

// --- Resume -----------------------------------------------------------------

const educationJsonSchema = {
  type: "object",
  properties: {
    degree: { type: "string" },
    institution: { type: "string" },
    year: { type: "string" },
    score: { type: "string", description: "CGPA or percentage as written." },
  },
  required: ["degree", "institution", "year", "score"],
  additionalProperties: false,
} as const;

const projectJsonSchema = {
  type: "object",
  properties: {
    name: { type: "string" },
    description: { type: "string" },
    technologies: { type: "array", items: { type: "string" } },
  },
  required: ["name", "description", "technologies"],
  additionalProperties: false,
} as const;

const experienceJsonSchema = {
  type: "object",
  properties: {
    role: { type: "string" },
    organisation: { type: "string" },
    duration: { type: "string" },
    description: { type: "string" },
  },
  required: ["role", "organisation", "duration", "description"],
  additionalProperties: false,
} as const;

export const resumeJsonSchema = {
  type: "object",
  properties: {
    fullName: { type: "string" },
    email: { type: "string" },
    phone: { type: "string" },
    summary: { type: "string", description: "2-4 sentence neutral summary." },
    yearsExperience: { type: "number", description: "Total professional years; 0 for a fresher." },
    education: { type: "array", items: educationJsonSchema },
    skills: stringArray("Skills explicitly stated on the resume."),
    projects: { type: "array", items: projectJsonSchema },
    experience: { type: "array", items: experienceJsonSchema },
    internships: { type: "array", items: experienceJsonSchema },
    certifications: stringArray("Certifications as written."),
    achievements: stringArray("Awards, ranks, publications."),
    technologies: stringArray("Languages, frameworks, tools and databases."),
    strengths: stringArray("What this resume presents well."),
    gaps: stringArray("What a recruiter would find missing or unclear."),
  },
  required: [
    "fullName",
    "email",
    "phone",
    "summary",
    "yearsExperience",
    "education",
    "skills",
    "projects",
    "experience",
    "internships",
    "certifications",
    "achievements",
    "technologies",
    "strengths",
    "gaps",
  ],
  additionalProperties: false,
} as const;

// --- Job description --------------------------------------------------------

const skillMatchJsonSchema = {
  type: "object",
  properties: {
    skill: { type: "string" },
    level: {
      type: "string",
      enum: ["STRONG", "MEDIUM", "WEAK", "MISSING"],
      description: "How well the candidate covers this requirement.",
    },
    score: { type: "number", description: "0-100 coverage for this skill." },
    note: { type: "string", description: "One line of evidence for the rating." },
  },
  required: ["skill", "level", "score", "note"],
  additionalProperties: false,
} as const;

const roadmapJsonSchema = {
  type: "object",
  properties: {
    step: { type: "number" },
    title: { type: "string" },
    detail: { type: "string" },
    estimatedDays: { type: "number" },
  },
  required: ["step", "title", "detail", "estimatedDays"],
  additionalProperties: false,
} as const;

export const jobDescriptionJsonSchema = {
  type: "object",
  properties: {
    requiredSkills: stringArray("Must-have skills stated in the posting."),
    preferredSkills: stringArray("Nice-to-have skills."),
    technologies: stringArray("Concrete technologies named in the posting."),
    responsibilities: stringArray("Day-to-day responsibilities."),
    keywords: stringArray("ATS keywords worth mirroring on a resume."),
    experienceReq: { type: "string", description: "Experience requirement as written." },
    skillMatch: { type: "array", items: skillMatchJsonSchema },
    missingSkills: stringArray("Required skills with no evidence from the candidate."),
    matchScore: { type: "number", description: "0-100 overall fit." },
    roadmap: { type: "array", items: roadmapJsonSchema },
    suggestedTopics: stringArray("Topics to practise, matching the app's topic labels."),
  },
  required: [
    "requiredSkills",
    "preferredSkills",
    "technologies",
    "responsibilities",
    "keywords",
    "experienceReq",
    "skillMatch",
    "missingSkills",
    "matchScore",
    "roadmap",
    "suggestedTopics",
  ],
  additionalProperties: false,
} as const;

// --- Recommendations --------------------------------------------------------

export const recommendationsJsonSchema = {
  type: "object",
  properties: {
    recommendations: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string", description: "Short imperative action." },
          reason: { type: "string", description: "Why, citing the observed data." },
          topic: { type: "string", description: "Topic label this targets." },
          kind: {
            type: "string",
            enum: ["ASSESSMENT", "INTERVIEW", "CODING", "TOPIC_STUDY", "RESUME", "PROFILE"],
          },
          priority: { type: "string", enum: ["LOW", "MEDIUM", "HIGH"] },
        },
        required: ["title", "reason", "topic", "kind", "priority"],
        additionalProperties: false,
      },
    },
  },
  required: ["recommendations"],
  additionalProperties: false,
} as const;

export const recommendationsResponseSchema = z.object({
  recommendations: z
    .array(
      z.object({
        title: z.string().max(160),
        reason: z.string().max(600),
        topic: z.string().max(80),
        kind: z.enum([
          "ASSESSMENT",
          "INTERVIEW",
          "CODING",
          "TOPIC_STUDY",
          "RESUME",
          "PROFILE",
        ]),
        priority: z.enum(["LOW", "MEDIUM", "HIGH"]),
      }),
    )
    .max(12)
    .default([]),
});
