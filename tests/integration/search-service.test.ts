import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Global search.
 *
 * A search endpoint is exactly where a missing ownership scope leaks another
 * account's data, so these tests assert the `where` clauses directly rather
 * than trusting the shape of the results.
 */

const prismaMock = {
  interview: { findMany: vi.fn() },
  assessment: { findMany: vi.fn() },
  codingProblem: { findMany: vi.fn() },
  roadmapTask: { findMany: vi.fn() },
  jobDescription: { findMany: vi.fn() },
  resume: { findMany: vi.fn() },
};

vi.mock("@/lib/db/prisma", () => ({ prisma: prismaMock }));

const { searchEverything } = await import("@/lib/search/service");

const USER = "user-1";

beforeEach(() => {
  vi.clearAllMocks();
  for (const model of Object.values(prismaMock)) {
    model.findMany.mockResolvedValue([]);
  }
});

describe("query guard", () => {
  it.each(["", " ", "a", " x "])(
    "returns nothing and hits no table for %p",
    async (query) => {
      expect(await searchEverything(USER, query)).toEqual([]);
      for (const model of Object.values(prismaMock)) {
        expect(model.findMany).not.toHaveBeenCalled();
      }
    },
  );

  it("searches once the query is long enough", async () => {
    await searchEverything(USER, "sql");
    expect(prismaMock.interview.findMany).toHaveBeenCalled();
  });
});

describe("ownership scoping", () => {
  it("scopes user-owned records to the caller", async () => {
    await searchEverything(USER, "backend");

    expect(prismaMock.interview.findMany.mock.calls[0][0].where.userId).toBe(USER);
    expect(prismaMock.jobDescription.findMany.mock.calls[0][0].where.userId).toBe(
      USER,
    );
    expect(prismaMock.resume.findMany.mock.calls[0][0].where.userId).toBe(USER);
  });

  it("scopes roadmap tasks through their parent roadmap", async () => {
    await searchEverything(USER, "backend");
    expect(prismaMock.roadmapTask.findMany.mock.calls[0][0].where.roadmap).toEqual(
      { userId: USER },
    );
  });

  it("only surfaces published shared content", async () => {
    await searchEverything(USER, "arrays");
    expect(prismaMock.assessment.findMany.mock.calls[0][0].where.isPublished).toBe(
      true,
    );
    expect(
      prismaMock.codingProblem.findMany.mock.calls[0][0].where.isPublished,
    ).toBe(true);
  });

  it("caps every group so one category cannot crowd out the rest", async () => {
    await searchEverything(USER, "arrays");
    for (const model of Object.values(prismaMock)) {
      expect(model.findMany.mock.calls[0][0].take).toBeLessThanOrEqual(5);
    }
  });
});

describe("result shape", () => {
  it("routes a completed interview to its report and an open one to the room", async () => {
    prismaMock.interview.findMany.mockResolvedValue([
      {
        id: "i-1",
        targetRole: "Backend Engineer",
        type: "TECHNICAL",
        status: "COMPLETED",
        report: { overallScore: 78 },
      },
      {
        id: "i-2",
        targetRole: "Backend Engineer",
        type: "MIXED",
        status: "IN_PROGRESS",
        report: null,
      },
    ]);

    const results = await searchEverything(USER, "backend");

    expect(results[0].href).toBe("/interview/i-1/result");
    expect(results[0].subtitle).toContain("78");
    expect(results[1].href).toBe("/interview/i-2");
  });

  it("links a coding problem by slug, not by id", async () => {
    prismaMock.codingProblem.findMany.mockResolvedValue([
      {
        id: "p-1",
        slug: "two-sum",
        title: "Two Sum",
        topic: "Hashing",
        difficulty: "EASY",
      },
    ]);

    const [result] = await searchEverything(USER, "two sum");
    expect(result.href).toBe("/coding/two-sum");
  });

  it("matches skills from the graph without touching the database", async () => {
    const results = await searchEverything(USER, "dynamic programming");
    const skill = results.find((row) => row.group === "Skills");

    expect(skill).toBeDefined();
    expect(skill?.href).toContain("/skills/");
  });

  it("gives every result a unique id so React keys cannot collide", async () => {
    prismaMock.interview.findMany.mockResolvedValue([
      { id: "x", targetRole: "SQL dev", type: "TECHNICAL", status: "COMPLETED", report: null },
    ]);
    prismaMock.assessment.findMany.mockResolvedValue([
      { id: "x", title: "SQL basics", category: "DBMS", difficulty: "EASY" },
    ]);

    const results = await searchEverything(USER, "sql");
    const ids = results.map((row) => row.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("returns an empty list when nothing matches, rather than throwing", async () => {
    expect(await searchEverything(USER, "zzzzqqqq")).toEqual([]);
  });
});
