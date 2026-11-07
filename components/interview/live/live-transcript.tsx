"use client";

import { useEffect, useRef } from "react";

import type { TranscriptSegment } from "@/lib/ai/live/types";
import { cn } from "@/lib/utils";

/**
 * Rolling transcript, as a live caption panel.
 *
 * Doubles as the accessibility surface for the whole interview: it is the
 * captions track for anyone who cannot hear the interviewer, which is why it
 * is a live region.
 *
 * Interim text is shown in a muted style so the candidate can tell what has
 * settled from what the model is still revising — presenting an unstable guess
 * as final would be misleading.
 *
 * Secondary by design. This is a video interview, and a transcript that
 * dominates the screen turns it back into a chat window.
 */
export function LiveTranscript({
  segments,
  className,
}: {
  segments: TranscriptSegment[];
  className?: string;
}) {
  const endRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  /**
   * Follow the conversation, but never yank the view.
   *
   * If the candidate has scrolled up to re-read something, auto-scroll stops
   * until they return to the bottom — otherwise the panel snatches the page
   * away mid-sentence every time a word is transcribed.
   */
  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;

    const distanceFromBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight;
    if (distanceFromBottom > 120) return;

    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [segments]);

  const lastSpeaker = segments[segments.length - 1]?.speaker;

  return (
    <div className={cn("flex min-h-0 flex-col rounded-xl border bg-card", className)}>
      <div className="flex items-center justify-between border-b px-4 py-2.5">
        <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Live transcript
        </h2>
        {lastSpeaker && (
          <span className="text-[11px] text-muted-foreground">
            {lastSpeaker === "AI" ? "Interviewer" : "You"} speaking
          </span>
        )}
      </div>

      <div
        ref={scrollRef}
        className="scrollbar-thin min-h-0 flex-1 overflow-y-auto p-4"
        role="log"
        aria-live="polite"
        aria-label="Interview transcript"
      >
        {segments.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            The transcript appears here as the interview is spoken. Nothing is
            written until someone actually speaks.
          </p>
        ) : (
          <ul className="space-y-3">
            {segments.map((segment, index) => {
              const isLast = index === segments.length - 1;
              return (
                <li
                  key={segment.id}
                  className={cn(
                    "border-l-2 pl-3 transition-colors",
                    segment.speaker === "AI" ? "border-brand/40" : "border-border",
                    isLast && "border-l-2 border-foreground/30",
                  )}
                >
                  <p
                    className={cn(
                      "text-[11px] font-semibold uppercase tracking-wide",
                      segment.speaker === "AI"
                        ? "text-brand"
                        : "text-muted-foreground",
                    )}
                  >
                    {segment.speaker === "AI" ? "Interviewer" : "You"}
                    <span className="ml-2 font-normal normal-case tabular-nums opacity-70">
                      {formatOffset(segment.atMs)}
                    </span>
                  </p>
                  <p
                    className={cn(
                      "mt-0.5 text-pretty text-sm leading-relaxed",
                      segment.interim && "italic text-muted-foreground",
                    )}
                  >
                    {segment.text}
                    {segment.interim && (
                      <span className="sr-only"> (still being transcribed)</span>
                    )}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
        <div ref={endRef} />
      </div>
    </div>
  );
}

function formatOffset(ms: number): string {
  const total = Math.floor(ms / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
