import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { AttentionEventTracker } from "@/lib/ai/live/attention-events";
import { attentionTrackingEnabled } from "@/lib/interviews/attention-flag";

/**
 * The feature flag and the non-camera attention signals.
 *
 * The tracker reads `document` and `window` directly, so a minimal DOM is
 * stubbed here rather than pulling in jsdom for three event listeners. What
 * that buys is the part actually worth testing: switching tab fires
 * `visibilitychange` *and* `blur` in some browsers, and counting both would
 * report every tab switch twice.
 */

type Handler = () => void;

/** A DOM just large enough for the tracker, with handlers callable by name. */
function fakeDom(options: { fullscreen?: boolean } = {}) {
  const docHandlers = new Map<string, Set<Handler>>();
  const winHandlers = new Map<string, Set<Handler>>();

  const add = (map: Map<string, Set<Handler>>) => (type: string, handler: Handler) => {
    if (!map.has(type)) map.set(type, new Set());
    map.get(type)!.add(handler);
  };
  const remove = (map: Map<string, Set<Handler>>) => (type: string, handler: Handler) => {
    map.get(type)?.delete(handler);
  };

  const doc = {
    visibilityState: "visible" as "visible" | "hidden",
    fullscreenElement: options.fullscreen ? ({} as unknown) : null,
    addEventListener: add(docHandlers),
    removeEventListener: remove(docHandlers),
  };

  return {
    doc,
    win: {
      addEventListener: add(winHandlers),
      removeEventListener: remove(winHandlers),
    },
    fire(type: string): void {
      for (const handler of docHandlers.get(type) ?? []) handler();
      for (const handler of winHandlers.get(type) ?? []) handler();
    },
    listenerCount(): number {
      let total = 0;
      for (const set of docHandlers.values()) total += set.size;
      for (const set of winHandlers.values()) total += set.size;
      return total;
    },
  };
}

/**
 * Reached as a loose record on purpose.
 *
 * `globalThis.document` is typed as a full `Document` because lib.dom is in
 * scope, so assigning a three-property stub to it -- or deleting it -- is a
 * type error against a shape this test has no interest in satisfying.
 */
const globalRef = globalThis as unknown as Record<string, unknown>;
let savedDocument: unknown;
let savedWindow: unknown;

beforeEach(() => {
  savedDocument = globalRef.document;
  savedWindow = globalRef.window;
});

afterEach(() => {
  if (savedDocument === undefined) delete globalRef.document;
  else globalRef.document = savedDocument;
  if (savedWindow === undefined) delete globalRef.window;
  else globalRef.window = savedWindow;
});

function install(dom: ReturnType<typeof fakeDom>): void {
  globalRef.document = dom.doc;
  globalRef.window = dom.win;
}

describe("attentionTrackingEnabled — the flag fails closed", () => {
  it('is on only for exactly "true"', () => {
    expect(attentionTrackingEnabled("true")).toBe(true);
    expect(attentionTrackingEnabled("TRUE")).toBe(true);
    expect(attentionTrackingEnabled(" true ")).toBe(true);
  });

  it("is off when unset", () => {
    expect(attentionTrackingEnabled(undefined)).toBe(false);
    expect(attentionTrackingEnabled("")).toBe(false);
  });

  it("is off for truthy-looking values, so a typo cannot enable a camera feature", () => {
    for (const value of ["1", "yes", "on", "enabled", "True!", "false"]) {
      expect(attentionTrackingEnabled(value)).toBe(false);
    }
  });
});

describe("AttentionEventTracker — without a DOM", () => {
  it("starts without throwing and reports zeroes", () => {
    // A server render or a plain import must not have to guard the call.
    delete globalRef.document;
    delete globalRef.window;

    const tracker = new AttentionEventTracker();
    expect(() => tracker.start()).not.toThrow();
    expect(tracker.counts).toEqual({ tabSwitches: 0, fullscreenExits: 0 });
    expect(() => tracker.stop()).not.toThrow();
  });
});

describe("AttentionEventTracker — tab switches", () => {
  it("counts a tab switch once when both events fire", () => {
    // The regression this guards: switching tab fires visibilitychange and
    // blur in some browsers, so counting both doubles every switch.
    const dom = fakeDom();
    install(dom);

    const tracker = new AttentionEventTracker();
    tracker.start();

    dom.doc.visibilityState = "hidden";
    dom.fire("visibilitychange");
    dom.fire("blur");

    expect(tracker.counts.tabSwitches).toBe(1);
  });

  it("counts a window blur that is not a tab switch", () => {
    // Clicking another application leaves the document visible.
    const dom = fakeDom();
    install(dom);

    const tracker = new AttentionEventTracker();
    tracker.start();
    dom.fire("blur");

    expect(tracker.counts.tabSwitches).toBe(1);
  });

  it("does not count becoming visible again", () => {
    const dom = fakeDom();
    install(dom);

    const tracker = new AttentionEventTracker();
    tracker.start();

    dom.doc.visibilityState = "hidden";
    dom.fire("visibilitychange");
    dom.doc.visibilityState = "visible";
    dom.fire("visibilitychange");

    expect(tracker.counts.tabSwitches).toBe(1);
  });

  it("counts separate switches separately", () => {
    const dom = fakeDom();
    install(dom);

    const tracker = new AttentionEventTracker();
    tracker.start();

    for (let i = 0; i < 3; i += 1) {
      dom.doc.visibilityState = "hidden";
      dom.fire("visibilitychange");
      dom.doc.visibilityState = "visible";
      dom.fire("visibilitychange");
    }

    expect(tracker.counts.tabSwitches).toBe(3);
  });
});

describe("AttentionEventTracker — fullscreen", () => {
  it("counts an exit when the interview began in fullscreen", () => {
    const dom = fakeDom({ fullscreen: true });
    install(dom);

    const tracker = new AttentionEventTracker();
    tracker.start();

    dom.doc.fullscreenElement = null;
    dom.fire("fullscreenchange");

    expect(tracker.counts.fullscreenExits).toBe(1);
  });

  it("counts nothing when the interview never began in fullscreen", () => {
    // Otherwise every candidate who never used fullscreen is credited with
    // leaving it, which is both wrong and unanswerable.
    const dom = fakeDom({ fullscreen: false });
    install(dom);

    const tracker = new AttentionEventTracker();
    tracker.start();
    dom.fire("fullscreenchange");

    expect(tracker.counts.fullscreenExits).toBe(0);
  });

  it("does not count re-entering fullscreen", () => {
    const dom = fakeDom({ fullscreen: true });
    install(dom);

    const tracker = new AttentionEventTracker();
    tracker.start();

    dom.doc.fullscreenElement = null;
    dom.fire("fullscreenchange");
    dom.doc.fullscreenElement = {} as unknown;
    dom.fire("fullscreenchange");

    expect(tracker.counts.fullscreenExits).toBe(1);
  });
});

describe("AttentionEventTracker — lifecycle", () => {
  it("removes every listener on stop", () => {
    const dom = fakeDom();
    install(dom);

    const tracker = new AttentionEventTracker();
    tracker.start();
    expect(dom.listenerCount()).toBe(3);

    tracker.stop();
    expect(dom.listenerCount()).toBe(0);
  });

  it("stops counting once stopped", () => {
    const dom = fakeDom();
    install(dom);

    const tracker = new AttentionEventTracker();
    tracker.start();
    tracker.stop();
    dom.fire("blur");

    expect(tracker.counts.tabSwitches).toBe(0);
  });

  it("keeps the counts after stopping, so the report still has them", () => {
    const dom = fakeDom();
    install(dom);

    const tracker = new AttentionEventTracker();
    tracker.start();
    dom.fire("blur");
    tracker.stop();

    expect(tracker.counts.tabSwitches).toBe(1);
  });

  it("does not attach twice if started again", () => {
    // A re-render calling start() must not double every count.
    const dom = fakeDom();
    install(dom);

    const tracker = new AttentionEventTracker();
    tracker.start();
    tracker.start();
    expect(dom.listenerCount()).toBe(3);

    dom.fire("blur");
    expect(tracker.counts.tabSwitches).toBe(1);
  });
});
