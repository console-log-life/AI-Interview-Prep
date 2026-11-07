import { PrismaClient, type QuestionCategory } from "@prisma/client";
import bcrypt from "bcryptjs";

import { SKILL_GRAPH } from "../lib/skills/graph";
import { SEED_PROBLEMS } from "./seed-data/coding-problems";
import { SEED_QUESTIONS } from "./seed-data/questions";

/**
 * Development seed.
 *
 * Idempotent: every write is an upsert keyed on a stable natural key, so
 * running `npm run db:seed` twice does not duplicate anything.
 *
 * IMPORTANT: everything created here is DEVELOPMENT / DEMO content. The
 * questions are original practice questions written for this project from
 * public computer-science fundamentals — they are not real or confidential
 * questions from any company's interview process, and are flagged `isSeed`
 * so the admin panel can label them as demo content.
 */

const prisma = new PrismaClient();

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Reused by `lib/db/queries/profile.ts` — kept in sync deliberately. */
const CATEGORY_HINTS: Array<[RegExp, QuestionCategory]> = [
  [/\b(java|spring|hibernate|jvm)\b/i, "JAVA"],
  [/\b(python|django|flask|pandas|numpy)\b/i, "PYTHON"],
  [/\b(javascript|typescript|react|node|next|angular|vue|promise)\b/i, "JAVASCRIPT"],
  [/\b(sql|mysql|postgres|database|dbms|mongo|nosql|redis|index|transaction|normalis)\b/i, "DBMS"],
  [/\b(algorithm|data structure|dsa|graph|tree|dynamic programming|sorting|hash|complexity|stack|queue)\b/i, "DSA"],
  [/\b(oop|object oriented|design pattern|solid|polymorph|inherit)\b/i, "OOP"],
  [/\b(operating system|os|thread|process|concurrency|deadlock|schedul|memory|paging)\b/i, "OPERATING_SYSTEMS"],
  [/\b(network|tcp|http|dns|socket|udp|osi)\b/i, "COMPUTER_NETWORKS"],
  [/\b(system design|microservice|scalab|kafka|architecture|docker|kubernetes|aws|cap)\b/i, "SYSTEM_DESIGN"],
];

function inferCategory(name: string): QuestionCategory {
  for (const [pattern, category] of CATEGORY_HINTS) {
    if (pattern.test(name)) return category;
  }
  return "DSA";
}

const ACHIEVEMENTS = [
  {
    code: "FIRST_INTERVIEW",
    title: "First Interview",
    description: "Complete your first AI mock interview.",
    icon: "trophy",
    metric: "interviewsCompleted",
    threshold: 1,
    points: 10,
  },
  {
    code: "FIVE_INTERVIEWS",
    title: "Interview Regular",
    description: "Complete 5 mock interviews.",
    icon: "medal",
    metric: "interviewsCompleted",
    threshold: 5,
    points: 30,
  },
  {
    code: "FIRST_ASSESSMENT",
    title: "First Assessment",
    description: "Complete your first assessment.",
    icon: "list-checks",
    metric: "assessmentsCompleted",
    threshold: 1,
    points: 10,
  },
  {
    code: "TEN_ASSESSMENTS",
    title: "Assessment Veteran",
    description: "Complete 10 assessments.",
    icon: "award",
    metric: "assessmentsCompleted",
    threshold: 10,
    points: 40,
  },
  {
    code: "TEN_QUESTIONS",
    title: "10 Questions Solved",
    description: "Answer 10 assessment questions.",
    icon: "star",
    metric: "questionsAnswered",
    threshold: 10,
    points: 10,
  },
  {
    code: "FIFTY_QUESTIONS",
    title: "50 Questions Solved",
    description: "Answer 50 assessment questions.",
    icon: "star",
    metric: "questionsAnswered",
    threshold: 50,
    points: 35,
  },
  {
    code: "FIRST_PROBLEM",
    title: "First Blood",
    description: "Solve your first coding problem.",
    icon: "braces",
    metric: "problemsSolved",
    threshold: 1,
    points: 15,
  },
  {
    code: "TEN_PROBLEMS",
    title: "Problem Solver",
    description: "Solve 10 coding problems.",
    icon: "braces",
    metric: "problemsSolved",
    threshold: 10,
    points: 45,
  },
  {
    code: "STREAK_7",
    title: "7-Day Practice Streak",
    description: "Practise on 7 consecutive days.",
    icon: "flame",
    metric: "streakDays",
    threshold: 7,
    points: 50,
  },
  {
    code: "STREAK_30",
    title: "30-Day Practice Streak",
    description: "Practise on 30 consecutive days.",
    icon: "flame",
    metric: "streakDays",
    threshold: 30,
    points: 120,
  },
  {
    code: "INTERVIEW_ACE",
    title: "Interview Ace",
    description: "Score 85 or above in a mock interview.",
    icon: "trophy",
    metric: "bestInterviewScore",
    threshold: 85,
    points: 60,
  },
  {
    code: "PERFECT_ASSESSMENT",
    title: "Perfect Score",
    description: "Score 100% on an assessment.",
    icon: "target",
    metric: "bestAssessmentScore",
    threshold: 100,
    points: 60,
  },
];

async function seedAchievements() {
  for (const achievement of ACHIEVEMENTS) {
    await prisma.achievement.upsert({
      where: { code: achievement.code },
      create: achievement,
      update: achievement,
    });
  }
  console.log(`  ✓ ${ACHIEVEMENTS.length} achievements`);
}

async function seedSkills() {
  const names = new Set<string>();
  for (const question of SEED_QUESTIONS) {
    for (const skill of question.skillsTested) names.add(skill);
  }

  for (const name of names) {
    const slug = slugify(name);
    if (!slug) continue;
    await prisma.skill.upsert({
      where: { slug },
      create: { name, slug, category: inferCategory(name) },
      update: {},
    });
  }
  console.log(`  ✓ ${names.size} skills`);
}

/**
 * Mirrors `lib/skills/graph.ts` into the `SkillNode` table.
 *
 * The graph is the source of truth in code; this makes it queryable and gives
 * `SkillObservation.skillKey` a real foreign key to point at. Parents are
 * written before children so the self-relation always resolves.
 */
async function seedSkillGraph() {
  const roots = SKILL_GRAPH.filter((skill) => !skill.parentKey);
  const children = SKILL_GRAPH.filter((skill) => skill.parentKey);

  let order = 0;
  for (const skill of [...roots, ...children]) {
    const data = {
      label: skill.label,
      category: skill.category,
      parentKey: skill.parentKey ?? null,
      description: skill.description ?? null,
      order: order++,
    };
    await prisma.skillNode.upsert({
      where: { key: skill.key },
      create: { key: skill.key, ...data },
      update: data,
    });
  }
  console.log(`  ✓ ${SKILL_GRAPH.length} skill graph nodes`);
}

async function seedQuestions() {
  let created = 0;
  let updated = 0;

  for (const seed of SEED_QUESTIONS) {
    // Question text is the natural key for seed content — there is no unique
    // constraint on it, so we look it up rather than blind-upserting.
    const existing = await prisma.question.findFirst({
      where: { text: seed.text, isSeed: true },
      select: { id: true },
    });

    const data = {
      text: seed.text,
      category: seed.category,
      topic: seed.topic,
      difficulty: seed.difficulty,
      type: seed.type,
      expectedAnswer: seed.expectedAnswer ?? null,
      explanation: seed.explanation,
      skillsTested: seed.skillsTested,
      tags: seed.tags,
      points: seed.points ?? 1,
      isActive: true,
      isSeed: true,
    };

    if (existing) {
      await prisma.$transaction([
        prisma.questionOption.deleteMany({ where: { questionId: existing.id } }),
        prisma.question.update({
          where: { id: existing.id },
          data: {
            ...data,
            options: {
              create: (seed.options ?? []).map((option, index) => ({
                text: option.text,
                isCorrect: option.isCorrect,
                order: index,
              })),
            },
          },
        }),
      ]);
      updated += 1;
    } else {
      await prisma.question.create({
        data: {
          ...data,
          options: {
            create: (seed.options ?? []).map((option, index) => ({
              text: option.text,
              isCorrect: option.isCorrect,
              order: index,
            })),
          },
        },
      });
      created += 1;
    }
  }

  console.log(`  ✓ ${created} questions created, ${updated} updated`);
}

/**
 * Builds one assessment per category that has enough auto-gradable questions.
 * Open-ended questions are excluded so every seeded assessment produces a
 * meaningful percentage.
 */
async function seedAssessments() {
  const categories = [
    ...new Set(SEED_QUESTIONS.map((question) => question.category)),
  ];

  let count = 0;

  for (const category of categories) {
    const questions = await prisma.question.findMany({
      where: {
        category,
        isSeed: true,
        isActive: true,
        type: { in: ["MCQ", "MULTI_SELECT", "TRUE_FALSE"] },
      },
      orderBy: { difficulty: "asc" },
      select: { id: true },
    });

    if (questions.length < 3) continue;

    const label = category
      .split("_")
      .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
      .join(" ");
    const title = `${label} Fundamentals`;

    const existing = await prisma.assessment.findFirst({
      where: { title, isSeed: true },
      select: { id: true },
    });

    const data = {
      title,
      description: `A ${questions.length}-question starter set covering ${label} fundamentals. Demo content bundled with the app.`,
      category,
      difficulty: "MEDIUM" as const,
      durationMin: Math.max(10, questions.length * 2),
      passPercentage: 60,
      isPublished: true,
      isSeed: true,
    };

    if (existing) {
      await prisma.$transaction([
        prisma.assessmentQuestion.deleteMany({
          where: { assessmentId: existing.id },
        }),
        prisma.assessment.update({
          where: { id: existing.id },
          data: {
            ...data,
            questions: {
              create: questions.map((question, index) => ({
                questionId: question.id,
                order: index,
              })),
            },
          },
        }),
      ]);
    } else {
      await prisma.assessment.create({
        data: {
          ...data,
          questions: {
            create: questions.map((question, index) => ({
              questionId: question.id,
              order: index,
            })),
          },
        },
      });
    }
    count += 1;
  }

  console.log(`  ✓ ${count} assessments`);
}

async function seedCodingProblems() {
  for (const problem of SEED_PROBLEMS) {
    const { testCases, ...rest } = problem;

    const saved = await prisma.codingProblem.upsert({
      where: { slug: problem.slug },
      create: { ...rest, isPublished: true, isSeed: true },
      update: { ...rest, isPublished: true, isSeed: true },
    });

    // Replace test cases wholesale so edits to the seed file take effect.
    await prisma.codingTestCase.deleteMany({ where: { problemId: saved.id } });
    await prisma.codingTestCase.createMany({
      data: testCases.map((testCase, index) => ({
        problemId: saved.id,
        input: testCase.input,
        expected: testCase.expected,
        isSample: testCase.isSample,
        explanation: testCase.explanation ?? null,
        order: index,
      })),
    });
  }

  console.log(`  ✓ ${SEED_PROBLEMS.length} coding problems`);
}

/**
 * Demo accounts.
 *
 * Only created outside production, and only when SEED_DEMO_USERS is not "false".
 * The passwords are intentionally obvious — these are local demo logins, not
 * credentials for a deployed system.
 */
async function seedDemoUsers() {
  if (process.env.NODE_ENV === "production") {
    console.log("  · demo users skipped (NODE_ENV=production)");
    return;
  }
  if (process.env.SEED_DEMO_USERS === "false") {
    console.log("  · demo users skipped (SEED_DEMO_USERS=false)");
    return;
  }

  const passwordHash = await bcrypt.hash("Password123", 12);

  const demoUsers = [
    {
      email: "admin@preppilot.local",
      name: "Demo Admin",
      role: "ADMIN" as const,
      profile: {
        targetRole: "Engineering Manager",
        college: "IIITM Gwalior",
        degree: "B.Tech",
        branch: "Computer Science",
        graduationYear: new Date().getFullYear(),
        experienceLevel: "MID" as const,
      },
    },
    {
      email: "student@preppilot.local",
      name: "Demo Student",
      role: "STUDENT" as const,
      profile: {
        targetRole: "Backend Engineer",
        college: "IIITM Gwalior",
        degree: "B.Tech",
        branch: "Computer Science",
        graduationYear: new Date().getFullYear() + 1,
        experienceLevel: "FRESHER" as const,
      },
    },
  ];

  for (const user of demoUsers) {
    await prisma.user.upsert({
      where: { email: user.email },
      create: {
        email: user.email,
        name: user.name,
        role: user.role,
        passwordHash,
        profile: { create: user.profile },
      },
      // Never reset the role or password of an account that already exists.
      update: { name: user.name },
    });
  }

  console.log(
    `  ✓ ${demoUsers.length} demo users (password: Password123)`,
  );
}

async function main() {
  console.log("Seeding database…\n");

  await seedAchievements();
  await seedSkills();
  await seedSkillGraph();
  await seedQuestions();
  await seedAssessments();
  await seedCodingProblems();
  await seedDemoUsers();

  console.log("\nSeed complete.");
  console.log("\nDemo logins (development only):");
  console.log("  admin@preppilot.local   / Password123   (ADMIN)");
  console.log("  student@preppilot.local / Password123   (STUDENT)");
  console.log(
    "\nNote: all seeded questions and problems are original demo content",
  );
  console.log(
    "written for this project — not real questions from any company.\n",
  );
}

main()
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
