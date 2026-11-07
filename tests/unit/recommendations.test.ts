import { describe, expect, it } from "vitest";

import {
  runRecommendationEngine,
  WEAK_TOPIC_THRESHOLD,
  type SignalSet,
  type TopicSignal,
} from "@/lib/recommendations/engine";

function topic(overrides: Partial<TopicSignal> = {}): TopicSignal {
  return {
    topic: "SQL joins",
    category: "DBMS",
    averageScore: 42,
    attempts: 3,
    lastPracticedAt: new Date(),
    ...overrides,
  };
}

/** A fully onboarded, active user with nothing to flag. */
function baseSignals(overrides: Partial<SignalSet> = {}): SignalSet {
  return {
    topics: [],
    interviewsCompleted: 3,
    assessmentsCompleted: 3,
    problemsSolved: 3,
    hasResume: true,
    hasAnalyzedResume: true,
    hasTargetRole: true,
    hasSkills: true,
    jobDescriptionGaps: [],
    daysSinceLastActivity: 1,
    ...overrides,
  };
}

describe("recommendation engine", () => {
  it("recommends nothing for an active user with no weak areas", () => {
    expect(runRecommendationEngine(baseSignals())).toHaveLength(0);
  });

  it("recommends practice for a weak topic and cites the actual score", () => {
    const result = runRecommendationEngine(
      baseSignals({ topics: [topic({ topic: "SQL joins", averageScore: 42 })] }),
    );

    expect(result.length).toBeGreaterThan(0);
    const study = result.find((item) => item.kind === "TOPIC_STUDY");
    expect(study).toBeDefined();
    expect(study!.topic).toBe("SQL joins");
    // The requirement is that the reason is evidence-based, not generic.
    expect(study!.reason).toContain("42%");
    expect(study!.reason).toContain("SQL joins");
  });

  it("does not recommend practice for a topic above the weak threshold", () => {
    const result = runRecommendationEngine(
      baseSignals({
        topics: [topic({ averageScore: WEAK_TOPIC_THRESHOLD + 5 })],
      }),
    );
    expect(result.filter((item) => item.kind === "TOPIC_STUDY")).toHaveLength(0);
  });

  it("escalates a critically weak topic to HIGH priority", () => {
    const critical = runRecommendationEngine(
      baseSignals({ topics: [topic({ averageScore: 25 })] }),
    ).find((item) => item.kind === "TOPIC_STUDY");

    const moderate = runRecommendationEngine(
      baseSignals({ topics: [topic({ averageScore: 55 })] }),
    ).find((item) => item.kind === "TOPIC_STUDY");

    expect(critical!.priority).toBe("HIGH");
    expect(moderate!.priority).toBe("MEDIUM");
  });

  it("adds a coding recommendation only for critically weak DSA topics", () => {
    const dsa = runRecommendationEngine(
      baseSignals({
        topics: [topic({ topic: "Graphs", category: "DSA", averageScore: 20 })],
      }),
    );
    const dbms = runRecommendationEngine(
      baseSignals({
        topics: [topic({ topic: "Indexing", category: "DBMS", averageScore: 20 })],
      }),
    );

    expect(dsa.some((item) => item.kind === "CODING")).toBe(true);
    expect(dbms.some((item) => item.kind === "CODING")).toBe(false);
  });

  it("is not hard-coded to one topic — it reacts to whatever is weakest", () => {
    const result = runRecommendationEngine(
      baseSignals({
        topics: [
          topic({ topic: "Deadlocks", category: "OPERATING_SYSTEMS", averageScore: 30 }),
          topic({ topic: "TCP", category: "COMPUTER_NETWORKS", averageScore: 45 }),
        ],
      }),
    );

    const targeted = result.map((item) => item.topic);
    expect(targeted).toContain("Deadlocks");
    expect(targeted).toContain("TCP");
  });

  it("caps the number of weak topics it acts on so the list stays readable", () => {
    const many = Array.from({ length: 10 }, (_, index) =>
      topic({ topic: `Topic ${index}`, averageScore: 20 + index }),
    );
    const result = runRecommendationEngine(baseSignals({ topics: many }), 8);

    expect(result.length).toBeLessThanOrEqual(8);
    // Only the three weakest topics are targeted.
    const targeted = new Set(
      result.filter((item) => item.kind === "TOPIC_STUDY").map((item) => item.topic),
    );
    expect(targeted.size).toBeLessThanOrEqual(3);
  });

  it("orders HIGH priority recommendations first", () => {
    const result = runRecommendationEngine(
      baseSignals({
        topics: [topic({ topic: "Weak", averageScore: 20 })],
        hasTargetRole: false,
      }),
    );
    expect(result[0].priority).toBe("HIGH");
  });

  it("prompts onboarding steps that are actually missing", () => {
    const result = runRecommendationEngine(
      baseSignals({
        hasTargetRole: false,
        hasSkills: false,
        hasResume: false,
      }),
    );

    const kinds = result.map((item) => item.kind);
    expect(kinds).toContain("PROFILE");
    expect(kinds).toContain("RESUME");
    expect(result.find((item) => item.topic === "profile")!.priority).toBe("HIGH");
  });

  it("flags an uploaded-but-unanalysed resume separately", () => {
    const result = runRecommendationEngine(
      baseSignals({ hasResume: true, hasAnalyzedResume: false }),
    );
    const resume = result.find((item) => item.kind === "RESUME");
    expect(resume).toBeDefined();
    expect(resume!.reason).toContain("never analysed");
  });

  it("nudges each pillar the user has not tried yet", () => {
    const result = runRecommendationEngine(
      baseSignals({
        interviewsCompleted: 0,
        assessmentsCompleted: 0,
        problemsSolved: 0,
      }),
    );
    const kinds = result.map((item) => item.kind);
    expect(kinds).toContain("INTERVIEW");
    expect(kinds).toContain("ASSESSMENT");
    expect(kinds).toContain("CODING");
  });

  it("turns job-description gaps into HIGH priority actions", () => {
    const result = runRecommendationEngine(
      baseSignals({ jobDescriptionGaps: ["Kubernetes", "gRPC"] }),
    );
    const gap = result.find((item) => item.topic === "Kubernetes");
    expect(gap).toBeDefined();
    expect(gap!.priority).toBe("HIGH");
    expect(gap!.reason).toContain("job description");
  });

  it("re-engages a user who has been away for over a week", () => {
    const away = runRecommendationEngine(
      baseSignals({ daysSinceLastActivity: 12 }),
    );
    const recent = runRecommendationEngine(
      baseSignals({ daysSinceLastActivity: 3 }),
    );

    expect(away.some((item) => item.topic === "consistency")).toBe(true);
    expect(recent.some((item) => item.topic === "consistency")).toBe(false);
  });

  it("suggests raising difficulty once the user is consistently strong", () => {
    const result = runRecommendationEngine(
      baseSignals({
        topics: [
          topic({ topic: "Arrays", averageScore: 92, attempts: 4 }),
          topic({ topic: "Sorting", averageScore: 88, attempts: 3 }),
        ],
        interviewsCompleted: 4,
      }),
    );
    expect(result.some((item) => item.topic === "difficulty")).toBe(true);
  });

  it("de-duplicates by (kind, topic), keeping the highest priority", () => {
    const result = runRecommendationEngine(
      baseSignals({
        topics: [topic({ topic: "SQL", averageScore: 20 })],
        interviewsCompleted: 0,
      }),
    );
    const keys = result.map((item) => `${item.kind}:${item.topic}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("gives every recommendation a working action link", () => {
    const result = runRecommendationEngine(
      baseSignals({ topics: [topic({ averageScore: 20 })], hasResume: false }),
    );
    for (const item of result) {
      expect(item.actionUrl).toMatch(/^\//);
      expect(item.actionLabel.length).toBeGreaterThan(0);
    }
  });
});
