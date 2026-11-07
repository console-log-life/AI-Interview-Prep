"use client";

import { useEffect, useState } from "react";
import { Loader2, Mic, Volume2, WifiOff } from "lucide-react";

import { AudioVisualizer } from "@/components/interview/live/audio-visualizer";
import {
  SLOW_THINKING_DETAIL,
  SLOW_THINKING_MS,
  presenceFor,
  type PresenceTone,
} from "@/lib/ai/live/presentation";
import type { LivePhase } from "@/lib/ai/live/types";
import { cn } from "@/lib/utils";

/**
 * The AI interviewer's on-screen presence.
 *
 * Deliberately an abstract mark rather than a synthetic human face: a
 * photoreal avatar that is not a real person invites the candidate to read
 * expressions that carry no information. For the same reason there are no
 * emotional cues — no smiling, nodding or reacting — because none of that
 * would be backed by anything the model actually reports.
 *
 * Every state here corresponds to something the session genuinely reports, and
 * is conveyed by icon, text and animation together, never by colour alone.
 */

const TONE_ICON = {
  speaking: Volume2,
  listening: Mic,
  thinking: Loader2,
  problem: WifiOff,
  idle: Mic,
} as const;

const TONE_ACCENT: Record<PresenceTone, string> = {
  idle: "text-muted-foreground",
  speaking: "text-brand",
  listening: "text-success",
  thinking: "text-warning",
  problem: "text-destructive",
};

const TONE_DOT: Record<PresenceTone, string> = {
  idle: "bg-muted-foreground",
  speaking: "bg-brand",
  listening: "bg-success",
  thinking: "bg-warning",
  problem: "bg-destructive",
};

const TONE_RING: Record<PresenceTone, string> = {
  idle: "ring-border",
  speaking: "ring-brand/60",
  listening: "ring-success/50",
  thinking: "ring-warning/50",
  problem: "ring-destructive/50",
};

export function InterviewerPresence({
  phase,
  interviewerName,
  interviewerTitle,
  contextLine,
  getOutputLevel,
}: {
  phase: LivePhase;
  interviewerName: string;
  interviewerTitle: string;
  /** e.g. "Technical interview · Software Engineer". */
  contextLine: string;
  getOutputLevel: () => number;
}) {
  const presence = presenceFor(phase);
  const Icon = TONE_ICON[presence.tone];
  const speaking = phase === "AI_SPEAKING";

  /**
   * A long think gets a reassuring line instead of a bare spinner.
   *
   * Only ever shown while the session is genuinely in the thinking state, and
   * it resets the moment the phase changes, so it cannot linger and imply the
   * interviewer is stuck when it is not.
   */
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    setSlow(false);
    if (presence.tone !== "thinking") return;
    const timer = setTimeout(() => setSlow(true), SLOW_THINKING_MS);
    return () => clearTimeout(timer);
  }, [phase, presence.tone]);

  const detail = slow ? SLOW_THINKING_DETAIL : presence.detail;

  return (
    <div className="relative flex h-full min-h-[260px] flex-col items-center justify-center gap-4 overflow-hidden rounded-xl border bg-gradient-to-b from-muted/40 to-muted/10 p-6">
      {/* Avatar */}
      <div
        className={cn(
          "relative flex h-24 w-24 items-center justify-center rounded-full bg-background/80 ring-4 backdrop-blur transition-colors duration-300",
          TONE_RING[presence.tone],
        )}
      >
        {/* Runs only while the interviewer is genuinely speaking. */}
        {speaking && (
          <span
            aria-hidden="true"
            className="absolute inset-0 animate-ping rounded-full bg-brand/15 motion-reduce:animate-none"
          />
        )}
        <span
          className={cn(
            "text-2xl font-semibold tracking-tight",
            TONE_ACCENT[presence.tone],
          )}
          aria-hidden="true"
        >
          {initials(interviewerName)}
        </span>
      </div>

      {/* Identity */}
      <div className="text-center">
        <p className="text-sm font-semibold">{interviewerName}</p>
        <p className="text-xs text-muted-foreground">{interviewerTitle}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{contextLine}</p>
      </div>

      {/* Real audio, or a settled meter when silent. */}
      <AudioVisualizer getLevel={getOutputLevel} active={speaking} />

      {/* State */}
      <div
        className="flex flex-col items-center gap-1 text-center"
        aria-live="polite"
      >
        <span className="flex items-center gap-1.5 text-sm font-medium">
          <span
            className={cn(
              "h-1.5 w-1.5 rounded-full",
              TONE_DOT[presence.tone],
              speaking && "animate-pulse motion-reduce:animate-none",
            )}
            aria-hidden="true"
          />
          <Icon
            className={cn(
              "h-3.5 w-3.5",
              TONE_ACCENT[presence.tone],
              presence.tone === "thinking" &&
                "animate-spin motion-reduce:animate-none",
            )}
            aria-hidden="true"
          />
          {presence.label}
        </span>
        {detail && (
          <span className="text-xs text-muted-foreground">{detail}</span>
        )}
      </div>
    </div>
  );
}

function initials(name: string): string {
  return name.trim().slice(0, 2).toUpperCase() || "AI";
}
