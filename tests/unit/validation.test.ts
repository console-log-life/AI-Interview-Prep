import { describe, expect, it } from "vitest";

import {
  changePasswordSchema,
  loginSchema,
  registerSchema,
} from "@/lib/validation/auth";
import {
  questionUpsertSchema,
  saveAnswerSchema,
  startAssessmentSchema,
} from "@/lib/validation/assessment";
import { createInterviewSchema } from "@/lib/validation/interview";
import { analyzeJobDescriptionSchema } from "@/lib/validation/job-description";
import { profileSchema } from "@/lib/validation/profile";
import { runCodeSchema, MAX_CODE_LENGTH } from "@/lib/validation/coding";

describe("registration validation", () => {
  const valid = {
    name: "Aarav Sharma",
    email: "AARAV@College.EDU",
    password: "StrongPass1",
    confirmPassword: "StrongPass1",
  };

  it("accepts a valid registration and lowercases the email", () => {
    const result = registerSchema.safeParse(valid);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.email).toBe("aarav@college.edu");
  });

  it("rejects mismatched passwords and points at the right field", () => {
    const result = registerSchema.safeParse({
      ...valid,
      confirmPassword: "Different1",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toEqual(["confirmPassword"]);
    }
  });

  it.each([
    ["too short", "Ab1"],
    ["no uppercase", "weakpass1"],
    ["no lowercase", "WEAKPASS1"],
    ["no digit", "WeakPassword"],
  ])("rejects a password that is %s", (_label, password) => {
    const result = registerSchema.safeParse({
      ...valid,
      password,
      confirmPassword: password,
    });
    expect(result.success).toBe(false);
  });

  it("rejects a malformed email", () => {
    expect(
      registerSchema.safeParse({ ...valid, email: "not-an-email" }).success,
    ).toBe(false);
  });

  it("rejects a one-character name", () => {
    expect(registerSchema.safeParse({ ...valid, name: "A" }).success).toBe(false);
  });
});

describe("login validation", () => {
  it("accepts any non-empty password so old accounts can still sign in", () => {
    // Login must NOT enforce the current complexity policy, or users whose
    // password predates the rule would be locked out.
    const result = loginSchema.safeParse({
      email: "user@example.com",
      password: "old",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an empty password", () => {
    expect(
      loginSchema.safeParse({ email: "user@example.com", password: "" }).success,
    ).toBe(false);
  });
});

describe("password change validation", () => {
  it("enforces the complexity policy on the NEW password", () => {
    const result = changePasswordSchema.safeParse({
      currentPassword: "anything",
      newPassword: "weak",
      confirmPassword: "weak",
    });
    expect(result.success).toBe(false);
  });

  it("requires the confirmation to match", () => {
    const result = changePasswordSchema.safeParse({
      currentPassword: "anything",
      newPassword: "StrongPass1",
      confirmPassword: "StrongPass2",
    });
    expect(result.success).toBe(false);
  });
});

describe("profile validation", () => {
  const valid = {
    name: "Aarav Sharma",
    experienceLevel: "FRESHER" as const,
    targetCompanies: [],
    preferredLangs: [],
    skills: [],
  };

  it("accepts a minimal profile", () => {
    expect(profileSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects a CGPA above the 0-10 scale", () => {
    expect(profileSchema.safeParse({ ...valid, cgpa: 12 }).success).toBe(false);
  });

  it("rejects an implausible graduation year", () => {
    expect(
      profileSchema.safeParse({ ...valid, graduationYear: 1850 }).success,
    ).toBe(false);
  });

  it("rejects a URL without a scheme", () => {
    expect(
      profileSchema.safeParse({ ...valid, githubUrl: "github.com/user" }).success,
    ).toBe(false);
  });

  it("accepts an empty optional URL", () => {
    const result = profileSchema.safeParse({ ...valid, githubUrl: "" });
    expect(result.success).toBe(true);
  });

  it("caps the number of skills to keep prompts bounded", () => {
    const tooMany = Array.from({ length: 60 }, (_, i) => `Skill ${i}`);
    expect(profileSchema.safeParse({ ...valid, skills: tooMany }).success).toBe(
      false,
    );
  });
});

describe("assessment validation", () => {
  it("bounds the practice question count", () => {
    expect(
      startAssessmentSchema.safeParse({ category: "DSA", questionCount: 500 })
        .success,
    ).toBe(false);
    expect(
      startAssessmentSchema.safeParse({ category: "DSA", questionCount: 1 })
        .success,
    ).toBe(false);
  });

  it("applies sensible defaults", () => {
    const result = startAssessmentSchema.safeParse({ category: "DBMS" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.questionCount).toBe(10);
      expect(result.data.durationMin).toBe(20);
    }
  });

  it("rejects an unknown category", () => {
    expect(
      startAssessmentSchema.safeParse({ category: "ASTROPHYSICS" }).success,
    ).toBe(false);
  });

  it("caps how many options one answer may select", () => {
    const result = saveAnswerSchema.safeParse({
      questionId: "abc",
      selectedOptions: Array.from({ length: 30 }, (_, i) => `opt-${i}`),
    });
    expect(result.success).toBe(false);
  });
});

describe("question authoring validation", () => {
  const base = {
    text: "Which data structure offers O(1) average lookup?",
    category: "DSA" as const,
    topic: "Hashing",
    difficulty: "EASY" as const,
    skillsTested: [],
    tags: [],
    points: 1,
    isActive: true,
  };

  it("requires at least one correct option on an MCQ", () => {
    const result = questionUpsertSchema.safeParse({
      ...base,
      type: "MCQ",
      options: [
        { text: "Array", isCorrect: false },
        { text: "Hash table", isCorrect: false },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("rejects two correct options on a single-answer MCQ", () => {
    const result = questionUpsertSchema.safeParse({
      ...base,
      type: "MCQ",
      options: [
        { text: "Array", isCorrect: true },
        { text: "Hash table", isCorrect: true },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("allows several correct options on a multi-select", () => {
    const result = questionUpsertSchema.safeParse({
      ...base,
      type: "MULTI_SELECT",
      options: [
        { text: "Merge sort", isCorrect: true },
        { text: "Quick sort", isCorrect: false },
        { text: "Insertion sort", isCorrect: true },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("requires exactly two options on a true/false question", () => {
    const result = questionUpsertSchema.safeParse({
      ...base,
      type: "TRUE_FALSE",
      options: [
        { text: "True", isCorrect: true },
        { text: "False", isCorrect: false },
        { text: "Maybe", isCorrect: false },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("requires a reference answer on an open-ended question", () => {
    const result = questionUpsertSchema.safeParse({
      ...base,
      type: "SHORT_ANSWER",
      options: [],
    });
    expect(result.success).toBe(false);
  });

  it("accepts an open-ended question that has a reference answer", () => {
    const result = questionUpsertSchema.safeParse({
      ...base,
      type: "SHORT_ANSWER",
      expectedAnswer: "A hash table, because it indexes by a computed bucket.",
      options: [],
    });
    expect(result.success).toBe(true);
  });
});

describe("interview setup validation", () => {
  it("applies defaults for an unspecified round", () => {
    const result = createInterviewSchema.safeParse({
      targetRole: "Backend Engineer",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.type).toBe("MIXED");
      expect(result.data.persona).toBe("PROFESSIONAL");
      expect(result.data.plannedQuestions).toBe(6);
    }
  });

  it("bounds the number of planned questions", () => {
    expect(
      createInterviewSchema.safeParse({
        targetRole: "SDE",
        plannedQuestions: 100,
      }).success,
    ).toBe(false);
  });

  it("rejects an unknown interviewer persona", () => {
    expect(
      createInterviewSchema.safeParse({
        targetRole: "SDE",
        persona: "SARCASTIC",
      }).success,
    ).toBe(false);
  });
});

describe("job description validation", () => {
  it("rejects a description too short to analyse usefully", () => {
    const result = analyzeJobDescriptionSchema.safeParse({
      title: "Engineer",
      rawText: "We are hiring.",
    });
    expect(result.success).toBe(false);
  });

  it("accepts a realistic posting", () => {
    const result = analyzeJobDescriptionSchema.safeParse({
      title: "Backend Engineer",
      company: "Acme",
      rawText: "x".repeat(200),
    });
    expect(result.success).toBe(true);
  });
});

describe("code submission validation", () => {
  it("rejects an empty submission", () => {
    expect(
      runCodeSchema.safeParse({ language: "PYTHON", code: "" }).success,
    ).toBe(false);
  });

  it("rejects a submission over the size limit", () => {
    const result = runCodeSchema.safeParse({
      language: "PYTHON",
      code: "x".repeat(MAX_CODE_LENGTH + 1),
    });
    expect(result.success).toBe(false);
  });

  it("rejects an unsupported language", () => {
    expect(
      runCodeSchema.safeParse({ language: "RUST", code: "fn main() {}" }).success,
    ).toBe(false);
  });

  it("accepts each supported language", () => {
    for (const language of ["PYTHON", "JAVA", "CPP", "JAVASCRIPT"]) {
      expect(
        runCodeSchema.safeParse({ language, code: "print(1)" }).success,
      ).toBe(true);
    }
  });
});
