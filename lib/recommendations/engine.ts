import type { QuestionCategory } from "@prisma/client";

/**
 * Rule-based recommendation engine.
 *
 * Deliberately NOT a pile of `if (topic === "SQL")` branches. A recommendation
 * is produced by evaluating a list of declarative `Rule` objects against a
 * `SignalSet`, so adding a new behaviour means appending one rule — the engine
 * itself never changes.
 *
 * The AI layer can add recommendations on top of this (see
 * `AIService.generateRecommendations`), but the engine works on its own with
 * no API key, which is why the dashboard is never empty for a configured user.
 */

export type RecommendationKind =
  | "ASSESSMENT"
  | "INTERVIEW"
  | "CODING"
  | "TOPIC_STUDY"
  | "RESUME"
  | "PROFILE";

export type Priority = "LOW" | "MEDIUM" | "HIGH";

export type TopicSignal = {
  topic: string;
  category: QuestionCategory;
  averageScore: number;
  attempts: number;
  lastPracticedAt: Date;
};

export type SignalSet = {
  topics: TopicSignal[];
  interviewsCompleted: number;
  assessmentsCompleted: number;
  problemsSolved: number;
  hasResume: boolean;
  hasAnalyzedResume: boolean;
  hasTargetRole: boolean;
  hasSkills: boolean;
  /** Topics required by the most recent job description, if any. */
  jobDescriptionGaps: string[];
  daysSinceLastActivity: number | null;
};

export type GeneratedRecommendation = {
  kind: RecommendationKind;
  priority: Priority;
  title: string;
  reason: string;
  topic: string | null;
  category: QuestionCategory | null;
  actionUrl: string;
  actionLabel: string;
  triggerScore: number | null;
};

type Rule = {
  id: string;
  /** Returns zero or more recommendations. Empty means "rule did not fire". */
  evaluate: (signals: SignalSet) => GeneratedRecommendation[];
};

/** Anything below this counts as a weak topic worth recommending practice on. */
export const WEAK_TOPIC_THRESHOLD = 60;
const CRITICAL_TOPIC_THRESHOLD = 40;

function categoryUrl(base: string, category: QuestionCategory | null): string {
  return category ? `${base}?category=${category}` : base;
}

/**
 * The rule set.
 *
 * Order matters only for readability — `runRecommendationEngine` sorts by
 * priority and caps the list afterwards.
 */
export const RULES: Rule[] = [
  // 1. Weak topics → a three-pronged practice plan (assess → drill → interview).
  {
    id: "weak-topics",
    evaluate: (signals) => {
      const weak = signals.topics
        .filter(
          (topic) =>
            topic.attempts > 0 && topic.averageScore < WEAK_TOPIC_THRESHOLD,
        )
        .sort((a, b) => a.averageScore - b.averageScore)
        .slice(0, 3);

      return weak.flatMap((topic) => {
        const critical = topic.averageScore < CRITICAL_TOPIC_THRESHOLD;
        const rounded = Math.round(topic.averageScore);
        const priority: Priority = critical ? "HIGH" : "MEDIUM";
        const reason = `You are averaging ${rounded}% on ${topic.topic} across ${topic.attempts} attempt${
          topic.attempts === 1 ? "" : "s"
        } — your weakest measured area.`;

        const items: GeneratedRecommendation[] = [
          {
            kind: "TOPIC_STUDY",
            priority,
            title: `Review ${topic.topic} fundamentals`,
            reason,
            topic: topic.topic,
            category: topic.category,
            actionUrl: categoryUrl("/assessments", topic.category),
            actionLabel: "Find practice",
            triggerScore: topic.averageScore,
          },
          {
            kind: "ASSESSMENT",
            priority,
            title: `Take a ${topic.topic} assessment`,
            reason: `A focused ${topic.topic} set will show whether the gap is fundamentals or application.`,
            topic: topic.topic,
            category: topic.category,
            actionUrl: categoryUrl("/assessments", topic.category),
            actionLabel: "Start assessment",
            triggerScore: topic.averageScore,
          },
        ];

        // Only push the harder follow-ups once the gap is genuinely serious.
        if (critical) {
          items.push({
            kind: "INTERVIEW",
            priority: "MEDIUM",
            title: `Run a technical interview on ${topic.topic}`,
            reason: `Explaining ${topic.topic} out loud is the fastest way to find the holes a multiple-choice test hides.`,
            topic: topic.topic,
            category: topic.category,
            actionUrl: "/interview/new?type=TECHNICAL",
            actionLabel: "Start interview",
            triggerScore: topic.averageScore,
          });
          if (topic.category === "DSA") {
            items.push({
              kind: "CODING",
              priority: "MEDIUM",
              title: `Solve coding problems on ${topic.topic}`,
              reason: `DSA scores improve fastest with implementation practice, not reading.`,
              topic: topic.topic,
              category: topic.category,
              actionUrl: "/coding",
              actionLabel: "Practise coding",
              triggerScore: topic.averageScore,
            });
          }
        }

        return items;
      });
    },
  },

  // 2. Gaps the target job description exposed.
  {
    id: "job-description-gaps",
    evaluate: (signals) =>
      signals.jobDescriptionGaps.slice(0, 3).map((skill) => ({
        kind: "TOPIC_STUDY" as const,
        priority: "HIGH" as const,
        title: `Close your ${skill} gap`,
        reason: `The job description you analysed lists ${skill} as a requirement, and there is no evidence of it in your profile or resume.`,
        topic: skill,
        category: null,
        actionUrl: "/assessments",
        actionLabel: "Start practising",
        triggerScore: null,
      })),
  },

  // 3. Onboarding — the things that make every other feature work better.
  {
    id: "onboarding",
    evaluate: (signals) => {
      const items: GeneratedRecommendation[] = [];
      if (!signals.hasTargetRole) {
        items.push({
          kind: "PROFILE",
          priority: "HIGH",
          title: "Set your target role",
          reason:
            "Interview questions, recommendations and job matching are all tailored to your target role.",
          topic: "profile",
          category: null,
          actionUrl: "/profile",
          actionLabel: "Update profile",
          triggerScore: null,
        });
      }
      if (!signals.hasSkills) {
        items.push({
          kind: "PROFILE",
          priority: "MEDIUM",
          title: "Add your skills",
          reason:
            "Without a skill list the interviewer has to ask generic questions instead of ones aimed at what you know.",
          topic: "skills",
          category: null,
          actionUrl: "/profile",
          actionLabel: "Add skills",
          triggerScore: null,
        });
      }
      if (!signals.hasResume) {
        items.push({
          kind: "RESUME",
          priority: "MEDIUM",
          title: "Upload your resume",
          reason:
            "With a resume on file the AI can ask about your actual projects instead of hypothetical ones.",
          topic: "resume",
          category: null,
          actionUrl: "/resume",
          actionLabel: "Upload resume",
          triggerScore: null,
        });
      } else if (!signals.hasAnalyzedResume) {
        items.push({
          kind: "RESUME",
          priority: "LOW",
          title: "Finish analysing your resume",
          reason:
            "Your resume was uploaded but never analysed, so none of its content is feeding your practice.",
          topic: "resume",
          category: null,
          actionUrl: "/resume",
          actionLabel: "Analyse resume",
          triggerScore: null,
        });
      }
      return items;
    },
  },

  // 4. First-run nudges — one per pillar the user has not tried yet.
  {
    id: "first-run",
    evaluate: (signals) => {
      const items: GeneratedRecommendation[] = [];
      if (signals.interviewsCompleted === 0) {
        items.push({
          kind: "INTERVIEW",
          priority: "HIGH",
          title: "Run your first mock interview",
          reason:
            "One 20-minute session gives you a scored breakdown across technical depth, communication and structure.",
          topic: "getting-started",
          category: null,
          actionUrl: "/interview/new",
          actionLabel: "Start interview",
          triggerScore: null,
        });
      }
      if (signals.assessmentsCompleted === 0) {
        items.push({
          kind: "ASSESSMENT",
          priority: "MEDIUM",
          title: "Take your first assessment",
          reason:
            "A short assessment is the quickest way to find out which topics need work.",
          topic: "getting-started",
          category: null,
          actionUrl: "/assessments",
          actionLabel: "Browse assessments",
          triggerScore: null,
        });
      }
      if (signals.problemsSolved === 0) {
        items.push({
          kind: "CODING",
          priority: "LOW",
          title: "Solve your first coding problem",
          reason:
            "Coding rounds are where most technical interviews are decided.",
          topic: "getting-started",
          category: null,
          actionUrl: "/coding",
          actionLabel: "Browse problems",
          triggerScore: null,
        });
      }
      return items;
    },
  },

  // 5. Re-engagement.
  {
    id: "inactivity",
    evaluate: (signals) => {
      if (signals.daysSinceLastActivity === null) return [];
      if (signals.daysSinceLastActivity < 7) return [];
      return [
        {
          kind: "ASSESSMENT",
          priority: "MEDIUM",
          title: "Get back into practice",
          reason: `It has been ${signals.daysSinceLastActivity} days since your last session. A short assessment is an easy way to restart.`,
          topic: "consistency",
          category: null,
          actionUrl: "/assessments",
          actionLabel: "Take a quick assessment",
          triggerScore: null,
        },
      ];
    },
  },

  // 6. Stretch goal — raise difficulty once the user is genuinely strong.
  {
    id: "level-up",
    evaluate: (signals) => {
      const strong = signals.topics.filter(
        (topic) => topic.attempts >= 2 && topic.averageScore >= 85,
      );
      if (strong.length < 2 || signals.interviewsCompleted < 2) return [];
      return [
        {
          kind: "INTERVIEW",
          priority: "LOW",
          title: "Step up to a hard interview",
          reason: `You are averaging 85%+ on ${strong
            .slice(0, 2)
            .map((topic) => topic.topic)
            .join(" and ")}. Raise the difficulty to keep improving.`,
          topic: "difficulty",
          category: null,
          actionUrl: "/interview/new?difficulty=HARD",
          actionLabel: "Start a hard interview",
          triggerScore: null,
        },
      ];
    },
  },
];

const PRIORITY_ORDER: Record<Priority, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };

/**
 * Runs every rule, de-duplicates by (kind, topic) keeping the highest
 * priority, sorts, and caps the list so the dashboard stays readable.
 */
export function runRecommendationEngine(
  signals: SignalSet,
  limit = 8,
): GeneratedRecommendation[] {
  const all = RULES.flatMap((rule) => {
    try {
      return rule.evaluate(signals);
    } catch (error) {
      console.error(`[recommendations] rule "${rule.id}" failed:`, error);
      return [];
    }
  });

  const deduped = new Map<string, GeneratedRecommendation>();
  for (const item of all) {
    const key = `${item.kind}:${item.topic ?? ""}`;
    const existing = deduped.get(key);
    if (
      !existing ||
      PRIORITY_ORDER[item.priority] < PRIORITY_ORDER[existing.priority]
    ) {
      deduped.set(key, item);
    }
  }

  return [...deduped.values()]
    .sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority])
    .slice(0, limit);
}
