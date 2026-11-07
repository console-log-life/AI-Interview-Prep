"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, Loader2, Mic, Square } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { errorMessage } from "@/lib/api/client";
import type { paceAssessment, SpeechMetrics } from "@/lib/voice/metrics";

/**
 * Mirrors `POST /api/voice/transcribe`. `pace` is derived from the server's
 * own `paceAssessment` return type so the two cannot drift apart — it is null
 * whenever words-per-minute could not be measured.
 */
type TranscribeResponse = {
  transcript: string;
  confidence: number | null;
  metrics: SpeechMetrics;
  pace: ReturnType<typeof paceAssessment>;
  provider: string;
};

const PACE_LABEL = {
  slow: "Slower than typical",
  comfortable: "Comfortable pace",
  fast: "Faster than typical",
} as const;

type VoiceAnswerProps = {
  /** False when no STT provider is configured — the control is not rendered. */
  enabled: boolean;
  disabled: boolean;
  /** Receives the transcript so the parent can drop it into the answer box. */
  onTranscript: (text: string, metrics: SpeechMetrics) => void;
};

/**
 * Microphone answer capture.
 *
 * The recorded audio goes to the server, which calls the configured STT
 * provider. If none is configured this component is not rendered at all —
 * there is no local fallback that invents a transcript.
 */
export function VoiceAnswer({
  enabled,
  disabled,
  onTranscript,
}: VoiceAnswerProps) {
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TranscribeResponse | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // Release the microphone if the component unmounts mid-recording.
  useEffect(() => {
    return () => {
      stopTimer();
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== "inactive") recorder.stop();
      recorder?.stream.getTracks().forEach((track) => track.stop());
    };
  }, [stopTimer]);

  async function transcribe(blob: Blob) {
    setTranscribing(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("audio", blob, "answer.webm");

      const response = await fetch("/api/voice/transcribe", {
        method: "POST",
        body: formData,
      });
      const payload = (await response.json()) as
        | { ok: true; data: TranscribeResponse }
        | { ok: false; error: { message: string } };

      if (!payload.ok) throw new Error(payload.error.message);

      setResult(payload.data);
      onTranscript(payload.data.transcript, payload.data.metrics);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setTranscribing(false);
    }
  }

  async function start() {
    setError(null);
    setResult(null);

    if (typeof MediaRecorder === "undefined") {
      setError("This browser cannot record audio. Type your answer instead.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        });
        void transcribe(blob);
      };

      recorder.start();
      recorderRef.current = recorder;
      setRecording(true);
      setSeconds(0);
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    } catch {
      setError(
        "Microphone access was denied. Allow it in your browser, or type your answer.",
      );
    }
  }

  function stop() {
    stopTimer();
    setRecording(false);
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") recorder.stop();
  }

  if (!enabled) return null;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant={recording ? "destructive" : "outline"}
          size="sm"
          disabled={disabled || transcribing}
          onClick={() => (recording ? stop() : void start())}
        >
          {transcribing ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : recording ? (
            <Square className="h-4 w-4" aria-hidden="true" />
          ) : (
            <Mic className="h-4 w-4" aria-hidden="true" />
          )}
          {transcribing
            ? "Transcribing…"
            : recording
              ? `Stop (${formatDuration(seconds)})`
              : "Answer by voice"}
        </Button>

        {recording && (
          <span
            className="flex items-center gap-1.5 text-xs text-destructive"
            role="status"
          >
            <span className="h-2 w-2 animate-pulse rounded-full bg-destructive" />
            Recording
          </span>
        )}
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle aria-hidden="true" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {result && (
        <div className="rounded-lg border p-3">
          <div className="flex flex-wrap items-center gap-2">
            {result.pace && (
              <Badge variant="secondary">{PACE_LABEL[result.pace.band]}</Badge>
            )}
            {result.metrics.wordsPerMinute !== null && (
              <Badge variant="outline">
                {result.metrics.wordsPerMinute} wpm
              </Badge>
            )}
            <Badge variant="outline">
              {result.metrics.fillerCount} filler
              {result.metrics.fillerCount === 1 ? "" : "s"}
            </Badge>
            {result.metrics.longestPauseSec !== null && (
              <Badge variant="outline">
                longest pause {result.metrics.longestPauseSec.toFixed(1)}s
              </Badge>
            )}
          </div>

          <p className="mt-2 text-pretty text-xs text-muted-foreground">
            {result.pace ? `${result.pace.note} ` : ""}Transcribed by{" "}
            {result.provider}. Edit the text before sending if anything was
            misheard.
          </p>

          {result.metrics.unavailable.length > 0 && (
            <p className="mt-1.5 text-xs text-muted-foreground">
              Not measured: {result.metrics.unavailable.join("; ")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function formatDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
