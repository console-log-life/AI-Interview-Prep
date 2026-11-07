"use client";

import {
  GoogleGenAI,
  Modality,
  type LiveServerMessage,
  type Session,
} from "@google/genai";

import { LiveAudioManager, encodeBase64 } from "@/lib/ai/live/audio";
import {
  AUDIO_CHUNK_SAMPLES,
  CONNECT_TIMEOUT_MS,
  HESITATION_GRACE_MS,
  RESPONSE_TIMEOUT_MS,
  INPUT_MIME_TYPE,
  INPUT_SAMPLE_RATE,
  PRE_ROLL_MS,
  TRANSCRIPT_MAX_WAIT_MS,
  TRANSCRIPT_POLL_MS,
  TRANSCRIPT_POST_FLUSH_GRACE_MS,
  TRANSCRIPT_STABLE_MS,
} from "@/lib/ai/live/config";
import {
  createQuestionState,
  directiveWasFollowed,
  isConversationalRepair,
  staysOnTopic,
  type QuestionState,
} from "@/lib/ai/live/intent-directives";
import {
  BARGE_IN_MIN_SPEECH_MS,
  DEFAULT_TURN_CONFIG,
  advanceTurn,
  frameEnergy,
  resetTurn,
  type TurnDetectorState,
} from "@/lib/ai/live/turn-taking";
import {
  appendFragment,
  assembled,
  resetBuffer,
  transcriptOutcome,
  type TranscriptBuffer,
} from "@/lib/ai/live/transcript-buffer";
import {
  EMPTY_MEMORY,
  type EvidenceRecord,
  type InterviewMemory,
} from "@/lib/ai/live/memory";
import { cleanTranscriptFragment, isHesitationOnly } from "@/lib/ai/live/noise";
import { decideTurnResponse } from "@/lib/ai/live/turn-decision";
import { deriveIntent, understandAnswer } from "@/lib/ai/live/understanding";
import type { SpeechTurn } from "@/lib/interviews/speech-metrics";
import {
  applyDirective,
  controllerBlock,
  decideSteering,
  orchestratorReducer,
} from "@/lib/ai/live/orchestrator";
import type {
  OrchestratorState,
  SteeringDirective,
} from "@/lib/ai/live/orchestrator-types";
import type { LiveEvent, LiveSessionGrant } from "@/lib/ai/live/types";

/**
 * Browser-side Gemini Live client.
 *
 * Connects with the ephemeral token minted by the server — the permanent
 * GEMINI_API_KEY is never present in this bundle. The client translates raw
 * socket messages into the `LiveEvent`s the pure state machine understands,
 * so all the ordering logic stays testable and none of it lives here.
 *
 * Exactly one socket per interview. Reconnection reuses the resumption handle
 * the server sends, rather than opening a second session, because two live
 * sessions would both consume quota and both try to interview the candidate.
 */

export type LiveClientOptions = {
  grant: LiveSessionGrant;
  /** Every state transition is emitted here. */
  dispatch: (event: LiveEvent) => void;
  /** Initial orchestrator state, built server-side from the interview plan. */
  orchestrator: OrchestratorState;
  /** Surfaced for observability; never shown to the candidate. */
  onDirective?: (directive: SteeringDirective) => void;
};

const MAX_RECONNECT_ATTEMPTS = 3;

/** Frames of held audio, derived from the chunk duration. */
const PRE_ROLL_FRAMES = Math.ceil(
  PRE_ROLL_MS / ((AUDIO_CHUNK_SAMPLES / INPUT_SAMPLE_RATE) * 1000),
);



export class LiveInterviewClient {
  private session: Session | null = null;
  private audio: LiveAudioManager | null = null;
  private stream: MediaStream | null = null;
  private resumptionHandle: string | null = null;
  private reconnectAttempts = 0;
  /**
   * Which socket is current.
   *
   * A closed socket fires `onclose` asynchronously, often *after* its
   * replacement is already live. Without this guard that late event calls
   * `handleDrop` again and the room shows "Reconnecting…" on top of a session
   * that is working perfectly — observed in a real browser. Callbacks capture
   * the generation they belong to and ignore anything from an older one.
   */
  private sessionGeneration = 0;
  /** True between announcing a drop and proving the link works again. */
  private reconnecting = false;
  /**
   * True while a reconnect is already under way.
   *
   * A dying socket fires `onerror` and `onclose` for the same failure, and
   * `goAway` can arrive alongside both. Without this guard each one starts its
   * own reconnect, and the interview ends up with two live sessions — both
   * interviewing the candidate, both consuming quota, and each overwriting
   * `this.session` depending on which handshake finishes last.
   */
  private reconnectPending = false;
  private closedByUser = false;
  private startedAtMs = 0;

  /**
   * The interview controller.
   *
   * Held here rather than in React state because steering decisions happen on
   * socket events, and routing every one through a render would both lag the
   * conversation and risk acting on a stale snapshot.
   */
  private orchestrator: OrchestratorState;
  /**
   * Delta fragments of the candidate's current answer, in arrival order.
   *
   * The API sends transcription as deltas, not as a growing whole. Assigning
   * each message over the last is what truncated every answer to its final
   * fragment — "ING" instead of the sentence.
   */
  private answer: TranscriptBuffer = resetBuffer();
  /** Fragments of the interviewer's current utterance, same reasoning. */
  private question: TranscriptBuffer = resetBuffer();
  /**
   * Identifies the turn currently being finalized.
   *
   * Bumped whenever a turn is abandoned — barge-in, or the candidate resuming
   * mid-finalization. An in-flight wait compares against it, which is what
   * makes finalization idempotent and stops a late fragment producing a second
   * answer, evaluation or follow-up.
   */
  private turnId = 0;
  /**
   * Whether the interview has already been opened.
   *
   * `setupComplete` fires on every successful connect, including every
   * reconnect. Without this guard a dropped socket makes the interviewer
   * re-introduce itself and re-ask its opening question part-way through the
   * interview — the candidate sees the interview restart, and the orchestrator
   * is reset to INTRO on top of state it has already moved past.
   */
  private hasOpened = false;
  /** True while a finalization is in progress. */
  private finalizing = false;
  /**
   * Set when the server closes a turn during the hold window.
   *
   * The authoritative "transcription is flushed" signal; the timers in
   * `awaitTranscriptStable` are only there for when it does not arrive.
   */
  private serverTurnCompleteSinceFlush = false;
  /** Client-side turn detection, now that server VAD is disabled. */
  private turn: TurnDetectorState = resetTurn();
  /**
   * True while the interviewer's audio is actually playing.
   *
   * Driven by the playback callback rather than by session phase, so it
   * reflects audio the candidate can really hear — the socket reports
   * generation complete while seconds of speech are still queued.
   */
  private aiIsSpeaking = false;
  /**
   * When a partial transcript was last traced.
   *
   * Fragments arrive several times a second; tracing every one would evict the
   * whole diagnostic buffer within a single answer and hide exactly the
   * ordering the trace exists to show. One per second is enough to see that
   * partials are flowing without drowning the events that matter.
   */
  private lastPartialTracedAtMs = 0;
  /** Releases the turn if a hesitation is never followed by an answer. */
  private hesitationTimer: ReturnType<typeof setTimeout> | null = null;
  /**
   * Fails the session if the interviewer never takes the turn it was handed.
   *
   * Armed when the turn is released and cleared the moment the model shows any
   * sign of life. Without it, a generation that never arrives leaves the room
   * in PROCESSING with no timeout, no message and no way back.
   */
  private responseTimer: ReturnType<typeof setTimeout> | null = null;
  /** True between activityStart and activityEnd. */
  private activityOpen = false;
  /**
   * True during the hold window that keeps the model quiet while the tail of
   * the transcription arrives. See `finalizeCandidateTurn`.
   */
  private holding = false;
  /**
   * An `interrupted` message we caused ourselves and must not act on.
   *
   * The hold window works by re-opening candidate activity, and re-opening
   * candidate activity is *exactly* how a barge-in is signalled — so the
   * server reports our own hold as an interruption. Treating that as a real
   * barge-in discards the answer that has just been spoken, invalidates the
   * finalization in flight, and leaves the interviewer with nothing to reply
   * to: the candidate finishes a complete answer and is met with silence.
   *
   * Set when the hold opens and consumed by the first `interrupted` that
   * follows. Cleared when the model starts a genuinely new turn, so a hold
   * that provoked no interruption cannot swallow a later real barge-in.
   */
  private selfInterruptExpected = false;
  /** Frames captured before the turn opened, replayed when it does. */
  private preRoll: ArrayBuffer[] = [];
  /** The exact question the interview is waiting on. */
  private currentQuestion: QuestionState | null = null;
  /** Terms the last directive pointed at, for the follow-through check. */
  private pendingSubjectTerms: string[] = [];
  /**
   * What the controller decided the next question should be.
   *
   * Recorded when the decision is made and consumed when the model actually
   * asks it, so the room can label a follow-up as a follow-up. Previously
   * every question was stamped `NEW_TOPIC` regardless of what the orchestrator
   * had chosen, which threw the distinction away.
   */
  private nextQuestionIntent: QuestionState["intent"] = "OPENING";

  /**
   * What the candidate has told us, across the whole interview.
   *
   * Held here rather than in the orchestrator because it is derived from the
   * transcript rather than from the plan, and because it must survive a
   * reconnect — the orchestrator is rebuilt from the grant, the memory is not.
   */
  private memory: InterviewMemory = EMPTY_MEMORY;
  /** Subjects already queried, so the same one is not asked about forever. */
  private clarifiedSubjects: string[] = [];
  /** Graded exchanges, in order, for the report. */
  private readonly evidence: EvidenceRecord[] = [];
  /** Answer turns already folded into memory — guards double processing. */
  private readonly rememberedTurns = new Set<number>();
  /** Development trace. Never rendered to the candidate. */
  private readonly trace_: LiveTraceEntry[] = [];

  /**
   * Timing of each candidate turn, for the post-interview delivery analysis.
   *
   * Collected here rather than reconstructed from the transcript afterwards
   * because only the turn detector knows when speech actually started and
   * where the pauses fell. Message timestamps would give answer *arrival*
   * times, which say nothing about how fast the candidate spoke.
   */
  private readonly speechTurns: SpeechTurn[] = [];
  private turnStartedAtMs: number | null = null;
  private pausesInTurn: number[] = [];
  private pauseStartedAtMs: number | null = null;

  constructor(private readonly options: LiveClientOptions) {
    this.orchestrator = options.orchestrator;
  }

  private get dispatch() {
    return this.options.dispatch;
  }

  /**
   * The candidate's answer so far, assembled from its fragments.
   *
   * Joined without a separator because the deltas carry their own leading
   * spaces (" I", " AM", "FTWA"); inserting more would break words apart.
   */
  private get pendingAnswer(): string {
    return assembled(this.answer);
  }

  private get pendingQuestion_(): string {
    return assembled(this.question);
  }

  /** Opens the socket and starts streaming microphone audio. */
  async start(stream: MediaStream): Promise<void> {
    this.stream = stream;
    this.closedByUser = false;
    this.startedAtMs = Date.now();

    this.dispatch({ type: "CONNECT_STARTED" });

    this.audio = new LiveAudioManager({
      onChunk: (pcm) => {
        // detectTurn may open the activity window, which replays the pre-roll,
        // so it runs first.
        this.detectTurn(pcm);

        if (this.activityOpen) {
          this.sendAudio(pcm);
        } else {
          // Audio outside an activity window is discarded by the server under
          // manual activity detection, so hold it rather than losing the
          // candidate's first syllable.
          this.preRoll.push(pcm);
          if (this.preRoll.length > PRE_ROLL_FRAMES) this.preRoll.shift();
        }
      },
      onPlaybackChange: (playing) => {
        this.aiIsSpeaking = playing;
        // Driven by the audio graph, so these bracket what the candidate can
        // actually hear rather than when generation finished.
        this.trace(playing ? "ai-audio-started" : "ai-audio-ended", {});
        // Playback finishing is what actually ends the AI turn from the
        // candidate's point of view — the socket reports generation complete
        // while seconds of audio are still queued.
        if (!playing) this.dispatch({ type: "AI_TURN_COMPLETE" });
      },
    });

    await this.audio.startPlayback();
    await this.audio.startCapture(stream);
    await this.audio.resume();

    await this.connect();
  }

  private async connect(): Promise<void> {
    const { grant } = this.options;

    // `apiKey` here is the ephemeral token name, not the project key.
    const client = new GoogleGenAI({
      apiKey: grant.token,
      httpOptions: { apiVersion: "v1alpha" },
    });

    const generation = ++this.sessionGeneration;
    const isCurrent = () => generation === this.sessionGeneration;

    try {
      this.session = await this.withConnectTimeout(client.live.connect({
        model: grant.model,
        callbacks: {
          onopen: () => {
            if (!isCurrent()) return;
            this.reconnectAttempts = 0;
            this.dispatch({ type: "CONNECTED", atMs: Date.now() });
          },
          onmessage: (message: LiveServerMessage) => {
            if (!isCurrent()) return;
            this.handleMessage(message);
          },
          onerror: () => {
            if (!isCurrent()) return;
            void this.handleDrop();
          },
          onclose: () => {
            if (!isCurrent()) return;
            void this.handleDrop();
          },
        },
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: grant.systemInstruction,
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: grant.voiceName },
            },
          },
          // Both directions transcribed, so the candidate can read what was
          // said and the server can persist real turns.
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          realtimeInputConfig: {
            /**
             * Activity detection is DISABLED on purpose.
             *
             * With server-side VAD, Gemini begins generating its reply the
             * instant it hears end-of-speech, so any steering sent afterwards
             * arrives too late to shape that reply — the controller ends up
             * commenting on a question already asked. Owning the boundary here
             * creates the window to understand the answer and steer BEFORE
             * releasing the turn.
             */
            automaticActivityDetection: { disabled: true },
          },
          sessionResumption: this.resumptionHandle
            ? { handle: this.resumptionHandle }
            : {},
        },
      }));
    } catch (error) {
      /**
       * Retire this generation before reporting the failure.
       *
       * The callbacks above captured `generation`, and nothing has bumped it
       * since — so a handshake that fails slowly, or one abandoned by the
       * timeout and delivered afterwards, would still read as current and
       * drive a session the room has already given up on.
       */
      this.sessionGeneration += 1;
      this.trace("error", {
        note: `connect failed: ${error instanceof Error ? error.message : "unknown"}`,
      });
      this.dispatch({
        type: "ERROR",
        message:
          "Could not connect to the voice service. You can retry, or continue with the text interview.",
      });
    }
  }

  /**
   * Bounds the handshake.
   *
   * `live.connect()` never gives up on its own, so a socket that opens and
   * then stalls before setup leaves the room on "Connecting…" indefinitely —
   * no timeout, no message, no way back. Failing here routes into the existing
   * connect-failure path, which reports a usable error and offers a retry.
   */
  private async withConnectTimeout(pending: Promise<Session>): Promise<Session> {
    let timedOut = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const expiry = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        timedOut = true;
        reject(new Error("The voice service did not finish connecting in time."));
      }, CONNECT_TIMEOUT_MS);
    });

    /**
     * A handshake that lands after we gave up belongs to nobody.
     *
     * Left open it would keep a second socket alive against the same
     * interview, consuming quota and streaming audio nothing is reading. This
     * is attached before the race so the late resolution cannot be missed.
     */
    void pending
      .then((late) => {
        if (!timedOut) return;
        try {
          late.close();
        } catch {
          // Already gone, which is the expected case.
        }
      })
      .catch(() => undefined);

    try {
      return await Promise.race([pending, expiry]);
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Arms the watchdog that catches an interviewer which never replies.
   *
   * Scoped to the generation and turn that armed it: a reconnect or a barge-in
   * makes the wait meaningless, and firing anyway would fail a session that
   * had already recovered.
   */
  private armResponseWatchdog(): void {
    this.clearResponseWatchdog();
    const generation = this.sessionGeneration;
    const turnId = this.turnId;

    this.responseTimer = setTimeout(() => {
      this.responseTimer = null;
      if (generation !== this.sessionGeneration || turnId !== this.turnId) return;
      if (this.closedByUser || this.reconnectPending) return;

      this.trace("error", {
        note: `no response within ${RESPONSE_TIMEOUT_MS}ms of releasing the turn`,
      });
      this.dispatch({
        type: "ERROR",
        message:
          "The interviewer stopped responding. You can retry, or continue with the text interview.",
      });
    }, RESPONSE_TIMEOUT_MS);
  }

  private clearResponseWatchdog(): void {
    if (this.responseTimer) {
      clearTimeout(this.responseTimer);
      this.responseTimer = null;
    }
  }

  private handleMessage(message: LiveServerMessage): void {
    // The interview is over. Messages still in flight must not append to a
    // transcript that has already been finalized and reported.
    if (this.closedByUser) return;

    // Traffic is proof of a working connection. If a stale close event left the
    // room showing "Reconnecting…", the arrival of a real server message is
    // evidence to the contrary — so the state is corrected from what is
    // actually happening rather than left to a timeout.
    if (this.reconnecting) {
      this.reconnecting = false;
      this.dispatch({ type: "RECONNECTED" });
    }

    if (message.setupComplete) {
      this.dispatch({ type: "SETUP_COMPLETE" });

      // A reconnect re-runs setup, but the interview is already under way:
      // re-opening would replay the greeting and reset the plan to INTRO.
      if (this.hasOpened) {
        this.trace("reconnect-completed", {
          note: "session resumed; interview state preserved",
        });
        return;
      }
      this.hasOpened = true;

      // Open the interview under controller direction rather than letting the
      // model improvise a greeting.
      this.orchestrator = orchestratorReducer(this.orchestrator, {
        type: "INTERVIEW_STARTED",
        atMs: Date.now(),
      });
      const opening = decideSteering(this.orchestrator, Date.now());
      if (opening) {
        this.orchestrator = applyDirective(this.orchestrator, opening);
        this.options.onDirective?.(opening);
        // The opening DOES request a turn — the interviewer speaks first.
        try {
          this.session?.sendClientContent({
            turns: [{ role: "user", parts: [{ text: opening.text }] }],
            turnComplete: true,
          });
        } catch {
          // Falls back to the system prompt's own opening instruction.
        }
      }
      return;
    }

    // Keep the newest resumption handle so a drop can resume rather than
    // restart the interview.
    if (message.sessionResumptionUpdate?.newHandle) {
      this.resumptionHandle = message.sessionResumptionUpdate.newHandle;
    }

    // The server is about to close this socket; reconnect proactively so the
    // candidate never sees a dead session.
    if (message.goAway) {
      void this.handleDrop();
      return;
    }

    const content = message.serverContent;
    if (!content) return;

    // Barge-in. Drop buffered audio immediately — this is the difference
    // between the AI stopping mid-word and talking over the candidate.
    if (content.interrupted) {
      /**
       * Unless we caused it.
       *
       * `completeCandidateTurn` releases the turn and immediately re-opens
       * candidate activity to hold the model back while the transcription
       * tail arrives. The model has often already started generating by then,
       * so the server reports that hold as an interruption — of a turn the
       * candidate has just *finished*. Acting on it wipes the assembled
       * answer, abandons the finalization waiting on it, and records a
       * barge-in that never happened. The answer is simply lost and the
       * interviewer never replies to it.
       */
      // While the hold is open the model is not speaking — that is the whole
      // point of it — so nothing here can be the candidate cutting it off. The
      // flag covers the tail case, where the interrupt lands just after the
      // turn was released.
      if (this.holding || this.selfInterruptExpected) {
        this.selfInterruptExpected = false;
        this.trace("interruption", {
          note: "self-inflicted by hold window; answer preserved",
        });
        // Deliberately falls through to the transcription below: the tail of
        // the candidate's answer often arrives in this very message.
      } else {
        this.audio?.flushPlayback();
        this.dispatch({ type: "INTERRUPTED" });

        // The candidate has taken the floor mid-sentence. Whatever was
        // buffered is an incomplete thought; committing it would score a
        // fragment and advance the interview on it.
        this.answer = resetBuffer();
        // Invalidates any in-flight finalization for the turn just abandoned.
        this.turnId += 1;
        this.finalizing = false;
        this.holding = false;
        // The model's turn was cut off, so it owes no reply to the turn the
        // watchdog is timing.
        this.clearResponseWatchdog();
        this.orchestrator = orchestratorReducer(this.orchestrator, {
          type: "INTERRUPTION",
        });
        this.trace("interruption", {
          note: "AI speech cancelled, partial answer discarded",
        });
      }
    }

    const atMs = Date.now() - this.startedAtMs;

    // --- candidate speech -------------------------------------------------
    // Two distinct signals, and conflating them is the classic realtime bug:
    //   interimInputTranscription — low-latency, still changing, UI only
    //   inputTranscription        — the real transcription, carrying `finished`
    // Orchestration runs ONLY on a finished transcription. Steering off interim
    // text produces follow-ups about half a sentence the candidate had not
    // finished saying.
    if (content.interimInputTranscription?.text) {
      // Trimmed for display only: this is a standalone line on screen, not a
      // fragment being joined to others.
      const interim = cleanTranscriptFragment(
        content.interimInputTranscription.text,
      ).trim();
      if (interim) {
        this.dispatch({
          type: "TRANSCRIPT",
          speaker: "CANDIDATE",
          text: interim,
          atMs,
          interim: true,
        });
      }
    }

    if (content.inputTranscription?.text) {
      /**
       * Non-speech annotations never reach the answer.
       *
       * `<noise>` and friends are not words, and letting them into the buffer
       * means the orchestrator scores them as an answer and follows up on a
       * cough. Filtered here, at the point of entry, so every consumer
       * downstream sees the same thing: a turn of pure noise is a turn where
       * nothing was said.
       */
      const fragment = cleanTranscriptFragment(content.inputTranscription.text);
      if (fragment) {
        const now = Date.now();
        if (now - this.lastPartialTracedAtMs >= 1000) {
          this.lastPartialTracedAtMs = now;
          this.trace("partial-transcript", {
            note: `${this.answer.parts.length + 1} fragments`,
          });
        }
        // A delta, not the whole utterance. Append.
        this.answer = appendFragment(this.answer, fragment, Date.now());

        // The reducer replaces the trailing interim segment, so it is handed
        // the assembled text rather than the fragment.
        this.dispatch({
          type: "TRANSCRIPT",
          speaker: "CANDIDATE",
          text: this.pendingAnswer,
          atMs,
          interim: true,
        });
      }
    }

    /**
     * Anything the interviewer produces during the hold belongs to a turn that
     * is being cancelled.
     *
     * The hold exists to keep the model quiet while the candidate's answer
     * finishes arriving, so this is a narrow window — but if the model does
     * squeeze a fragment out before the cancel lands, playing it talks over a
     * candidate who is still finishing, and recording it overwrites the real
     * question with half of one. The answer would then be graded against a
     * question that was never asked.
     */
    if (content.outputTranscription?.text && !this.holding) {
      // Also deltas. Without accumulating, the transcript panel showed the
      // interviewer's last syllable instead of the question.
      this.question = appendFragment(
        this.question,
        content.outputTranscription.text,
        Date.now(),
      );
      this.dispatch({
        type: "TRANSCRIPT",
        speaker: "AI",
        text: this.pendingQuestion_,
        atMs,
        interim: true,
      });
    }

    // Audio parts arrive inline as base64 PCM. Dropped during the hold for the
    // same reason as the transcription above: the candidate is still talking.
    for (const part of content.modelTurn?.parts ?? []) {
      const data = part.inlineData?.data;
      if (data && !this.holding) {
        // The model is genuinely speaking again, so any interruption from here
        // on is the candidate's doing. Clearing here rather than on release
        // covers the case where a hold provoked no `interrupted` at all —
        // otherwise a stale flag would swallow the next real barge-in.
        this.selfInterruptExpected = false;
        // Audio the candidate will hear is the only proof that matters.
        this.clearResponseWatchdog();
        this.dispatch({ type: "AI_TURN_STARTED" });
        this.audio?.enqueue(data);
      }
    }

    if (content.turnComplete) {
      // Recorded before anything else: during the hold window this is the
      // signal that the candidate's transcription has finished flushing, and
      // the turn it closes is usually the empty one the hold interrupted.
      this.serverTurnCompleteSinceFlush = true;

      const asked = this.pendingQuestion_;
      this.question = resetBuffer();

      // An empty turnComplete is expected: the hold window interrupts the
      // model's turn before it produces audio, and that is not a question.
      // Neither is anything that leaked out during the hold itself.
      if (!asked || this.holding) return;

      // Promote what is on screen to finalized.
      this.dispatch({
        type: "TRANSCRIPT",
        speaker: "AI",
        text: asked,
        atMs,
        interim: false,
      });

      // The model finished speaking. This records WHAT IT ASKED — it is not
      // the point at which the interview advances. The candidate has not said
      // anything yet.
      this.recordInterviewerQuestion(asked);
    }
  }

  /**
   * Records the question the interviewer just asked.
   *
   * Separate from advancing the interview: at this moment the candidate has
   * said nothing. This exists so the controller knows which exact question it
   * is waiting on, and so a repeat request can re-ask *that* question.
   */
  private recordInterviewerQuestion(questionText: string): void {
    const text = questionText.trim();
    if (!text) return;

    const now = Date.now();
    const previous = this.currentQuestion?.text ?? null;

    // Did the model act on the directive we sent before releasing the turn?
    if (this.pendingSubjectTerms.length > 0) {
      const verdict = directiveWasFollowed({
        askedQuestion: text,
        previousQuestion: previous,
        subjectTerms: this.pendingSubjectTerms,
      });
      if (!verdict.followed) {
        this.orchestrator = {
          ...this.orchestrator,
          ignoredDirectives: this.orchestrator.ignoredDirectives + 1,
        };
        this.trace("directive-unfollowed", {
          question: text,
          note: `confidence ${verdict.confidence}`,
        });
      }
      this.pendingSubjectTerms = [];
    }

    this.orchestrator = orchestratorReducer(this.orchestrator, {
      type: "QUESTION_ASKED",
      text,
      atMs: now,
    });

    this.currentQuestion = createQuestionState({
      id: `q-${now}`,
      text,
      topicId: this.orchestrator.currentTopicId,
      topicLabel:
        this.orchestrator.plan.find((t) => t.id === this.orchestrator.currentTopicId)
          ?.label ?? null,
      intent: this.nextQuestionIntent,
      phase: this.orchestrator.phase,
      difficulty: this.orchestrator.difficulty,
      askedAtMs: now,
    });

    // Consumed: anything asked before the next decision is a new thread.
    this.nextQuestionIntent = "NEW_TOPIC";

    // The turn is now the candidate's.
    this.turn = resetTurn();
    this.trace("question-asked", { question: text });
  }

  /**
   * The candidate has finished speaking. This is the real decision point.
   *
   * The ordering here is forced by measured API behaviour, not by preference:
   *
   *   1. `activityEnd` — the ONLY thing that flushes the tail of the
   *      transcription. Waiting does not work; verified by holding for 8.3s
   *      with four words outstanding and receiving nothing until it was sent.
   *   2. `activityStart` immediately after — re-opening candidate activity
   *      interrupts the model's turn, so it cannot answer while the controller
   *      is still assembling the answer. This is the hold window, and it is
   *      what upholds the invariant that no follow-up is ever generated from a
   *      partial transcript.
   *   3. Wait for the transcript to go quiet.
   *   4. Understand the COMPLETE answer, decide, steer.
   *   5. `activityEnd` again — release. The model now generates with the
   *      directive already in its context.
   *
   * Without step 2 the controller is racing the model: the tail arrived
   * ~1.9s after the flush while the model began speaking ~2.8s after it,
   * leaving margin measured in milliseconds.
   */
  private async completeCandidateTurn(): Promise<void> {
    if (this.finalizing) return;
    this.finalizing = true;
    const turnId = ++this.turnId;

    // 1. Flush the transcription tail.
    this.serverTurnCompleteSinceFlush = false;
    this.sendActivityEnd();

    // 2. Hold the model back while it arrives. The activityEnd above may have
    // already started the model generating, so this will very often come back
    // as an `interrupted` — which is ours, not the candidate's.
    this.selfInterruptExpected = true;
    this.sendActivityStart();
    this.holding = true;
    // Reset the detector so speech resuming during the hold is still detected;
    // an ENDED detector ignores every frame.
    this.turn = resetTurn();

    // 3. Wait for the transcript to stabilize.
    const outcome = await this.awaitTranscriptStable(turnId);

    if (outcome === "ABANDONED") {
      // Barge-in, or the candidate resumed. The new turn finishes on its own.
      this.trace("speech-end", { note: "finalization abandoned" });
      return;
    }

    const answer = this.pendingAnswer;
    this.answer = resetBuffer();

    /**
     * A turn of pure hesitation is not a turn.
     *
     * "Um…", "let me think", "so…" — the transcriber heard these correctly,
     * but replying to them is the most unnatural thing a voice interviewer can
     * do. The activity window is still open from the hold, so simply not
     * releasing keeps the model silent and leaves the floor where it belongs.
     * The detector is reset so their real answer is picked up as fresh speech.
     */
    if (answer && isHesitationOnly(answer)) {
      this.trace("answer-finalized", {
        answer,
        note: "hesitation only — still listening",
      });
      this.turn = resetTurn();
      this.finalizing = false;
      // The room must stop saying it is reviewing an answer that was never
      // given; the candidate still has the floor.
      this.dispatch({ type: "AWAITING_CANDIDATE" });

      // Bounded: if the answer never comes, release rather than hang.
      if (this.hesitationTimer) clearTimeout(this.hesitationTimer);
      this.hesitationTimer = setTimeout(() => {
        this.hesitationTimer = null;
        if (!this.holding) return;
        this.holding = false;
        this.releaseTurn();
      }, HESITATION_GRACE_MS);
      return;
    }

    if (!answer) {
      /**
       * Speech was detected but nothing was transcribed.
       *
       * Nothing is invented here — no answer object, no evaluation, no
       * orchestrator event. The interview state is exactly as it was before the
       * candidate spoke. The one thing we do is tell the model to ask them to
       * repeat, because the alternative is a silence the candidate cannot
       * interpret. It heard the audio even if the transcriber produced nothing,
       * so this is the natural interviewer response rather than an error
       * screen.
       */
      this.steer(
        controllerBlock({
          phase: this.orchestrator.phase,
          topic: this.currentQuestion?.topicLabel ?? undefined,
          difficulty: this.orchestrator.difficulty,
          instruction:
            "You did not catch what the candidate said. Say so briefly and ask them to repeat their answer. Do not guess at what they might have said, do not answer for them, and do not move to a new question.",
        }),
      );
      this.trace("answer-finalized", {
        note: `empty transcript (${outcome}); asked candidate to repeat`,
      });

      this.holding = false;
      this.finalizing = false;
      this.releaseTurn();
      return;
    }

    /**
     * Promote the answer from interim to finalized.
     *
     * Without this the candidate's side of the interview was never finalized
     * at all: every candidate segment was dispatched as interim, and
     * `finalizedTurns` — which is what the periodic flush and the closing
     * flush both send — filters interim out. The stored transcript therefore
     * contained the interviewer's questions and nothing else, so the saved
     * interview read as one in which the candidate never spoke.
     *
     * Dispatched with the same text as the trailing interim segment, which the
     * reducer replaces in place rather than appending, so the panel does not
     * show the answer twice.
     */
    this.dispatch({
      type: "TRANSCRIPT",
      speaker: "CANDIDATE",
      text: answer,
      atMs: Date.now() - this.startedAtMs,
      interim: false,
    });

    const questionText = this.currentQuestion?.text ?? "";

    this.trace("final-transcript", {
      answer,
      note: `${answer.split(/\s+/).filter(Boolean).length} words, transcript=${outcome}`,
    });
    this.trace("understanding-started", {});

    const understanding = understandAnswer(answer, questionText);
    const intent = deriveIntent(understanding);

    this.trace("understanding-completed", {
      note: `intent=${intent} words=${understanding.wordCount}`,
    });
    this.trace("candidate-turn-finalized", { note: `turn ${this.speechTurns.length + 1}` });

    this.recordSpeechTurn(answer);

    this.trace("answer-finalized", {
      answer,
      note: `intent=${intent} words=${understanding.wordCount} transcript=${outcome}`,
    });

    // Conversational repairs never advance interview state.
    if (!isConversationalRepair(intent)) {
      this.orchestrator = orchestratorReducer(this.orchestrator, {
        type: "ANSWER_FINALIZED",
        text: answer,
        atMs: Date.now(),
      });
    } else if (this.currentQuestion) {
      if (intent === "REPEAT_QUESTION") this.currentQuestion.repeatRequested += 1;
      if (intent === "CLARIFY_QUESTION") this.currentQuestion.clarificationRequested += 1;
    }

    /**
     * The decision itself, including memory, contradictions and evidence.
     *
     * Only a SUFFICIENT answer lets the plan move, so the plan's own next move
     * is computed up front and handed over as an option — `decideTurnResponse`
     * may decline it in favour of clarifying something the candidate said
     * earlier, or of returning to a technology they raised.
     */
    const turnNumber = this.speechTurns.length;
    const alreadyRemembered = this.rememberedTurns.has(turnNumber);
    const planDirective = staysOnTopic(intent)
      ? null
      : decideSteering(this.orchestrator, Date.now());

    const decision = decideTurnResponse({
      answerText: answer,
      questionText,
      topicLabel: this.currentQuestion?.topicLabel ?? null,
      understanding,
      intent,
      turn: turnNumber,
      atMs: Date.now() - this.startedAtMs,
      // A replayed turn contributes nothing further to memory or evidence.
      memory: this.memory,
      clarifiedSubjects: this.clarifiedSubjects,
      orchestrator: this.orchestrator,
      planDirective,
    });

    if (!alreadyRemembered) {
      this.rememberedTurns.add(turnNumber);
      this.memory = decision.memory;
      if (decision.evidence) this.evidence.push(decision.evidence);
    }
    this.clarifiedSubjects = decision.clarifiedSubjects;

    if (decision.applyDirective) {
      this.orchestrator = applyDirective(this.orchestrator, decision.applyDirective);
      this.options.onDirective?.(decision.applyDirective);
      this.pendingSubjectTerms = subjectTermsFor(this.orchestrator);
    } else {
      this.pendingSubjectTerms = decision.subjectTerms;
    }

    this.nextQuestionIntent = decision.nextQuestionIntent;
    const block = decision.block;
    this.trace("decision", {
      note: `${decision.reason}:${decision.nextQuestionIntent}`,
    });

    this.steer(block);

    // 5. Release. The directive is already in context.
    this.holding = false;
    this.finalizing = false;
    this.releaseTurn();
  }

  /**
   * Waits for the in-flight transcription to finalize.
   *
   * Resolves as soon as the API marks the input transcription finished, or
   * when the grace period expires — whichever comes first. Also bails out if
   * the candidate starts talking again, since the turn is no longer over.
   */
  private async awaitTranscriptStable(
    turnId: number,
  ): Promise<"STABLE" | "CAPPED" | "ABANDONED"> {
    const waitStartedAtMs = Date.now();
    const config = {
      stableMs: TRANSCRIPT_STABLE_MS,
      postFlushGraceMs: TRANSCRIPT_POST_FLUSH_GRACE_MS,
      maxWaitMs: TRANSCRIPT_MAX_WAIT_MS,
    };

    for (;;) {
      // The turn was abandoned under us — barge-in, speech resuming, a dropped
      // socket, or the candidate ending the interview mid-answer.
      if (this.turnId !== turnId || this.closedByUser) return "ABANDONED";

      const outcome = transcriptOutcome(
        this.answer,
        {
          waitStartedAtMs,
          nowMs: Date.now(),
          serverTurnComplete: this.serverTurnCompleteSinceFlush,
        },
        config,
      );
      if (outcome !== "PENDING") return outcome;

      await new Promise((resolve) => setTimeout(resolve, TRANSCRIPT_POLL_MS));
    }
  }

  /** Opens the candidate's activity window and replays any held audio. */
  private sendActivityStart(): void {
    // No socket means no window was opened server-side. Recording one anyway
    // makes the client stream audio into a turn that does not exist, where it
    // is discarded — the failure looks exactly like a working microphone.
    if (!this.session) return;
    try {
      this.session.sendRealtimeInput({ activityStart: {} });
      this.activityOpen = true;
      this.trace("candidate-activity-start", {
        note: `pre-roll ${this.preRoll.length} frames`,
      });
      for (const frame of this.preRoll) this.sendAudio(frame);
      this.preRoll = [];
    } catch {
      // Socket gone; the close handler deals with it.
    }
  }

  private sendActivityEnd(): void {
    // Closed locally either way: with no socket there is nothing left open.
    this.activityOpen = false;
    if (!this.session) return;
    try {
      this.session.sendRealtimeInput({ activityEnd: {} });
      this.trace("candidate-activity-end", {});
    } catch {
      // Socket gone.
    }
  }

  /**
   * Stores the timing of the turn that just ended.
   *
   * The end time is taken as the moment the last silence began, not now —
   * otherwise every answer would appear to include the full silence threshold
   * of dead air, inflating its duration and understating the pace.
   */
  private recordSpeechTurn(text: string): void {
    if (this.turnStartedAtMs === null) return;

    const endedAt = this.turn.silenceStartedAtMs ?? Date.now();
    this.speechTurns.push({
      text,
      startedAtMs: this.turnStartedAtMs - this.startedAtMs,
      endedAtMs: Math.max(this.turnStartedAtMs, endedAt) - this.startedAtMs,
      pauseMsWithin: [...this.pausesInTurn],
      questionIndex: this.speechTurns.length + 1,
    });

    this.turnStartedAtMs = null;
    this.pausesInTurn = [];
    this.pauseStartedAtMs = null;
  }

  /** What the candidate has said, as remembered across the interview. */
  get interviewMemory(): InterviewMemory {
    return this.memory;
  }

  /** Graded exchanges, for evidence-based feedback. */
  get evidenceLog(): readonly EvidenceRecord[] {
    return this.evidence;
  }

  /** Measured candidate turns, for the post-interview delivery analysis. */
  get candidateTurns(): readonly SpeechTurn[] {
    return this.speechTurns;
  }

  /**
   * Hands the floor back to the model.
   *
   * Sent after steering so the model generates with the directive already in
   * its context rather than a turn later.
   */
  private releaseTurn(): void {
    this.sendActivityEnd();
    // From here the interview depends on the model replying, and nothing local
    // can make it. See `responseTimer`.
    this.armResponseWatchdog();
    this.trace("turn-released", {});
  }

  /**
   * Sends controller context without requesting a spoken turn.
   *
   * `turnComplete: false` is what makes this steering rather than a message:
   * the text joins the conversation as context the model reads before its
   * next turn, instead of prompting it to reply to the controller.
   */
  private steer(text: string): void {
    if (!this.session) return;
    try {
      this.session.sendClientContent({
        turns: [{ role: "user", parts: [{ text }] }],
        turnComplete: false,
      });
      this.trace("steering-sent", { note: `${text.length} chars` });
    } catch {
      // A failed steer is not fatal — the interview continues on the system
      // prompt alone, which is the pre-orchestrator behaviour. It is traced
      // because an interview where every steer silently fails looks identical
      // to one where the controller is working.
      this.trace("error", { note: "steering failed; socket unavailable" });
    }
  }

  /**
   * Runs client-side voice activity detection over the outgoing frame.
   *
   * Necessary because server VAD is disabled — see the connect config. The
   * detector decides when the candidate started and finished, which is what
   * lets the controller think before the model speaks.
   */
  private detectTurn(pcm: ArrayBuffer): void {
    // Capture is torn down asynchronously, so chunks queued before "End
    // interview" can still arrive. Starting a turn on one would re-open an
    // activity window on a session that is closing.
    if (this.closedByUser) return;

    const samples = new Float32Array(pcm.byteLength / 2);
    const view = new DataView(pcm);
    for (let i = 0; i < samples.length; i += 1) {
      samples[i] = view.getInt16(i * 2, true) / 0x8000;
    }

    const frameMs = (AUDIO_CHUNK_SAMPLES / INPUT_SAMPLE_RATE) * 1000;

    /**
     * Interrupting the interviewer takes more than starting a turn.
     *
     * While the model is speaking, opening a candidate activity window cuts it
     * off mid-sentence — so the bar for doing so has to clear the noise the
     * microphone picks up during that time. When the floor is already the
     * candidate's, the normal threshold applies and the first syllable is not
     * lost.
     */
    const { state, signal } = advanceTurn(
      this.turn,
      { energy: frameEnergy(samples), frameMs, nowMs: Date.now() },
      {
        ...DEFAULT_TURN_CONFIG,
        minSpeechMs: this.aiIsSpeaking
          ? BARGE_IN_MIN_SPEECH_MS
          : DEFAULT_TURN_CONFIG.minSpeechMs,
        silenceMs: this.options.grant.silenceDurationMs,
      },
    );
    // Pause bookkeeping, read from the phase transition rather than the
    // signal: a mid-answer pause is deliberately signal-free, because emitting
    // one is what would let the interviewer jump in.
    if (this.turn.phase === "SPEAKING" && state.phase === "TRAILING_SILENCE") {
      this.pauseStartedAtMs = Date.now();
    } else if (
      this.turn.phase === "TRAILING_SILENCE" &&
      state.phase === "SPEAKING" &&
      this.pauseStartedAtMs !== null
    ) {
      this.pausesInTurn.push(Date.now() - this.pauseStartedAtMs);
      this.pauseStartedAtMs = null;
    }

    this.turn = state;

    if (signal.type === "SPEECH_START") {
      // They resumed, so the hesitation grace no longer applies.
      if (this.hesitationTimer) {
        clearTimeout(this.hesitationTimer);
        this.hesitationTimer = null;
      }
      /**
       * The candidate speaking is proof the interview is alive.
       *
       * Disarmed rather than left to the generation check, because an answer
       * longer than the response budget would otherwise fail a session that
       * is working perfectly — the candidate is talking, which is exactly what
       * the interviewer was waiting for.
       */
      this.clearResponseWatchdog();
      this.turnStartedAtMs = Date.now();
      this.pausesInTurn = [];
      this.pauseStartedAtMs = null;

      if (this.holding) {
        // The candidate resumed while we were finalizing. That was a long
        // thinking pause, not the end of the answer — so abandon the pending
        // finalization and keep collecting into the same answer. The activity
        // window is already open from the hold, so nothing is re-sent.
        this.turnId += 1;
        this.holding = false;
        this.finalizing = false;
        this.trace("speech-start", { note: "resumed during finalization" });
      } else {
        this.sendActivityStart();
        this.trace("speech-start", {});
      }

      if (this.currentQuestion) this.currentQuestion.candidateStartedAnswering = true;
      this.dispatch({ type: "CANDIDATE_SPEECH_STARTED" });
      return;
    }

    if (signal.type === "SPEECH_END") {
      this.dispatch({ type: "CANDIDATE_SPEECH_ENDED" });
      this.trace("speech-end", { note: signal.reason });
      if (this.currentQuestion) this.currentQuestion.answerFinalized = true;
      void this.completeCandidateTurn();
    }
  }

  /** Appends to the development trace, bounded. */
  private trace(
    event: LiveTraceEntry["event"],
    detail: { question?: string; answer?: string; note?: string },
  ): void {
    this.trace_.push({
      atMs: Date.now() - this.startedAtMs,
      generation: this.sessionGeneration,
      turnId: this.turnId,
      event,
      speaker: CANDIDATE_EVENTS.has(event) ? "CANDIDATE" : "AI",
      currentQuestion: this.currentQuestion?.text?.slice(0, 120) ?? null,
      currentTopic: this.currentQuestion?.topicLabel ?? null,
      phase: this.orchestrator.phase,
      difficulty: this.orchestrator.difficulty,
      ...detail,
    });
    if (this.trace_.length > 300) this.trace_.shift();
  }

  /** Development trace. Diagnostic only — never rendered to the candidate. */
  get devTrace(): readonly LiveTraceEntry[] {
    return this.trace_;
  }

  /** The exact question the interview is waiting on. */
  get pendingQuestion(): QuestionState | null {
    return this.currentQuestion;
  }

  /**
   * Loudness of the interviewer's voice right now, 0-1.
   *
   * A method rather than state: the room samples it from an animation frame,
   * so a meter can follow real audio without re-rendering React on every
   * buffer.
   */
  outputLevel(): number {
    return this.audio?.outputLevel() ?? 0;
  }

  private sendAudio(pcm: ArrayBuffer): void {
    if (!this.session) return;
    try {
      this.session.sendRealtimeInput({
        audio: { data: encodeBase64(pcm), mimeType: INPUT_MIME_TYPE },
      });
    } catch {
      // A send failing means the socket is gone; the close handler deals with
      // it. Swallowing here avoids an exception per 128ms chunk.
    }
  }

  /** Current controller state, for the room's progress display. */
  get controllerState(): OrchestratorState {
    return this.orchestrator;
  }

  /**
   * The controller trail, for development.
   *
   * Deliberately a getter rather than something pushed into React state: it is
   * diagnostic output, and rendering it on every entry would put controller
   * internals one careless JSX line away from the candidate's screen.
   */
  get controllerLog() {
    return this.orchestrator.log;
  }

  /** Asks the interviewer to wrap up, used by "End interview". */
  requestClosing(): void {
    this.orchestrator = orchestratorReducer(this.orchestrator, {
      type: "END_REQUESTED",
    });
    this.steer(
      [
        "[INTERVIEW CONTROLLER — internal guidance, do not read aloud or mention]",
        "Instruction: The candidate has ended the session. Stop asking questions immediately.",
      ].join("\n"),
    );
  }

  setMuted(muted: boolean): void {
    this.audio?.setMuted(muted);
    this.dispatch({ type: "TOGGLE_MIC", muted });
  }

  /** Silences the interviewer's voice. The session continues underneath. */
  setOutputMuted(muted: boolean): void {
    this.audio?.setOutputMuted(muted);
  }

  private async handleDrop(): Promise<void> {
    if (this.closedByUser) return;
    // A failing socket fires `onerror` and `onclose` for the same failure, and
    // `goAway` can land beside them. Each one starting its own reconnect gives
    // the interview two live sessions.
    if (this.reconnectPending) return;
    this.reconnectPending = true;

    /**
     * Retire the dead socket's callbacks immediately.
     *
     * Closing a socket delivers its `onclose` asynchronously — usually after
     * the replacement is already live. Bumping the generation here rather than
     * only inside `connect` means every late event from the old session is
     * stale from this instant, so none of them can reach `handleDrop`,
     * `handleMessage` or the transcript of the session that replaces it.
     */
    this.sessionGeneration += 1;

    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      this.reconnectPending = false;
      this.dispatch({
        type: "ERROR",
        message:
          "The voice connection was lost and could not be restored. Your transcript so far has been saved.",
      });
      return;
    }

    this.reconnectAttempts += 1;
    this.reconnecting = true;
    this.dispatch({ type: "RECONNECTING" });
    this.trace("reconnect-started", { note: `attempt ${this.reconnectAttempts}` });

    /**
     * Release any half-finished turn.
     *
     * `completeCandidateTurn` sets `finalizing` and waits on the transcript. If
     * the socket dies inside that wait, the flags stay set for the rest of the
     * session and every later turn returns at the guard — the candidate talks
     * and is never heard again. Clearing them here is what makes a reconnect
     * recoverable rather than terminal.
     */
    this.finalizing = false;
    this.holding = false;
    this.selfInterruptExpected = false;
    this.turnId += 1;
    if (this.hesitationTimer) {
      clearTimeout(this.hesitationTimer);
      this.hesitationTimer = null;
    }
    // The turn it was waiting on belonged to the dead socket. Leaving it armed
    // would fail a session that is in the middle of recovering.
    this.clearResponseWatchdog();

    /**
     * Forget that the candidate's activity window was ever open.
     *
     * This is what makes a reconnect survivable at all. The window belonged to
     * the dead socket; the new one opens with no activity in progress. Left
     * set, two things go wrong at once and neither is visible: `activityOpen`
     * stays true so every captured frame is sent outside any turn, where the
     * server discards it, and the detector still has `activityOpen` set so it
     * never emits another SPEECH_START — meaning `activityStart` is never sent
     * on the new socket either. The room reconnects, says it is listening, and
     * the candidate is never heard again for the rest of the interview.
     *
     * The assembled answer is deliberately kept: the candidate may have been
     * mid-sentence, and their words so far are not the connection's to discard.
     */
    this.turn = resetTurn();
    this.activityOpen = false;
    this.preRoll = [];

    // Whatever was queued belongs to the dead session. Playing it out after
    // reconnecting would talk over the resumed interview.
    this.audio?.flushPlayback();
    this.aiIsSpeaking = false;

    // Retire the dead socket explicitly. Leaving it open risks two live
    // sessions both interviewing the candidate and both consuming quota.
    try {
      this.session?.close();
    } catch {
      // Already gone, which is the expected case here.
    }
    this.session = null;

    // Exponential backoff — retrying instantly against a rate-limited or
    // down service just burns the remaining attempts.
    const delay = Math.min(8000, 500 * 2 ** this.reconnectAttempts);
    await new Promise((resolve) => setTimeout(resolve, delay));

    if (this.closedByUser) {
      this.reconnectPending = false;
      return;
    }
    try {
      await this.connect();
    } finally {
      // Released only once the replacement socket exists, so a second drop
      // event cannot open a parallel reconnect in the meantime.
      this.reconnectPending = false;
    }
    // Not announced as recovered here: `connect` resolving only means the
    // socket opened. The first real message clears it, above.
  }

  /** Ends the session and releases every device. */
  async stop(): Promise<void> {
    this.closedByUser = true;
    /**
     * Retire every callback before anything is torn down.
     *
     * Closing the socket does not stop messages already in flight, and a
     * transcript fragment or audio part delivered after "End interview" would
     * dispatch into a component that is unmounting — and, worse, append to a
     * transcript that has already been flushed and reported.
     */
    this.sessionGeneration += 1;
    // Abandons any finalization still polling for a transcript tail that can
    // no longer arrive.
    this.turnId += 1;
    this.finalizing = false;
    this.holding = false;
    this.activityOpen = false;

    if (this.hesitationTimer) {
      clearTimeout(this.hesitationTimer);
      this.hesitationTimer = null;
    }
    this.clearResponseWatchdog();

    try {
      this.session?.close();
    } catch {
      // Already closed.
    }
    this.session = null;

    await this.audio?.dispose();
    this.audio = null;

    // Releasing the tracks is what turns off the browser's camera and
    // microphone indicators. Leaving them running after the interview is a
    // privacy failure, not an untidy one.
    for (const track of this.stream?.getTracks() ?? []) track.stop();
    this.stream = null;
  }
}

/** Events that describe the candidate rather than the interviewer. */
const CANDIDATE_EVENTS: ReadonlySet<LiveTraceEntry["event"]> = new Set([
  "candidate-activity-start",
  "candidate-activity-end",
  "speech-start",
  "speech-end",
  "partial-transcript",
  "final-transcript",
  "candidate-turn-finalized",
  "answer-finalized",
]);

/** One line of the development trace. */
export type LiveTraceEntry = {
  /** Elapsed interview time when the event happened. */
  atMs: number;
  /**
   * Which socket generation produced this.
   *
   * The field that makes reconnect bugs legible: two events from different
   * generations interleaved is the signature of a stale callback still firing
   * against a session that has already been replaced.
   */
  generation: number;
  /** The candidate turn in flight, or 0 before the first answer. */
  turnId: number;
  event:
    | "question-asked"
    | "candidate-activity-start"
    | "candidate-activity-end"
    | "speech-start"
    | "speech-end"
    | "partial-transcript"
    | "final-transcript"
    | "candidate-turn-finalized"
    | "understanding-started"
    | "understanding-completed"
    | "answer-finalized"
    | "decision"
    | "steering-sent"
    | "turn-released"
    | "ai-audio-started"
    | "ai-audio-ended"
    | "interruption"
    | "reconnect-started"
    | "reconnect-completed"
    | "directive-unfollowed"
    /**
     * Something failed and was handled rather than surfaced.
     *
     * The client swallows send failures on purpose — throwing once per 128ms
     * audio chunk would be worse than useless — but swallowing them silently
     * left no way to tell a working session from one whose every steer was
     * being dropped. Recorded here, where it is bounded and never rendered.
     */
    | "error";
  speaker: "AI" | "CANDIDATE";
  currentQuestion: string | null;
  currentTopic: string | null;
  phase: string;
  difficulty: string;
  question?: string;
  answer?: string;
  note?: string;
};

/** Terms a plan directive pointed at, for the follow-through check. */
function subjectTermsFor(state: {
  currentTopicId: string | null;
  plan: Array<{ id: string; label: string }>;
  pendingDirective: { topicLabel: string | null } | null;
}): string[] {
  const label =
    state.pendingDirective?.topicLabel ??
    state.plan.find((t) => t.id === state.currentTopicId)?.label ??
    "";
  return label ? [label] : [];
}
