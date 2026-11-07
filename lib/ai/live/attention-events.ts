"use client";

import type { AttentionEvents } from "@/lib/interviews/attention";

/**
 * Tab, focus and fullscreen events during an interview.
 *
 * The signals here are the ones a camera cannot see: the candidate switching
 * to another tab, the window losing focus, or fullscreen being left. They come
 * from ordinary DOM events, so there is nothing to sample and no CPU cost
 * beyond three listeners.
 *
 * Deliberately **outside** the live client. `client.ts` owns turn-taking,
 * barge-in, reconnect and the watchdogs, and none of this belongs in that file
 * — an attention counter has no business near code where an ordering mistake
 * loses a candidate's answer.
 *
 * Bounded by construction: two integers and a boolean, never a history of
 * events. A thirty-minute interview and a three-hour one cost the same memory.
 */

/**
 * Ceiling on each counter.
 *
 * Not a real limit — nobody switches tabs a thousand times — but a counter
 * wired to a DOM event that some browser decides to fire repeatedly should
 * saturate rather than report a number that makes the report look broken.
 */
const MAX_COUNT = 999;

export class AttentionEventTracker {
  private tabSwitches = 0;
  private fullscreenExits = 0;
  /**
   * Whether the interview began in fullscreen.
   *
   * Exits are only counted if it did. Otherwise every candidate who never used
   * fullscreen would be credited with leaving it, which is both wrong and
   * unanswerable.
   */
  private startedFullscreen = false;
  private detach: Array<() => void> = [];
  private running = false;

  /**
   * Attaches the listeners.
   *
   * Safe to call when there is no DOM — it simply does nothing, so a server
   * render or a test importing this module does not have to guard the call.
   */
  start(): void {
    if (this.running) return;
    if (typeof document === "undefined" || typeof window === "undefined") return;

    this.running = true;
    this.startedFullscreen = Boolean(document.fullscreenElement);

    /**
     * Tab switches: `visibilitychange` and `blur` both fire for overlapping
     * situations — switching tab fires both in some browsers — so only the
     * transition into a hidden or unfocused state is counted, and `blur` is
     * ignored while the document is already hidden.
     */
    const onVisibility = (): void => {
      if (document.visibilityState === "hidden") this.bumpTabSwitch();
    };
    const onBlur = (): void => {
      if (document.visibilityState !== "hidden") this.bumpTabSwitch();
    };
    const onFullscreenChange = (): void => {
      if (this.startedFullscreen && !document.fullscreenElement) {
        this.fullscreenExits = Math.min(MAX_COUNT, this.fullscreenExits + 1);
      }
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onBlur);
    document.addEventListener("fullscreenchange", onFullscreenChange);

    this.detach = [
      () => document.removeEventListener("visibilitychange", onVisibility),
      () => window.removeEventListener("blur", onBlur),
      () => document.removeEventListener("fullscreenchange", onFullscreenChange),
    ];
  }

  /** Removes every listener. Counts are kept, so the report still has them. */
  stop(): void {
    for (const remove of this.detach) remove();
    this.detach = [];
    this.running = false;
  }

  get counts(): AttentionEvents {
    return {
      tabSwitches: this.tabSwitches,
      fullscreenExits: this.fullscreenExits,
    };
  }

  private bumpTabSwitch(): void {
    this.tabSwitches = Math.min(MAX_COUNT, this.tabSwitches + 1);
  }
}
