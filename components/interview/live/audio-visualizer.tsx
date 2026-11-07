"use client";

import { useEffect, useRef } from "react";

import { cn } from "@/lib/utils";

/**
 * Live meter for the interviewer's voice.
 *
 * Reads real output loudness on an animation frame and writes straight to the
 * DOM. No React state is involved, deliberately: a state update per audio
 * buffer would re-render the whole room dozens of times a second and compete
 * with the audio pipeline for the main thread.
 *
 * It is driven entirely by measured amplitude — when the interviewer stops
 * talking the analyser reads zero and the bars fall on their own. Nothing here
 * animates on a timer, so the meter cannot show speech that is not happening.
 */

/** Odd count so there is a true centre bar; enough to read as speech. */
const BAR_COUNT = 9;

/**
 * Per-bar share of the measured level.
 *
 * Centre bars respond fully and the outer ones progressively less, which gives
 * the familiar spindle shape without inventing per-band data — this is one
 * amplitude, shaped, not a spectrum we do not have.
 */
const WEIGHTS = Array.from({ length: BAR_COUNT }, (_, i) => {
  const distance = Math.abs(i - (BAR_COUNT - 1) / 2) / ((BAR_COUNT - 1) / 2);
  return 1 - distance * 0.65;
});

export function AudioVisualizer({
  getLevel,
  active,
  className,
}: {
  /** Returns current loudness, 0-1. */
  getLevel: () => number;
  /** Whether the interviewer is actually speaking. */
  active: boolean;
  className?: string;
}) {
  const barsRef = useRef<Array<HTMLSpanElement | null>>([]);

  useEffect(() => {
    // Idle: settle the bars and stop scheduling frames entirely, rather than
    // burning a rAF loop for the whole interview.
    if (!active) {
      for (const bar of barsRef.current) {
        if (bar) bar.style.transform = "scaleY(0.12)";
      }
      return;
    }

    let frame = 0;
    const tick = () => {
      const level = getLevel();
      barsRef.current.forEach((bar, index) => {
        if (!bar) return;
        // Floor keeps a visible sliver so the meter reads as present-and-quiet
        // rather than broken.
        const scale = Math.max(0.12, Math.min(1, level * WEIGHTS[index] * 1.35));
        bar.style.transform = `scaleY(${scale.toFixed(3)})`;
      });
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [active, getLevel]);

  return (
    <div
      className={cn("flex h-6 items-center justify-center gap-[3px]", className)}
      // Decorative: the presence label already states whether the interviewer
      // is speaking, so a screen reader gains nothing from the bars.
      aria-hidden="true"
    >
      {Array.from({ length: BAR_COUNT }, (_, index) => (
        <span
          key={index}
          ref={(element) => {
            barsRef.current[index] = element;
          }}
          className={cn(
            "h-full w-[3px] origin-center rounded-full transition-transform duration-75 ease-out",
            active ? "bg-brand" : "bg-muted-foreground/30",
          )}
          style={{ transform: "scaleY(0.12)" }}
        />
      ))}
    </div>
  );
}
