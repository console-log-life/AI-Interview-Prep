import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Service-level behaviour for spaced practice.
 *
 * Prisma is mocked rather than hit, so the suite keeps its "no database, no
 * API keys" property. What is being tested is the part a pure function cannot
 * cover: that every query is scoped to the caller's user id, that a graded
 * review persists the right schedule, and that retirement keeps the row.
 */

const prismaMock = {
  mistake: { findMany: vi.fn() },
  skillProfile: { findMany: vi.fn() },
  reviewItem: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    createMany: vi.fn(),
    update: vi.fn(),
    count: vi.fn(),
  },
  reviewLog: { create: vi.fn() },
  $transaction: vi.fn(),
};

vi.mock("@/lib/db/prisma", () => ({ prisma: prismaMock }));

const {
  countDueReviews,
  getReviewQueue,
  recordReview,
  retireReviewItem,
  syncReviewItems,
} = await import("@/lib/practice/service");
const { NotFoundError } = await import("@/lib/api/errors");

const USER = "user-1";
const OTHER_USER = "user-2";

function reviewRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "item-1",
    userId: USER,
    kind: "MISTAKE" as const,
    refKey: "sql-joins",
    label: "Misunderstanding SQL joins",
    skillKey: "dbms.joins",
    mistakeId: "m-1",
    intervalDays: 10,
    ease: 2.5,
    reviewCount: 3,
    lapses: 1,
    dueAt: new Date(Date.now() - 86_400_000),
    lastReviewedAt: null,
    lastQuality: null,
    isActive: true,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.mistake.findMany.mockResolvedValue([]);
  prismaMock.skillProfile.findMany.mockResolvedValue([]);
  prismaMock.reviewItem.findMany.mockResolvedValue([]);
  prismaMock.reviewItem.createMany.mockResolvedValue({ count: 0 });
  prismaMock.reviewItem.count.mockResolvedValue(0);
  prismaMock.$transaction.mockImplementation(async (ops: unknown[]) =>
    Promise.all(ops as Promise<unknown>[]),
  );
});

describe("syncReviewItems — auto-enrolment", () => {
  it("enrols a repeated mistake", async () => {
    prismaMock.mistake.findMany.mockResolvedValue([
      { id: "m-1", concept: "sql-joins", label: "SQL joins", skillKey: "dbms.joins" },
    ]);
    prismaMock.reviewItem.createMany.mockResolvedValue({ count: 1 });

    const enrolled = await syncReviewItems(USER);

    expect(enrolled).toBe(1);
    const payload = prismaMock.reviewItem.createMany.mock.calls[0][0];
    expect(payload.data).toHaveLength(1);
    expect(payload.data[0]).toMatchObject({
      userId: USER,
      kind: "MISTAKE",
      refKey: "sql-joins",
      mistakeId: "m-1",
    });
  });

  it("only considers mistakes that have actually recurred", async () => {
    await syncReviewItems(USER);
    const where = prismaMock.mistake.findMany.mock.calls[0][0].where;
    expect(where.userId).toBe(USER);
    expect(where.frequency).toEqual({ gte: 2 });
    expect(where.status).toEqual({ not: "RESOLVED" });
  });

  it("enrols a weak skill with enough confidence to trust", async () => {
    prismaMock.skillProfile.findMany.mockResolvedValue([
      { skillKey: "dsa.dp" },
    ]);
    prismaMock.reviewItem.createMany.mockResolvedValue({ count: 1 });

    await syncReviewItems(USER);

    const payload = prismaMock.reviewItem.createMany.mock.calls[0][0];
    expect(payload.data[0]).toMatchObject({
      kind: "SKILL",
      refKey: "dsa.dp",
      skillKey: "dsa.dp",
      mistakeId: null,
    });
    // A resolvable graph key must produce a human label, not the raw slug.
    expect(payload.data[0].label).not.toBe("dsa.dp");
  });

  it("requires a weak skill to clear both the score and confidence bars", async () => {
    await syncReviewItems(USER);
    const where = prismaMock.skillProfile.findMany.mock.calls[0][0].where;
    expect(where.userId).toBe(USER);
    expect(where.score).toEqual({ lt: 60 });
    expect(where.confidence).toEqual({ gte: 0.15 });
    expect(where.observations).toEqual({ gt: 0 });
  });

  it("does not re-enrol something already tracked", async () => {
    prismaMock.mistake.findMany.mockResolvedValue([
      { id: "m-1", concept: "sql-joins", label: "SQL joins", skillKey: null },
    ]);
    prismaMock.reviewItem.findMany.mockResolvedValue([
      { kind: "MISTAKE", refKey: "sql-joins" },
    ]);

    const enrolled = await syncReviewItems(USER);

    expect(enrolled).toBe(0);
    expect(prismaMock.reviewItem.createMany).not.toHaveBeenCalled();
  });

  it("writes nothing when there is nothing to enrol", async () => {
    expect(await syncReviewItems(USER)).toBe(0);
    expect(prismaMock.reviewItem.createMany).not.toHaveBeenCalled();
  });

  it("guards the concurrent case with skipDuplicates", async () => {
    prismaMock.mistake.findMany.mockResolvedValue([
      { id: "m-1", concept: "sql-joins", label: "SQL joins", skillKey: null },
    ]);
    prismaMock.reviewItem.createMany.mockResolvedValue({ count: 1 });

    await syncReviewItems(USER);

    expect(
      prismaMock.reviewItem.createMany.mock.calls[0][0].skipDuplicates,
    ).toBe(true);
  });

  it("scopes the existing-items lookup to the caller", async () => {
    await syncReviewItems(USER);
    expect(prismaMock.reviewItem.findMany.mock.calls[0][0].where).toEqual({
      userId: USER,
    });
  });
});

describe("getReviewQueue", () => {
  it("returns only this user's active items", async () => {
    await getReviewQueue(USER);
    const where = prismaMock.reviewItem.findMany.mock.calls.at(-1)?.[0].where;
    expect(where).toEqual({ userId: USER, isActive: true });
  });

  it("splits due from upcoming and reports the true due total", async () => {
    prismaMock.reviewItem.findMany.mockResolvedValue([
      reviewRow({ id: "a", dueAt: new Date(Date.now() - 5 * 86_400_000) }),
      reviewRow({ id: "b", dueAt: new Date(Date.now() - 86_400_000) }),
      reviewRow({ id: "c", dueAt: new Date(Date.now() + 3 * 86_400_000) }),
    ]);

    const queue = await getReviewQueue(USER);

    expect(queue.dueTotal).toBe(2);
    expect(queue.due).toHaveLength(2);
    expect(queue.upcoming).toHaveLength(1);
    expect(queue.totalActive).toBe(3);
  });

  it("orders the most overdue first", async () => {
    prismaMock.reviewItem.findMany.mockResolvedValue([
      reviewRow({ id: "recent", lapses: 0, dueAt: new Date(Date.now() - 86_400_000) }),
      reviewRow({ id: "old", lapses: 0, dueAt: new Date(Date.now() - 9 * 86_400_000) }),
    ]);

    const queue = await getReviewQueue(USER);
    expect(queue.due[0].id).toBe("old");
  });

  it("caps the returned page without hiding the real due count", async () => {
    prismaMock.reviewItem.findMany.mockResolvedValue(
      Array.from({ length: 8 }, (_, index) =>
        reviewRow({ id: `item-${index}` }),
      ),
    );

    const queue = await getReviewQueue(USER, { dueLimit: 3 });

    expect(queue.due).toHaveLength(3);
    expect(queue.dueTotal).toBe(8);
  });

  it("exposes the interval each grade would schedule", async () => {
    prismaMock.reviewItem.findMany.mockResolvedValue([reviewRow()]);
    const queue = await getReviewQueue(USER);

    const intervals = queue.due[0].intervals;
    expect(intervals.AGAIN).toBeLessThanOrEqual(intervals.HARD);
    expect(intervals.GOOD).toBeLessThanOrEqual(intervals.EASY);
  });
});

describe("recordReview — persistence", () => {
  beforeEach(() => {
    prismaMock.reviewItem.findFirst.mockResolvedValue(reviewRow());
    prismaMock.reviewItem.update.mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) =>
        reviewRow({ ...data }),
    );
    prismaMock.reviewLog.create.mockResolvedValue({ id: "log-1" });
  });

  it.each(["AGAIN", "HARD", "GOOD", "EASY"] as const)(
    "persists a %s grade and its resulting schedule",
    async (quality) => {
      await recordReview({ userId: USER, reviewItemId: "item-1", quality });

      const update = prismaMock.reviewItem.update.mock.calls[0][0];
      expect(update.where).toEqual({ id: "item-1" });
      expect(update.data.lastQuality).toBe(quality);
      expect(update.data.intervalDays).toBeGreaterThan(0);
      expect(update.data.dueAt).toBeInstanceOf(Date);
      expect(update.data.lastReviewedAt).toBeInstanceOf(Date);
    },
  );

  it("returns a mature item to one day and records a lapse on AGAIN", async () => {
    await recordReview({ userId: USER, reviewItemId: "item-1", quality: "AGAIN" });

    const data = prismaMock.reviewItem.update.mock.calls[0][0].data;
    expect(data.intervalDays).toBe(1);
    expect(data.lapses).toBe(2);
  });

  it("grows the interval on GOOD", async () => {
    await recordReview({ userId: USER, reviewItemId: "item-1", quality: "GOOD" });
    const data = prismaMock.reviewItem.update.mock.calls[0][0].data;
    expect(data.intervalDays).toBeGreaterThan(10);
  });

  it("writes an append-only log entry alongside the update", async () => {
    await recordReview({ userId: USER, reviewItemId: "item-1", quality: "GOOD" });

    const log = prismaMock.reviewLog.create.mock.calls[0][0].data;
    expect(log).toMatchObject({ reviewItemId: "item-1", quality: "GOOD" });
    expect(log.intervalDays).toBeGreaterThan(0);
  });

  it("writes the update and the log in one transaction", async () => {
    await recordReview({ userId: USER, reviewItemId: "item-1", quality: "GOOD" });
    expect(prismaMock.$transaction).toHaveBeenCalledOnce();
  });

  it("sets dueAt to the scheduled interval in the future", async () => {
    await recordReview({ userId: USER, reviewItemId: "item-1", quality: "GOOD" });
    const data = prismaMock.reviewItem.update.mock.calls[0][0].data;
    expect((data.dueAt as Date).getTime()).toBeGreaterThan(Date.now());
  });
});

describe("ownership isolation", () => {
  it("scopes the review lookup to the caller before updating", async () => {
    prismaMock.reviewItem.findFirst.mockResolvedValue(reviewRow());
    prismaMock.reviewItem.update.mockResolvedValue(reviewRow());

    await recordReview({ userId: USER, reviewItemId: "item-1", quality: "GOOD" });

    expect(prismaMock.reviewItem.findFirst.mock.calls[0][0].where).toEqual({
      id: "item-1",
      userId: USER,
    });
  });

  it("refuses to grade another user's item", async () => {
    // Scoped query finds nothing for a foreign id.
    prismaMock.reviewItem.findFirst.mockResolvedValue(null);

    await expect(
      recordReview({
        userId: OTHER_USER,
        reviewItemId: "item-1",
        quality: "GOOD",
      }),
    ).rejects.toThrow(NotFoundError);

    expect(prismaMock.reviewItem.update).not.toHaveBeenCalled();
    expect(prismaMock.reviewLog.create).not.toHaveBeenCalled();
  });

  it("refuses to retire another user's item", async () => {
    prismaMock.reviewItem.findFirst.mockResolvedValue(null);

    await expect(retireReviewItem(OTHER_USER, "item-1")).rejects.toThrow(
      NotFoundError,
    );
    expect(prismaMock.reviewItem.update).not.toHaveBeenCalled();
  });

  it("scopes the due count to the caller", async () => {
    await countDueReviews(USER);
    const where = prismaMock.reviewItem.count.mock.calls[0][0].where;
    expect(where.userId).toBe(USER);
    expect(where.isActive).toBe(true);
    expect(where.dueAt.lte).toBeInstanceOf(Date);
  });
});

describe("retireReviewItem", () => {
  it("deactivates rather than deleting, keeping the history", async () => {
    prismaMock.reviewItem.findFirst.mockResolvedValue({ id: "item-1" });
    prismaMock.reviewItem.update.mockResolvedValue({
      id: "item-1",
      isActive: false,
    });

    const result = await retireReviewItem(USER, "item-1");

    const update = prismaMock.reviewItem.update.mock.calls[0][0];
    expect(update.where).toEqual({ id: "item-1" });
    expect(update.data).toEqual({ isActive: false });
    expect(result.isActive).toBe(false);
  });
});
