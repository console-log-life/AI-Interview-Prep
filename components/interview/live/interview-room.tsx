"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  Camera,
  CameraOff,
  Captions,
  Loader2,
  Mic,
  MicOff,
  MoreHorizontal,
  PhoneOff,
  Settings2,
  Unplug,
  Volume2,
  VolumeX,
} from "lucide-react";

import {
  CurrentQuestion,
  PhaseStrip,
} from "@/components/interview/live/interview-context";
import { InterviewerPresence } from "@/components/interview/live/interviewer-presence";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useLiveInterview } from "@/hooks/use-live-interview";
import { formatClock, interviewClock } from "@/lib/ai/live/clock";
import { presenceFor } from "@/lib/ai/live/presentation";
import {
  CAMERA_STATUS_DETAIL,
  CAMERA_STATUS_LABEL,
  cameraActionLabel,
  cameraIsRendering,
  cameraToggleEnabled,
} from "@/lib/ai/live/media-state";
import { connectionLabel } from "@/lib/ai/live/presentation";
import { cn, humanizeEnum } from "@/lib/utils";

/**
 * The live interview room.
 *
 * Laid out as a two-person call: the interviewer and the candidate side by
 * side and dominant, the transcript a secondary caption panel beside them.
 * That ordering is the point — the same information arranged with the
 * transcript in the middle reads as a chat window with a webcam bolted on.
 *
 * Everything rendered here comes from the session state machine or the
 * orchestrator, so no indicator can disagree with what is actually happening.
 * Nothing animates on a timer: the speaking meter follows measured audio, and
 * "you're speaking" appears only while the detector says the candidate holds
 * the floor.
 */
export function InterviewRoom({
  interviewId,
  interviewType,
  targetRole,
  durationMin,
  plannedQuestions,
  wantVideo,
  interviewerName,
  interviewerTitle,
}: {
  interviewId: string;
  interviewType: string;
  targetRole: string;
  durationMin: number;
  /**
   * Questions this interview set out to ask.
   *
   * The number the candidate chose at setup, so progress against it is a real
   * plan rather than an invented total. The orchestrator may still close early
   * or run a question over, which is why the label says "of N planned" instead
   * of promising a count.
   */
  plannedQuestions: number;
  wantVideo: boolean;
  interviewerName: string;
  interviewerTitle: string;
}) {
  const router = useRouter();
  const [endOpen, setEndOpen] = useState(false);
  const [ending, setEnding] = useState(false);
  const [speakerMuted, setSpeakerMuted] = useState(false);
  /**
   * Captions, off by default.
   *
   * A real interview does not put the candidate's own words on screen as they
   * speak, and watching your sentences appear turns an interview into a chat
   * window. The transcript is still recorded, still flushed to the database and
   * still shown in full on the report — only this display is gone.
   *
   * When on, it shows the interviewer's current question and nothing else.
   * Never the candidate's live speech: that is the thing being fixed, so it is
   * not reachable from any toggle.
   */
  const [captionsOn, setCaptionsOn] = useState(false);

  // Ticks the clock. The anchor is `liveStartedAtMs` from the grant — when the
  // candidate actually joined — not the interview row's creation time, which
  // for a resumed interview can be hours earlier.
  const [now, setNow] = useState(() => Date.now());

  const {
    state,
    interview,
    liveStartedAtMs,
    cameraState,
    outputLevel,
    attachPreview,
    start,
    retry,
    stop,
    toggleMic,
    toggleSpeaker,
    toggleCamera,
  } = useLiveInterview({ interviewId, wantVideo });

  const clock = interviewClock({ liveStartedAtMs, durationMin, nowMs: now });

  useEffect(() => {
    void start();
    // Intentionally once: a second call would open a second session, which
    // both doubles quota use and produces two interviewers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  /**
   * Attach the stream once permissions resolve.
   *
   * Keyed on the camera permission rather than done in a ref callback: the
   * element mounts before `getUserMedia` returns, so a stable ref callback
   * fires exactly once, while there is still no stream to attach.
   */
  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    attachPreview(videoRef.current);
  }, [attachPreview, state.media.camera]);

  const [retrying, setRetrying] = useState(false);

  const endedRef = useRef(false);
  async function endInterview() {
    if (endedRef.current) return;
    endedRef.current = true;
    setEnding(true);
    await stop();
    router.push(`/interview/${interviewId}/result`);
  }

  const cameraLive = cameraIsRendering(cameraState);
  const candidateSpeaking = state.phase === "CANDIDATE_SPEAKING";
  const connected = state.connection === "connected";
  const presence = presenceFor(state.phase);
  /**
   * Answers completed, from the reducer's own counter.
   *
   * `turnsCompleted` only increments when an interviewer turn actually
   * finished playing, so it counts exchanges the candidate really had rather
   * than questions that were merely generated.
   */
  const answered = state.turnsCompleted;

  return (
    <div className="flex min-h-[calc(100vh-8rem)] flex-col gap-3">
      {/* Top bar */}
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-xl border bg-card px-4 py-2.5">
        <div className="flex items-center gap-2.5">
          <span className="flex items-center gap-1.5 text-caption font-semibold uppercase tracking-wide">
            <span
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                connected ? "bg-destructive" : "bg-muted-foreground",
                connected && "animate-pulse motion-reduce:animate-none",
              )}
              aria-hidden="true"
            />
            Live interview
          </span>
          <span className="hidden text-xs text-muted-foreground sm:inline">
            {humanizeEnum(interviewType)} · {targetRole}
          </span>
        </div>

        <PhaseStrip
          phase={interview.phase}
          plannedPhases={interview.plannedPhases}
          className="order-3 w-full sm:order-none sm:w-auto"
        />

        <div className="flex items-center gap-3 text-xs">
          <span
            className={cn(
              "flex items-center gap-1.5",
              connected
                ? "text-muted-foreground"
                : state.connection === "reconnecting"
                  ? "text-warning"
                  : "text-muted-foreground",
            )}
            aria-live="polite"
          >
            <span
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                connected ? "bg-success" : "bg-warning",
              )}
              aria-hidden="true"
            />
            {connectionLabel(state.connection)}
          </span>
          {/*
            What the interviewer is doing, in one word.
            Taken from the same `presenceFor` map the presence tile uses, so the
            header and the tile can never disagree — and from the session state
            machine, so neither can disagree with what is actually happening.
          */}
          <span
            className={cn(
              "flex items-center gap-1.5 font-medium",
              presence.tone === "speaking" && "text-info",
              presence.tone === "listening" && "text-success",
              presence.tone === "thinking" && "text-warning",
              presence.tone === "problem" && "text-destructive",
            )}
            aria-live="polite"
          >
            <span className="sr-only">Interviewer status: </span>
            {presence.label}
          </span>

          {/* Against the plan the candidate chose, not an invented total. */}
          {answered > 0 && (
            <span className="hidden tabular-nums text-muted-foreground sm:inline">
              <span className="sr-only">Progress: </span>
              Q{Math.min(answered + 1, plannedQuestions)} of {plannedQuestions}
            </span>
          )}

          {/* Nothing is shown until the clock has a real anchor — a countdown
              from an unknown start is worse than no countdown. */}
          <span className="tabular-nums text-muted-foreground">
            {!clock.anchored ? (
              <span className="text-muted-foreground/70">--:--</span>
            ) : clock.expired ? (
              <span className="text-warning">Time expired</span>
            ) : (
              <>
                <span className="sr-only">Elapsed </span>
                {formatClock(clock.elapsedMs)}
                {clock.remainingMs !== null && (
                  <span className="hidden sm:inline">
                    <span aria-hidden="true"> · </span>
                    <span className="sr-only">Remaining </span>
                    {formatClock(clock.remainingMs)} left
                  </span>
                )}
              </>
            )}
          </span>
        </div>
      </header>

      {state.error && (
        <Alert variant="destructive">
          <AlertCircle aria-hidden="true" />
          <AlertTitle>The interview could not continue</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center gap-3">
            <span className="text-pretty">{state.error}</span>
            {/* The connect error says "you can retry", so retrying has to be
                possible from here rather than only by reloading the page. */}
            <Button
              size="sm"
              variant="outline"
              disabled={retrying}
              onClick={async () => {
                setRetrying(true);
                try {
                  await retry();
                } finally {
                  setRetrying(false);
                }
              }}
            >
              {retrying ? "Reconnecting…" : "Try again"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => router.push(`/interview/${interviewId}`)}
            >
              Continue in chat
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Recoverable, so a notice rather than an error. */}
      {state.deviceNotice && !state.error && (
        <Alert>
          <Unplug aria-hidden="true" />
          <AlertTitle>Device disconnected</AlertTitle>
          <AlertDescription>{state.deviceNotice}</AlertDescription>
        </Alert>
      )}

      {/* Stage: two people, and nothing competing with them. */}
      <div className="flex min-h-0 flex-1 flex-col gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <div className="grid gap-3 md:grid-cols-2">
            <InterviewerPresence
              phase={state.phase}
              interviewerName={interviewerName}
              interviewerTitle={interviewerTitle}
              contextLine={`${humanizeEnum(interviewType)} · ${targetRole}`}
              getOutputLevel={outputLevel}
            />

            {/* Candidate */}
            <div className="relative min-h-[260px] overflow-hidden rounded-xl border bg-muted/30">
              <video
                ref={videoRef}
                playsInline
                muted
                // Mirrored, because an unmirrored self-view is disorienting.
                className={cn(
                  "h-full w-full -scale-x-100 object-cover",
                  !cameraLive && "hidden",
                )}
                aria-label="Your camera"
              />
              {!cameraLive && (
                <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
                  <CameraOff
                    className="h-8 w-8 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <p className="text-sm font-medium">
                    {CAMERA_STATUS_LABEL[cameraState]}
                  </p>
                  <p className="max-w-xs text-pretty text-xs text-muted-foreground">
                    {CAMERA_STATUS_DETAIL[cameraState]}
                  </p>
                </div>
              )}

              {/* Name plate. Bottom-left, clear of the face. */}
              <div className="absolute bottom-2 left-2 flex items-center gap-1.5 rounded-md bg-background/75 px-2 py-1 text-xs backdrop-blur">
                <span
                  className={cn(
                    "h-1.5 w-1.5 rounded-full",
                    candidateSpeaking ? "bg-success" : "bg-muted-foreground/60",
                  )}
                  aria-hidden="true"
                />
                <span className="font-medium">You</span>
                {state.media.micMuted && (
                  <MicOff
                    className="h-3 w-3 text-destructive"
                    aria-label="Microphone muted"
                  />
                )}
              </div>

              {/* Only while the detector says the candidate holds the floor. */}
              {candidateSpeaking && (
                <div
                  className="absolute bottom-2 right-2 flex items-center gap-1.5 rounded-md bg-success/15 px-2 py-1 text-xs font-medium text-success backdrop-blur"
                  aria-live="polite"
                >
                  <Mic className="h-3 w-3" aria-hidden="true" />
                  You&rsquo;re speaking
                </div>
              )}
            </div>
          </div>

          {/* Captions: the interviewer's question only, and only on request. */}
          {captionsOn && (
            <CurrentQuestion
              question={interview.question}
              isFollowUp={interview.isFollowUp}
              topic={interview.topic}
              dimmed={candidateSpeaking}
            />
          )}
        </div>
      </div>

      {/* Controls */}
      <div className="sticky bottom-0 flex flex-wrap items-center justify-center gap-2 rounded-xl border bg-card/95 p-2.5 backdrop-blur">
        <Button
          variant={state.media.micMuted ? "destructive" : "outline"}
          size="sm"
          onClick={() => toggleMic(!state.media.micMuted)}
          aria-pressed={state.media.micMuted}
          aria-label={state.media.micMuted ? "Unmute microphone" : "Mute microphone"}
        >
          {state.media.micMuted ? (
            <MicOff className="h-4 w-4" aria-hidden="true" />
          ) : (
            <Mic className="h-4 w-4" aria-hidden="true" />
          )}
          <span className="hidden sm:inline">
            {state.media.micMuted ? "Unmute" : "Mute"}
          </span>
        </Button>

        {/* Labelled with the ACTION, consistently. The panel above states what
            the camera IS; these must never be the same string or they read as
            contradicting each other. */}
        <Button
          variant="outline"
          size="sm"
          disabled={!cameraToggleEnabled(cameraState)}
          onClick={() => toggleCamera(cameraState === "CAMERA_ON")}
          aria-pressed={cameraState === "CAMERA_OFF"}
          aria-label={cameraActionLabel(cameraState)}
        >
          {cameraState === "CAMERA_ON" ? (
            <Camera className="h-4 w-4" aria-hidden="true" />
          ) : (
            <CameraOff className="h-4 w-4" aria-hidden="true" />
          )}
          <span className="hidden sm:inline">{cameraActionLabel(cameraState)}</span>
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            const next = !speakerMuted;
            setSpeakerMuted(next);
            toggleSpeaker(next);
          }}
          aria-pressed={speakerMuted}
          aria-label={speakerMuted ? "Unmute interviewer" : "Mute interviewer"}
        >
          {speakerMuted ? (
            <VolumeX className="h-4 w-4" aria-hidden="true" />
          ) : (
            <Volume2 className="h-4 w-4" aria-hidden="true" />
          )}
          <span className="hidden sm:inline">
            {speakerMuted ? "Sound off" : "Sound"}
          </span>
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" aria-label="More options">
              <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="center" className="w-60">
            <DropdownMenuLabel>Devices</DropdownMenuLabel>
            <DeviceRow
              label="Camera"
              ok={cameraState === "CAMERA_ON"}
              detail={CAMERA_STATUS_LABEL[cameraState]}
            />
            <DeviceRow
              label="Microphone"
              ok={state.media.microphone === "granted" && !state.media.micMuted}
              detail={
                state.media.microphone !== "granted"
                  ? "Not available"
                  : state.media.micMuted
                    ? "Muted"
                    : "Working"
              }
            />
            <DeviceRow label="Speaker" ok={!speakerMuted} detail={speakerMuted ? "Muted" : "Working"} />
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => setCaptionsOn((value) => !value)}>
              <Captions aria-hidden="true" />
              {captionsOn ? "Turn captions off" : "Turn captions on"}
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => router.push(`/interview/${interviewId}/check`)}
            >
              <Settings2 aria-hidden="true" />
              Device settings
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Separated from the everyday controls so it is not hit by accident. */}
        <span className="mx-1 hidden h-6 w-px bg-border sm:block" aria-hidden="true" />

        <Button
          variant="destructive"
          size="sm"
          onClick={() => setEndOpen(true)}
          disabled={ending}
        >
          <PhoneOff className="h-4 w-4" aria-hidden="true" />
          <span className="hidden sm:inline">End interview</span>
        </Button>
      </div>

      <Dialog open={endOpen} onOpenChange={setEndOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>End this interview?</DialogTitle>
            <DialogDescription>
              Your transcript and delivery measurements are saved and analysed.
              The camera and microphone are released immediately. This cannot be
              resumed.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEndOpen(false)}
              disabled={ending}
            >
              Keep going
            </Button>
            <Button
              variant="destructive"
              onClick={() => void endInterview()}
              disabled={ending}
            >
              {ending && (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              )}
              End and get my report
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Device state in plain words — no browser API names. */
function DeviceRow({
  label,
  ok,
  detail,
}: {
  label: string;
  ok: boolean;
  detail: string;
}) {
  return (
    <div className="flex items-center justify-between px-2 py-1.5 text-sm">
      <span>{label}</span>
      <span
        className={cn(
          "flex items-center gap-1.5 text-xs",
          ok ? "text-success" : "text-muted-foreground",
        )}
      >
        <span aria-hidden="true">{ok ? "✓" : "⚠"}</span>
        {detail}
      </span>
    </div>
  );
}
