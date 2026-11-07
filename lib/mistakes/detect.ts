/**
 * Mistake detection — pure functions, no I/O.
 *
 * The problem this solves: an evaluator returns free text like
 * "Did not distinguish a process from a thread". Stored verbatim, that never
 * matches the next occurrence and "repeated mistake" detection is impossible.
 *
 * So every mistake is normalised to a stable `concept` slug. Two phrasings of
 * the same underlying error collapse onto one slug and increment a counter.
 */

export type MistakeSeverity = "LOW" | "MEDIUM" | "HIGH";

export type DetectedMistake = {
  /** Stable dedupe key, e.g. "process-vs-thread". */
  concept: string;
  /** Human-readable label for the UI. */
  label: string;
  severity: MistakeSeverity;
  /** The specific wording from this occurrence. */
  detail: string;
};

/**
 * Canonical concepts.
 *
 * Ordered most-specific-first: "deadlock conditions" must win over the
 * broader "concurrency" pattern.
 */
type ConceptRule = {
  concept: string;
  label: string;
  severity: MistakeSeverity;
  patterns: RegExp[];
};

export const CONCEPT_RULES: ConceptRule[] = [
  {
    concept: "process-vs-thread",
    label: "Confusing processes and threads",
    severity: "HIGH",
    patterns: [/process.{0,20}thread|thread.{0,20}process/i],
  },
  {
    concept: "time-complexity",
    label: "Incorrect time-complexity analysis",
    severity: "HIGH",
    patterns: [/time complexity|\bbig-?o\b|complexity analysis|asymptotic/i],
  },
  {
    concept: "space-complexity",
    label: "Ignoring space complexity",
    severity: "MEDIUM",
    patterns: [/space complexity|memory usage|auxiliary space/i],
  },
  {
    concept: "sql-joins",
    label: "Misunderstanding SQL joins",
    severity: "HIGH",
    patterns: [/\bjoin\b|inner join|outer join|left join/i],
  },
  {
    concept: "normalization",
    label: "Weak grasp of normalisation",
    severity: "MEDIUM",
    patterns: [/normalis|normaliz|\b[123]nf\b|\bbcnf\b|functional dependenc/i],
  },
  {
    concept: "acid-isolation",
    label: "Confusing ACID / isolation levels",
    severity: "MEDIUM",
    patterns: [/\bacid\b|isolation level|dirty read|phantom read|repeatable read/i],
  },
  {
    concept: "indexing-tradeoffs",
    label: "Missing indexing trade-offs",
    severity: "MEDIUM",
    patterns: [/\bindex(ing|es)?\b/i],
  },
  {
    concept: "deadlock-conditions",
    label: "Incomplete deadlock conditions",
    severity: "MEDIUM",
    patterns: [/deadlock|coffman|circular wait|hold and wait/i],
  },
  {
    concept: "tcp-vs-udp",
    label: "Confusing TCP and UDP guarantees",
    severity: "MEDIUM",
    patterns: [/tcp.{0,20}udp|udp.{0,20}tcp|reliable delivery|three-?way handshake/i],
  },
  {
    concept: "edge-cases",
    label: "Not considering edge cases",
    severity: "MEDIUM",
    patterns: [/edge case|boundary condition|empty input|null check|off-by-one/i],
  },
  {
    concept: "star-structure",
    label: "Answer missing STAR structure",
    severity: "MEDIUM",
    patterns: [/\bstar\b|situation.{0,30}task|no clear structure|unstructured answer/i],
  },
  {
    concept: "no-measurable-result",
    label: "No measurable result given",
    severity: "LOW",
    patterns: [/measurable|quantif|no result|impact|outcome was not/i],
  },
  {
    concept: "vague-answer",
    label: "Answers too vague / lacking specifics",
    severity: "MEDIUM",
    patterns: [/vague|too general|lacked specific|not specific|generic answer|superficial/i],
  },
  {
    concept: "oop-principles",
    label: "Mixing up OOP principles",
    severity: "MEDIUM",
    patterns: [/encapsulat|abstraction|polymorph|inheritance/i],
  },
  {
    concept: "concurrency-safety",
    label: "Missing concurrency-safety reasoning",
    severity: "HIGH",
    patterns: [/race condition|mutex|semaphore|thread-?safe|synchroni[sz]/i],
  },
  {
    concept: "scalability-tradeoffs",
    label: "Not addressing scalability trade-offs",
    severity: "MEDIUM",
    patterns: [/scalab|bottleneck|horizontal scal|sharding|partition/i],
  },
  {
    concept: "caching-strategy",
    label: "No caching strategy considered",
    severity: "LOW",
    // `ttl` must be word-bounded — unanchored it matches inside "a little".
    patterns: [/cach(e|ing)|invalidation|\bttl\b/i],
  },
  {
    concept: "error-handling",
    label: "Error handling not addressed",
    severity: "MEDIUM",
    patterns: [/error handling|exception|failure mode|what if it fails/i],
  },
  {
    concept: "security-depth",
    label: "Shallow security reasoning",
    severity: "HIGH",
    patterns: [/security|authenticat|authoris|authoriz|\bjwt\b|encryption|hashing password/i],
  },
];

/**
 * Maps one "missing point" from an evaluation onto a canonical concept.
 * Returns null when nothing matches — an unrecognised note is better dropped
 * than forced into a bucket it does not belong in.
 */
export function classifyMissingPoint(point: string): DetectedMistake | null {
  const text = point.trim();
  if (text.length < 4) return null;

  for (const rule of CONCEPT_RULES) {
    if (rule.patterns.some((pattern) => pattern.test(text))) {
      return {
        concept: rule.concept,
        label: rule.label,
        severity: rule.severity,
        detail: text.slice(0, 500),
      };
    }
  }
  return null;
}

/**
 * Extracts every distinct mistake from one graded answer.
 *
 * Only runs on genuinely weak answers: a candidate who scored 9/10 with one
 * pedantic nitpick has not made a "mistake" worth remembering, and recording
 * one would pollute the memory with noise.
 */
export function detectMistakes(args: {
  score: number;
  missingPoints: string[];
  scoreThreshold?: number;
}): DetectedMistake[] {
  const threshold = args.scoreThreshold ?? 7;
  if (args.score >= threshold) return [];

  const found = new Map<string, DetectedMistake>();
  for (const point of args.missingPoints) {
    const mistake = classifyMissingPoint(point);
    if (mistake && !found.has(mistake.concept)) {
      found.set(mistake.concept, mistake);
    }
  }

  // A very weak answer with no classifiable gap is still a real signal.
  if (found.size === 0 && args.score <= 3 && args.missingPoints.length > 0) {
    found.set("vague-answer", {
      concept: "vague-answer",
      label: "Answers too vague / lacking specifics",
      severity: "MEDIUM",
      detail: args.missingPoints[0].slice(0, 500),
    });
  }

  return [...found.values()];
}

/**
 * Status of a tracked mistake given its history.
 *
 * RESOLVED means it has not recurred in a while AND was seen enough times to
 * have been a real pattern — a one-off does not get to "graduate".
 */
export function evaluateMistakeStatus(args: {
  frequency: number;
  lastSeenAt: Date;
  now?: Date;
  resolvedAfterDays?: number;
  improvingAfterDays?: number;
}): "ACTIVE" | "IMPROVING" | "RESOLVED" {
  const now = args.now ?? new Date();
  const resolvedAfter = args.resolvedAfterDays ?? 30;
  const improvingAfter = args.improvingAfterDays ?? 14;

  const daysSince =
    (now.getTime() - args.lastSeenAt.getTime()) / 86_400_000;

  if (daysSince >= resolvedAfter) return "RESOLVED";
  if (daysSince >= improvingAfter) return "IMPROVING";
  return "ACTIVE";
}

/** A mistake is "repeated" once it has been seen more than once. */
export function isRepeated(frequency: number): boolean {
  return frequency > 1;
}

/**
 * Priority for surfacing on the dashboard.
 * Frequency dominates: something wrong four times matters more than one
 * high-severity slip.
 */
export function mistakePriority(args: {
  frequency: number;
  severity: MistakeSeverity;
  status: "ACTIVE" | "IMPROVING" | "RESOLVED";
}): number {
  if (args.status === "RESOLVED") return 0;
  const severityWeight = { LOW: 1, MEDIUM: 2, HIGH: 3 }[args.severity];
  const statusWeight = args.status === "ACTIVE" ? 1 : 0.5;
  return args.frequency * severityWeight * statusWeight;
}
