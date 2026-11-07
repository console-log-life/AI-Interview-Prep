import { describe, expect, it } from "vitest";

import { PERSONA_TUNING } from "@/lib/ai/live/config";
import {
  PHASE_LABEL,
  PHASE_ORDER,
  connectionLabel,
  phaseSteps,
  presenceFor,
} from "@/lib/ai/live/presentation";
import type { InterviewPhase } from "@/lib/ai/live/orchestrator-types";
import { INITIAL_LIVE_STATE, type LivePhase } from "@/lib/ai/live/types";

/**
 * What the interview room says to the candidate.
 *
 * The reason this is worth testing: it is the boundary that keeps
 * implementation detail off a screen someone is being interviewed in front of.
 * A leaked "PROCESSING" or "activityEnd" is not a crash, so nothing else would
 * ever catch it.
 */

const ALL_PHASES = Object.keys({
  IDLE: 0,
  REQUESTING_PERMISSIONS: 0,
  CONNECTING: 0,
  READY: 0,
  AI_SPEAKING: 0,
  LISTENING: 0,
  CANDIDATE_SPEAKING: 0,
  PROCESSING: 0,
  RECONNECTING: 0,
  PAUSED: 0,
  COMPLETED: 0,
  FAILED: 0,
} satisfies Record<LivePhase, number>) as LivePhase[];

describe("no implementation detail reaches the candidate", () => {
  it.each(ALL_PHASES)("%s produces human wording", (phase) => {
    const presence = presenceFor(phase);
    const text = `${presence.label} ${presence.detail}`;

    // Internal vocabulary that must never be rendered.
    expect(text).not.toMatch(
      /activityStart|activityEnd|turnEpoch|VAD|Gemini|transcriptOutcome|orchestrator|websocket/i,
    );
    // Nor the raw enum name.
    expect(presence.label).not.toBe(phase);
    expect(presence.label.length).toBeGreaterThan(0);
  });

  it("never shows a raw phase constant", () => {
    for (const phase of ALL_PHASES) {
      const { label } = presenceFor(phase);
      expect(label).not.toMatch(/^[A-Z_]+$/);
    }
  });

  it("describes every connection state in plain words", () => {
    for (const connection of [
      "offline",
      "connecting",
      "connected",
      "reconnecting",
      "closed",
    ] as const) {
      const label = connectionLabel(connection);
      expect(label).not.toMatch(/^[a-z]+$/);
      expect(label).not.toMatch(/socket|stream|api/i);
    }
  });
});

describe("presence matches what is actually happening", () => {
  it("shows listening — not thinking — while the candidate speaks", () => {
    // A spinner mid-answer reads as the interviewer having stopped paying
    // attention, which is the opposite of the truth.
    const presence = presenceFor("CANDIDATE_SPEAKING");
    expect(presence.tone).toBe("listening");
    expect(presence.detail).toMatch(/listening/i);
  });

  it("only marks the speaking tone when the model holds the floor", () => {
    const speaking = ALL_PHASES.filter((phase) => presenceFor(phase).tone === "speaking");
    expect(speaking).toEqual(["AI_SPEAKING"]);
  });

  it("only marks the thinking tone where there is real work in flight", () => {
    const thinking = ALL_PHASES.filter((phase) => presenceFor(phase).tone === "thinking");
    expect(thinking).toEqual(expect.arrayContaining(["PROCESSING", "CONNECTING"]));
    expect(thinking).not.toContain("LISTENING");
    expect(thinking).not.toContain("CANDIDATE_SPEAKING");
  });

  it("surfaces a lost connection as a problem, not as idleness", () => {
    expect(presenceFor("RECONNECTING").tone).toBe("problem");
    expect(presenceFor("RECONNECTING").detail).toMatch(/reconnect/i);
  });

  it("starts from a state that claims nothing", () => {
    expect(presenceFor(INITIAL_LIVE_STATE.phase).tone).toBe("idle");
  });
});

describe("phase progress is real, never invented", () => {
  const planned: InterviewPhase[] = ["INTRO", "TECHNICAL", "CLOSING"];

  it("lists only phases this interview actually plans to visit", () => {
    // Showing "System design" in a behavioural interview would advertise a
    // stage that is never coming.
    const steps = phaseSteps("INTRO", planned);
    expect(steps.map((step) => step.phase)).toEqual(["INTRO", "TECHNICAL", "CLOSING"]);
    expect(steps.map((step) => step.phase)).not.toContain("SYSTEM_DESIGN");
  });

  it("marks earlier phases done and the current one current", () => {
    const steps = phaseSteps("TECHNICAL", planned);
    expect(steps.find((step) => step.phase === "INTRO")?.state).toBe("done");
    expect(steps.find((step) => step.phase === "TECHNICAL")?.state).toBe("current");
    expect(steps.find((step) => step.phase === "CLOSING")?.state).toBe("upcoming");
  });

  it("includes the current phase even when the plan did not list it", () => {
    // The orchestrator can move somewhere the initial plan did not cover; the
    // strip must still show where the candidate actually is.
    const steps = phaseSteps("BEHAVIORAL", planned);
    expect(steps.map((step) => step.phase)).toContain("BEHAVIORAL");
    expect(steps.find((step) => step.phase === "BEHAVIORAL")?.state).toBe("current");
  });

  it("marks everything done once the interview completes", () => {
    const steps = phaseSteps("COMPLETED", planned);
    expect(steps.every((step) => step.state === "done")).toBe(true);
  });

  it("returns nothing rather than a fake plan when there is none", () => {
    // Before the first question there is no plan; an invented strip would be
    // progress the interview has not made.
    expect(phaseSteps("INTRO", [])).toHaveLength(1);
  });

  it("gives every phase a candidate-facing name", () => {
    for (const phase of PHASE_ORDER) {
      expect(PHASE_LABEL[phase]).toBeTruthy();
      expect(PHASE_LABEL[phase]).not.toMatch(/_/);
    }
  });
});

describe("interviewer identity comes from configuration", () => {
  it("gives every persona a name and a title", () => {
    for (const tuning of Object.values(PERSONA_TUNING)) {
      expect(tuning.displayName.trim().length).toBeGreaterThan(0);
      expect(tuning.title.trim().length).toBeGreaterThan(0);
    }
  });

  it("always says it is an AI", () => {
    // The candidate is never left to assume they are talking to a person.
    for (const tuning of Object.values(PERSONA_TUNING)) {
      expect(tuning.title).toMatch(/^AI /);
    }
  });

  it("uses a first name only, never a fabricated full identity", () => {
    for (const tuning of Object.values(PERSONA_TUNING)) {
      expect(tuning.displayName.trim().split(/\s+/)).toHaveLength(1);
    }
  });
});
