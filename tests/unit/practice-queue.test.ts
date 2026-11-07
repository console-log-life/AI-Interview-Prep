import { describe, expect, it } from "vitest";

import {
  itemKey,
  partitionQueue,
  selectNewEnrolments,
  type EnrolmentCandidate,
} from "@/lib/practice/queue";

/**
 * The two rules that make the queue trustworthy: enrolment never disturbs an
 * item already under review, and the ordering surfaces what is being
 * forgotten rather than merely what is oldest.
 */

const NOW = new Date("2026-06-01T12:00:00Z");

function daysAgo(days: number): Date {
  return new Date(NOW.getTime() - days * 86_400_000);
}

function daysAhead(days: number): Date {
  return new Date(NOW.getTime() + days * 86_400_000);
}

function mistake(refKey: string): EnrolmentCandidate {
  return {
    kind: "MISTAKE",
    refKey,
    label: `Mistake ${refKey}`,
    mistakeId: `m-${refKey}`,
    skillKey: null,
  };
}

function skill(refKey: string): EnrolmentCandidate {
  return {
    kind: "SKILL",
    refKey,
    label: `Skill ${refKey}`,
    mistakeId: null,
    skillKey: refKey,
  };
}

describe("itemKey", () => {
  it("distinguishes a mistake from a skill with the same refKey", () => {
    expect(itemKey({ kind: "MISTAKE", refKey: "dsa" })).not.toBe(
      itemKey({ kind: "SKILL", refKey: "dsa" }),
    );
  });
});

describe("selectNewEnrolments — auto-enrolment", () => {
  it("enrols a repeated mistake that is not yet tracked", () => {
    const fresh = selectNewEnrolments([mistake("sql-joins")], []);
    expect(fresh).toHaveLength(1);
    expect(fresh[0].kind).toBe("MISTAKE");
    expect(fresh[0].mistakeId).toBe("m-sql-joins");
  });

  it("enrols a weak skill that is not yet tracked", () => {
    const fresh = selectNewEnrolments([skill("dbms.joins")], []);
    expect(fresh).toHaveLength(1);
    expect(fresh[0].kind).toBe("SKILL");
    expect(fresh[0].skillKey).toBe("dbms.joins");
  });

  it("enrols mistakes and skills together", () => {
    const fresh = selectNewEnrolments(
      [mistake("sql-joins"), skill("dsa.dp")],
      [],
    );
    expect(fresh).toHaveLength(2);
  });
});

describe("selectNewEnrolments — idempotency", () => {
  it("skips a candidate that is already tracked", () => {
    const fresh = selectNewEnrolments(
      [mistake("sql-joins")],
      [{ kind: "MISTAKE", refKey: "sql-joins" }],
    );
    expect(fresh).toEqual([]);
  });

  it("is a no-op when everything is already enrolled", () => {
    const candidates = [mistake("a"), skill("b")];
    const existing = [
      { kind: "MISTAKE" as const, refKey: "a" },
      { kind: "SKILL" as const, refKey: "b" },
    ];
    expect(selectNewEnrolments(candidates, existing)).toEqual([]);
  });

  it("adds only the missing candidate on a second run", () => {
    const candidates = [mistake("a"), mistake("b")];
    const fresh = selectNewEnrolments(candidates, [
      { kind: "MISTAKE", refKey: "a" },
    ]);
    expect(fresh).toHaveLength(1);
    expect(fresh[0].refKey).toBe("b");
  });

  it("still enrols a skill when a mistake shares the refKey", () => {
    // Different kinds are different rows under the unique constraint.
    const fresh = selectNewEnrolments(
      [skill("dsa")],
      [{ kind: "MISTAKE", refKey: "dsa" }],
    );
    expect(fresh).toHaveLength(1);
    expect(fresh[0].kind).toBe("SKILL");
  });

  it("de-duplicates within the candidate list itself", () => {
    // Two candidates with the same key would violate the unique constraint.
    const fresh = selectNewEnrolments(
      [mistake("sql-joins"), mistake("sql-joins")],
      [],
    );
    expect(fresh).toHaveLength(1);
  });

  it("returns nothing for an empty candidate list", () => {
    expect(selectNewEnrolments([], [{ kind: "SKILL", refKey: "x" }])).toEqual([]);
  });
});

describe("partitionQueue — due vs upcoming", () => {
  it("puts an item due exactly now in the due list", () => {
    const { due, upcoming } = partitionQueue(
      [{ dueAt: NOW, lapses: 0 }],
      NOW,
    );
    expect(due).toHaveLength(1);
    expect(upcoming).toHaveLength(0);
  });

  it("separates future items into upcoming", () => {
    const { due, upcoming } = partitionQueue(
      [
        { dueAt: daysAgo(1), lapses: 0 },
        { dueAt: daysAhead(3), lapses: 0 },
      ],
      NOW,
    );
    expect(due).toHaveLength(1);
    expect(upcoming).toHaveLength(1);
  });

  it("handles an empty queue", () => {
    expect(partitionQueue([], NOW)).toEqual({ due: [], upcoming: [] });
  });
});

describe("partitionQueue — ordering", () => {
  it("orders due items most-overdue first when lapses are equal", () => {
    const { due } = partitionQueue(
      [
        { dueAt: daysAgo(1), lapses: 0, id: "recent" },
        { dueAt: daysAgo(9), lapses: 0, id: "old" },
        { dueAt: daysAgo(4), lapses: 0, id: "middle" },
      ],
      NOW,
    );
    expect(due.map((item) => item.id)).toEqual(["old", "middle", "recent"]);
  });

  it("lifts a frequently forgotten item above a merely older one", () => {
    const { due } = partitionQueue(
      [
        { dueAt: daysAgo(5), lapses: 0, id: "old-but-known" },
        { dueAt: daysAgo(1), lapses: 4, id: "forgotten" },
      ],
      NOW,
    );
    expect(due[0].id).toBe("forgotten");
  });

  it("orders upcoming items chronologically, soonest first", () => {
    const { upcoming } = partitionQueue(
      [
        { dueAt: daysAhead(10), lapses: 0, id: "later" },
        { dueAt: daysAhead(2), lapses: 0, id: "sooner" },
      ],
      NOW,
    );
    expect(upcoming.map((item) => item.id)).toEqual(["sooner", "later"]);
  });

  it("ignores lapses when ordering upcoming items", () => {
    // Nothing is overdue yet, so "what's next" is the only useful order.
    const { upcoming } = partitionQueue(
      [
        { dueAt: daysAhead(2), lapses: 0, id: "sooner" },
        { dueAt: daysAhead(9), lapses: 9, id: "later-but-lapsed" },
      ],
      NOW,
    );
    expect(upcoming[0].id).toBe("sooner");
  });

  it("does not mutate the input array", () => {
    const items = [
      { dueAt: daysAgo(1), lapses: 0, id: "a" },
      { dueAt: daysAgo(5), lapses: 0, id: "b" },
    ];
    const snapshot = items.map((item) => item.id);
    partitionQueue(items, NOW);
    expect(items.map((item) => item.id)).toEqual(snapshot);
  });
});
