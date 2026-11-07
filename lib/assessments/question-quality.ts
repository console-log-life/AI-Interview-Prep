import { createHash } from "node:crypto";

/**
 * Question quality engine — pure functions, no I/O.
 *
 * AI-generated questions are untrusted content. Schema validation only proves
 * the SHAPE is right; it says nothing about whether the question is any good.
 * These rules catch the failures a JSON Schema cannot:
 *
 *   - "All of the above" style options
 *   - multiple-choice questions with no correct answer, or two
 *   - distractors that duplicate the correct answer
 *   - explanations that merely restate the answer
 *   - near-duplicates of questions already in the bank
 *
 * Only questions that pass `validateQuestion` are eligible for storage.
 */

export type CandidateQuestion = {
  text: string;
  type: "MCQ" | "MULTI_SELECT" | "TRUE_FALSE" | "SHORT_ANSWER";
  topic: string;
  difficulty: "EASY" | "MEDIUM" | "HARD";
  options: Array<{ text: string; isCorrect: boolean }>;
  expectedAnswer: string;
  explanation: string;
};

export type QualityIssue = {
  code: string;
  message: string;
  /** `error` blocks storage; `warning` only lowers the score. */
  severity: "error" | "warning";
};

export type QualityResult = {
  valid: boolean;
  /** 0-100. */
  score: number;
  issues: QualityIssue[];
  dedupeHash: string;
};

const BANNED_OPTION_PATTERNS = [
  /^all of the above$/i,
  /^none of the above$/i,
  /^both [ab] and [bc]$/i,
  /^all of these$/i,
  /^none of these$/i,
];

/**
 * Normalised fingerprint for duplicate detection.
 *
 * Lowercases, strips punctuation and collapses whitespace, so trivial
 * rewordings of the same question collide.
 */
export function questionHash(text: string): string {
  const normalised = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return createHash("sha256").update(normalised).digest("hex").slice(0, 32);
}

/**
 * Token-level Jaccard similarity, 0-1.
 * Used for near-duplicate detection where hashing is too strict.
 */
export function similarity(a: string, b: string): number {
  const tokenise = (text: string) =>
    new Set(
      text
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, "")
        .split(/\s+/)
        .filter((token) => token.length > 2),
    );

  const setA = tokenise(a);
  const setB = tokenise(b);
  if (setA.size === 0 || setB.size === 0) return 0;

  let intersection = 0;
  for (const token of setA) if (setB.has(token)) intersection += 1;

  return intersection / (setA.size + setB.size - intersection);
}

export const DUPLICATE_THRESHOLD = 0.75;

export function validateQuestion(
  question: CandidateQuestion,
  existingTexts: string[] = [],
): QualityResult {
  const issues: QualityIssue[] = [];
  const needsOptions =
    question.type === "MCQ" ||
    question.type === "MULTI_SELECT" ||
    question.type === "TRUE_FALSE";

  const text = question.text.trim();

  // --- Question text ------------------------------------------------------
  if (text.length < 15) {
    issues.push({
      code: "text_too_short",
      message: "The question text is too short to be meaningful.",
      severity: "error",
    });
  }
  if (text.length > 2000) {
    issues.push({
      code: "text_too_long",
      message: "The question text is excessively long.",
      severity: "warning",
    });
  }
  if (!/[?:.]$/.test(text)) {
    issues.push({
      code: "no_terminator",
      message: "The question does not end with punctuation.",
      severity: "warning",
    });
  }

  // --- Options ------------------------------------------------------------
  if (needsOptions) {
    const correct = question.options.filter((option) => option.isCorrect);

    if (question.options.length < 2) {
      issues.push({
        code: "too_few_options",
        message: "Fewer than two options.",
        severity: "error",
      });
    }
    if (question.type === "MCQ" && question.options.length !== 4) {
      issues.push({
        code: "mcq_option_count",
        message: "Multiple-choice questions should have exactly four options.",
        severity: "warning",
      });
    }
    if (question.type === "TRUE_FALSE" && question.options.length !== 2) {
      issues.push({
        code: "true_false_option_count",
        message: "True/False questions must have exactly two options.",
        severity: "error",
      });
    }

    if (correct.length === 0) {
      issues.push({
        code: "no_correct_option",
        message: "No option is marked correct.",
        severity: "error",
      });
    }
    if (question.type !== "MULTI_SELECT" && correct.length > 1) {
      issues.push({
        code: "multiple_correct",
        message: "A single-answer question has more than one correct option.",
        severity: "error",
      });
    }
    if (question.type === "MULTI_SELECT" && correct.length < 2) {
      issues.push({
        code: "multi_select_single_answer",
        message: "A multi-select question should have at least two correct options.",
        severity: "error",
      });
    }
    if (
      question.type === "MULTI_SELECT" &&
      correct.length === question.options.length
    ) {
      issues.push({
        code: "all_options_correct",
        message: "Every option is correct, so the question tests nothing.",
        severity: "error",
      });
    }

    // Banned meta-options.
    for (const option of question.options) {
      if (BANNED_OPTION_PATTERNS.some((pattern) => pattern.test(option.text.trim()))) {
        issues.push({
          code: "banned_option",
          message: `"${option.text.trim()}" is not an acceptable option.`,
          severity: "error",
        });
        break;
      }
    }

    // Duplicate option text.
    const seen = new Set<string>();
    for (const option of question.options) {
      const key = option.text.trim().toLowerCase();
      if (seen.has(key)) {
        issues.push({
          code: "duplicate_option",
          message: "Two options have the same text.",
          severity: "error",
        });
        break;
      }
      seen.add(key);
    }

    // A correct option far longer than every distractor is a giveaway.
    if (correct.length === 1 && question.options.length > 2) {
      const correctLength = correct[0].text.length;
      const others = question.options.filter((option) => !option.isCorrect);
      const maxOther = Math.max(...others.map((option) => option.text.length));
      if (correctLength > maxOther * 2 && correctLength > 60) {
        issues.push({
          code: "length_giveaway",
          message:
            "The correct option is far longer than the distractors, which gives the answer away.",
          severity: "warning",
        });
      }
    }
  } else {
    // --- Open-ended -------------------------------------------------------
    if (question.expectedAnswer.trim().length < 30) {
      issues.push({
        code: "no_reference_answer",
        message: "Open-ended questions need a substantial reference answer.",
        severity: "error",
      });
    }
    if (question.options.length > 0) {
      issues.push({
        code: "unexpected_options",
        message: "An open-ended question should not have options.",
        severity: "warning",
      });
    }
  }

  // --- Explanation --------------------------------------------------------
  const explanation = question.explanation.trim();
  if (explanation.length < 20) {
    issues.push({
      code: "weak_explanation",
      message: "The explanation is too short to teach anything.",
      severity: "error",
    });
  } else if (needsOptions) {
    const correctOption = question.options.find((option) => option.isCorrect);
    if (
      correctOption &&
      similarity(explanation, correctOption.text) > 0.85
    ) {
      issues.push({
        code: "explanation_restates_answer",
        message: "The explanation merely restates the answer without explaining why.",
        severity: "warning",
      });
    }
  }

  // --- Duplicate detection -------------------------------------------------
  const dedupeHash = questionHash(text);
  for (const existing of existingTexts) {
    if (questionHash(existing) === dedupeHash) {
      issues.push({
        code: "exact_duplicate",
        message: "This question already exists in the bank.",
        severity: "error",
      });
      break;
    }
    if (similarity(text, existing) >= DUPLICATE_THRESHOLD) {
      issues.push({
        code: "near_duplicate",
        message: "This is a near-duplicate of an existing question.",
        severity: "error",
      });
      break;
    }
  }

  const errors = issues.filter((issue) => issue.severity === "error");
  const warnings = issues.filter((issue) => issue.severity === "warning");

  return {
    valid: errors.length === 0,
    // Errors dominate; warnings shave points off an otherwise valid question.
    score: Math.max(0, 100 - errors.length * 40 - warnings.length * 8),
    issues,
    dedupeHash,
  };
}

/** Validates a generated batch, splitting it into accepted and rejected. */
export function validateBatch(
  questions: CandidateQuestion[],
  existingTexts: string[] = [],
): {
  accepted: Array<{ question: CandidateQuestion; quality: QualityResult }>;
  rejected: Array<{ question: CandidateQuestion; quality: QualityResult }>;
} {
  const accepted: Array<{ question: CandidateQuestion; quality: QualityResult }> = [];
  const rejected: Array<{ question: CandidateQuestion; quality: QualityResult }> = [];

  // Accepted questions join the corpus as we go, so the batch cannot contain
  // duplicates of itself.
  const corpus = [...existingTexts];

  for (const question of questions) {
    const quality = validateQuestion(question, corpus);
    if (quality.valid) {
      accepted.push({ question, quality });
      corpus.push(question.text);
    } else {
      rejected.push({ question, quality });
    }
  }

  return { accepted, rejected };
}
