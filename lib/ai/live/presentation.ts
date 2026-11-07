import type { InterviewPhase } from "@/lib/ai/live/orchestrator-types";
import type { ConnectionState, LivePhase } from "@/lib/ai/live/types";

/**
 * How realtime state is described to the candidate.
 *
 * Pure and free of React so the wording can be tested, which matters more here
 * than it looks: this module is the boundary that stops implementation detail
 * reaching a person sitting in an interview. "PROCESSING", "activityEnd",
 * "turnEpoch" and "Gemini" are all real parts of the machinery and none of them
 * belong on screen — a candidate seeing them learns nothing and loses the
 * illusion of a professional room.
 *
 * Every label maps from state the session genuinely reports. There is no
 * "thinking" string that can appear while the model is idle.
 */

export type PresenceTone =
  | "idle"
  | "speaking"
  | "listening"
  | "thinking"
  | "problem";

export type Presence = {
  /** Two or three words, shown beside the status dot. */
  label: string;
  /** One sentence of context. Empty when the label says enough. */
  detail: string;
  tone: PresenceTone;
};

/**
 * Interviewer presence for each session phase.
 *
 * `CANDIDATE_SPEAKING` maps to *listening*, deliberately. That is the moment
 * the candidate most needs to see that they have the floor, and showing a
 * thinking spinner while someone is mid-answer suggests the interviewer has
 * stopped paying attention.
 */
const PRESENCE: Record<LivePhase, Presence> = {
  IDLE: { label: "Not started", detail: "", tone: "idle" },
  REQUESTING_PERMISSIONS: {
    label: "Waiting for devices",
    detail: "Allow camera and microphone access to begin.",
    tone: "idle",
  },
  CONNECTING: {
    label: "Joining",
    detail: "Setting up the interview room…",
    tone: "thinking",
  },
  READY: {
    label: "Ready",
    detail: "The interview is about to begin.",
    tone: "listening",
  },
  AI_SPEAKING: {
    label: "Speaking",
    detail: "Interviewer speaking",
    tone: "speaking",
  },
  LISTENING: {
    label: "Listening",
    detail: "Your turn",
    tone: "listening",
  },
  CANDIDATE_SPEAKING: {
    label: "Listening",
    detail: "Listening to your answer…",
    tone: "listening",
  },
  PROCESSING: {
    label: "Thinking",
    detail: "Reviewing your response…",
    tone: "thinking",
  },
  RECONNECTING: {
    label: "Reconnecting",
    detail: "Connection interrupted — reconnecting…",
    tone: "problem",
  },
  PAUSED: { label: "Paused", detail: "", tone: "idle" },
  COMPLETED: {
    label: "Interview complete",
    detail: "Thanks for your time.",
    tone: "idle",
  },
  FAILED: {
    label: "Disconnected",
    detail: "The interview could not continue.",
    tone: "problem",
  },
};

export function presenceFor(phase: LivePhase): Presence {
  return PRESENCE[phase] ?? PRESENCE.IDLE;
}

/**
 * After this long in `PROCESSING`, reassure rather than leave a bare spinner.
 *
 * Long enough that an ordinary decision never trips it — the measured path
 * from end-of-speech to the next question runs a few seconds — and short
 * enough that a genuine stall does not read as a frozen page.
 */
export const SLOW_THINKING_MS = 6000;

export const SLOW_THINKING_DETAIL =
  "Taking a moment to formulate the next question…";

/** Candidate-facing names for the interview phases. */
export const PHASE_LABEL: Record<InterviewPhase, string> = {
  INTRO: "Introduction",
  BACKGROUND: "Background",
  RESUME_DEEP_DIVE: "Project deep-dive",
  TECHNICAL: "Technical",
  BEHAVIORAL: "Behavioural",
  CODING: "Coding",
  SYSTEM_DESIGN: "System design",
  CLOSING: "Closing",
  COMPLETED: "Complete",
};

/**
 * The order phases are displayed in.
 *
 * A reading order for the progress strip, not a schedule. The orchestrator
 * picks phases from the interview type and the candidate's answers, so a given
 * interview visits some of these and skips others — which is why the strip
 * marks what has been reached rather than counting down to a total.
 */
export const PHASE_ORDER: InterviewPhase[] = [
  "INTRO",
  "BACKGROUND",
  "RESUME_DEEP_DIVE",
  "TECHNICAL",
  "CODING",
  "SYSTEM_DESIGN",
  "BEHAVIORAL",
  "CLOSING",
];

export type PhaseStep = {
  phase: InterviewPhase;
  label: string;
  state: "done" | "current" | "upcoming";
};

/**
 * Builds the progress strip.
 *
 * Only phases the interview actually visited are marked done, and only phases
 * this interview *plans* to visit are listed. Showing "System design ○" in a
 * behavioural interview would be inventing a stage that is never coming.
 */
export function phaseSteps(
  current: InterviewPhase,
  planned: InterviewPhase[],
): PhaseStep[] {
  const included = PHASE_ORDER.filter(
    (phase) => planned.includes(phase) || phase === current,
  );
  const currentIndex = included.indexOf(current);

  return included.map((phase, index) => ({
    phase,
    label: PHASE_LABEL[phase],
    state:
      current === "COMPLETED" || (currentIndex >= 0 && index < currentIndex)
        ? "done"
        : phase === current
          ? "current"
          : "upcoming",
  }));
}

/** Candidate-facing connection wording. No transport terminology. */
export function connectionLabel(connection: ConnectionState): string {
  switch (connection) {
    case "connected":
      return "Connected";
    case "connecting":
      return "Joining…";
    case "reconnecting":
      return "Reconnecting…";
    case "closed":
      return "Ended";
    case "offline":
      return "Not connected";
  }
}
