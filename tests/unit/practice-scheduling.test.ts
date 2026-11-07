import { describe, expect, it } from "vitest";

import {
  DEFAULT_EASE,
  FIRST_INTERVAL_DAYS,
  MAX_EASE,
  MAX_INTERVAL_DAYS,
  MIN_EASE,
  QUALITY_LABEL,
  SECOND_INTERVAL_DAYS,
  applyReview,
  createReviewState,
  isDue,
  nextDueDate,
  previewIntervals,
  reviewPriority,
  type ReviewQuality,
  type ReviewState,
} from "@/lib/practice/scheduling";

/**
 * The property that matters most: a concept the candidate keeps forgetting
 * must come back faster than one they merely find dull. Everything below
 * either proves that, or proves the schedule cannot run away to a point where
 * an item effectively disappears.
 */

const ALL_QUALITIES: ReviewQuality[] = ["AGAIN", "HARD", "GOOD", "EASY"];

function state(overrides: Partial<ReviewState> = {}): ReviewState {
  return createReviewState(overrides);
}

describe("applyReview — first reviews", () => {
  it("schedules a brand-new item one day out on a pass", () => {
    const next = applyReview(state(), "GOOD");
    expect(next.intervalDays).toBe(FIRST_INTERVAL_DAYS);
    expect(next.reviewCount).toBe(1);
  });

  it("uses the fixed second interval on the next pass", () => {
    const first = applyReview(state(), "GOOD");
    const second = applyReview(first, "GOOD");
    expect(second.intervalDays).toBe(SECOND_INTERVAL_DAYS);
    expect(second.reviewCount).toBe(2);
  });

  it("keeps the second interval shorter when the recall was hard", () => {
    const first = applyReview(state(), "GOOD");
    const hard = applyReview(first, "HARD");
    expect(hard.intervalDays).toBeLessThan(SECOND_INTERVAL_DAYS);
    expect(hard.intervalDays).toBeGreaterThanOrEqual(FIRST_INTERVAL_DAYS);
  });

  it("does not count a first-ever failure as a lapse", () => {
    // Nothing was learned yet, so nothing was forgotten.
    const next = applyReview(state(), "AGAIN");
    expect(next.lapses).toBe(0);
    expect(next.reviewCount).toBe(0);
  });
});

describe("applyReview — AGAIN", () => {
  it("always returns a mature item to a one-day interval", () => {
    const mature = state({ intervalDays: 60, reviewCount: 8 });
    expect(applyReview(mature, "AGAIN").intervalDays).toBe(FIRST_INTERVAL_DAYS);
  });

  it("records a lapse once the item has been passed before", () => {
    const mature = state({ intervalDays: 30, reviewCount: 4, lapses: 1 });
    expect(applyReview(mature, "AGAIN").lapses).toBe(2);
  });

  it("preserves the review history rather than resetting it", () => {
    const mature = state({ intervalDays: 30, reviewCount: 4 });
    // Wiping reviewCount would disguise a genuinely difficult concept as new.
    expect(applyReview(mature, "AGAIN").reviewCount).toBe(4);
  });

  it("lowers the ease so the item returns faster in future", () => {
    const mature = state({ intervalDays: 30, reviewCount: 4 });
    expect(applyReview(mature, "AGAIN").ease).toBeLessThan(mature.ease);
  });
});

describe("applyReview — interval growth", () => {
  const mature = state({ intervalDays: 10, reviewCount: 5 });

  it("grows by the ease factor on a good recall", () => {
    const next = applyReview(mature, "GOOD");
    expect(next.intervalDays).toBe(Math.round(10 * DEFAULT_EASE));
  });

  it("grows fastest on EASY and slowest on HARD", () => {
    const hard = applyReview(mature, "HARD").intervalDays;
    const good = applyReview(mature, "GOOD").intervalDays;
    const easy = applyReview(mature, "EASY").intervalDays;

    expect(hard).toBeLessThan(good);
    expect(good).toBeLessThan(easy);
  });

  it("never schedules beyond the cap", () => {
    let current = state({ intervalDays: 100, reviewCount: 20, ease: MAX_EASE });
    for (let index = 0; index < 10; index += 1) {
      current = applyReview(current, "EASY");
      expect(current.intervalDays).toBeLessThanOrEqual(MAX_INTERVAL_DAYS);
    }
  });

  it("never schedules below one day", () => {
    let current = state({ intervalDays: 1, reviewCount: 5, ease: MIN_EASE });
    for (let index = 0; index < 10; index += 1) {
      current = applyReview(current, "HARD");
      expect(current.intervalDays).toBeGreaterThanOrEqual(FIRST_INTERVAL_DAYS);
    }
  });
});

describe("ease bounds", () => {
  it("never falls below the floor however many failures", () => {
    let current = state({ intervalDays: 20, reviewCount: 5 });
    for (let index = 0; index < 30; index += 1) {
      current = applyReview(current, "AGAIN");
    }
    expect(current.ease).toBeGreaterThanOrEqual(MIN_EASE);
  });

  it("never rises above the ceiling however many easy passes", () => {
    let current = state();
    for (let index = 0; index < 30; index += 1) {
      current = applyReview(current, "EASY");
    }
    expect(current.ease).toBeLessThanOrEqual(MAX_EASE);
  });

  it("leaves ease unchanged on a plain GOOD", () => {
    const next = applyReview(state({ reviewCount: 3, intervalDays: 5 }), "GOOD");
    expect(next.ease).toBe(DEFAULT_EASE);
  });
});

describe("a repeatedly forgotten item returns faster than a well-known one", () => {
  it("holds across a realistic sequence", () => {
    // Both start identical; one is forgotten twice along the way.
    let solid = state();
    let shaky = state();

    for (const quality of ["GOOD", "GOOD", "GOOD", "GOOD"] as const) {
      solid = applyReview(solid, quality);
    }
    for (const quality of ["GOOD", "AGAIN", "GOOD", "AGAIN"] as const) {
      shaky = applyReview(shaky, quality);
    }

    expect(shaky.intervalDays).toBeLessThan(solid.intervalDays);
    expect(shaky.ease).toBeLessThan(solid.ease);
    expect(shaky.lapses).toBeGreaterThan(solid.lapses);
  });
});

describe("nextDueDate", () => {
  const now = new Date("2026-06-01T12:00:00Z");

  it("adds the interval to the review time", () => {
    const due = nextDueDate(state({ intervalDays: 5 }), now);
    expect(due.toISOString()).toBe("2026-06-06T12:00:00.000Z");
  });

  it("never schedules in the past for an unscheduled item", () => {
    const due = nextDueDate(state({ intervalDays: 0 }), now);
    expect(due.getTime()).toBeGreaterThan(now.getTime());
  });
});

describe("isDue", () => {
  const now = new Date("2026-06-01T12:00:00Z");

  it("is true at or before now", () => {
    expect(isDue(new Date("2026-05-31T12:00:00Z"), now)).toBe(true);
    expect(isDue(now, now)).toBe(true);
  });

  it("is false in the future", () => {
    expect(isDue(new Date("2026-06-02T12:00:00Z"), now)).toBe(false);
  });
});

describe("reviewPriority", () => {
  const now = new Date("2026-06-01T12:00:00Z");

  it("ranks the more overdue item first", () => {
    const older = reviewPriority({
      dueAt: new Date("2026-05-25T12:00:00Z"),
      lapses: 0,
      now,
    });
    const newer = reviewPriority({
      dueAt: new Date("2026-05-31T12:00:00Z"),
      lapses: 0,
      now,
    });
    expect(older).toBeGreaterThan(newer);
  });

  it("lifts an item that is forgotten often above one that is merely late", () => {
    const forgotten = reviewPriority({
      dueAt: new Date("2026-05-31T12:00:00Z"),
      lapses: 4,
      now,
    });
    const late = reviewPriority({
      dueAt: new Date("2026-05-29T12:00:00Z"),
      lapses: 0,
      now,
    });
    expect(forgotten).toBeGreaterThan(late);
  });

  it("does not go negative for something not yet due", () => {
    const future = reviewPriority({
      dueAt: new Date("2026-07-01T12:00:00Z"),
      lapses: 0,
      now,
    });
    expect(future).toBeGreaterThanOrEqual(0);
  });
});

describe("previewIntervals", () => {
  it("returns a day count for every button the UI renders", () => {
    const preview = previewIntervals(state({ intervalDays: 10, reviewCount: 5 }));
    for (const quality of ALL_QUALITIES) {
      expect(preview[quality]).toBeGreaterThanOrEqual(FIRST_INTERVAL_DAYS);
      expect(Number.isInteger(preview[quality])).toBe(true);
    }
  });

  it("matches what applying that grade would actually schedule", () => {
    const current = state({ intervalDays: 12, reviewCount: 6 });
    const preview = previewIntervals(current);
    for (const quality of ALL_QUALITIES) {
      expect(preview[quality]).toBe(applyReview(current, quality).intervalDays);
    }
  });

  it("orders the previews from soonest to latest", () => {
    const preview = previewIntervals(state({ intervalDays: 10, reviewCount: 5 }));
    expect(preview.AGAIN).toBeLessThanOrEqual(preview.HARD);
    expect(preview.HARD).toBeLessThanOrEqual(preview.GOOD);
    expect(preview.GOOD).toBeLessThanOrEqual(preview.EASY);
  });
});

describe("labels", () => {
  it("describes recall rather than making a judgement about the person", () => {
    for (const quality of ALL_QUALITIES) {
      const label = QUALITY_LABEL[quality].toLowerCase();
      expect(label.length).toBeGreaterThan(3);
      expect(label).not.toMatch(/stupid|bad|failure|useless/);
    }
  });
});

describe("scheduling is deterministic", () => {
  it("produces the same result for the same input", () => {
    const current = state({ intervalDays: 9, reviewCount: 4, lapses: 1 });
    for (const quality of ALL_QUALITIES) {
      expect(applyReview(current, quality)).toEqual(
        applyReview(current, quality),
      );
    }
  });

  it("never returns a non-finite interval or ease", () => {
    let current = state();
    for (let index = 0; index < 50; index += 1) {
      current = applyReview(current, ALL_QUALITIES[index % 4]);
      expect(Number.isFinite(current.intervalDays)).toBe(true);
      expect(Number.isFinite(current.ease)).toBe(true);
      expect(current.intervalDays).toBeGreaterThan(0);
    }
  });
});
