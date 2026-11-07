"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { AttentionConsent } from "@/components/interview/live/attention-consent";
import {
  attentionConsent,
  attentionTrackingEnabled,
  setAttentionConsent,
} from "@/lib/interviews/attention-flag";
import {
  AlertTriangle,
  Camera,
  CameraOff,
  Check,
  Info,
  Loader2,
  Minus,
  ShieldCheck,
  Volume2,
  X,
} from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageHeader } from "@/components/shared/page-header";
import { useDeviceCheck } from "@/hooks/use-device-check";
import {
  CHECK_LABEL,
  blockingReason,
  canJoin,
  deviceLabel,
  videoEnabled,
  type CheckStatus,
  type DeviceCheckId,
  type DeviceCheckResult,
} from "@/lib/devices/checks";
import { cn, humanizeEnum } from "@/lib/utils";

/**
 * Device and environment check.
 *
 * The gate between configuring a mock interview and joining one. Every row
 * shows what was actually observed — frames received, input heard, a service
 * that answered — and says plainly when the browser could not verify
 * something, rather than showing a tick because a device merely exists.
 *
 * It also carries the consent copy. The candidate reads what is captured and
 * what is kept before any device opens, not after.
 */
export function DeviceCheck({
  interviewId,
  persona,
  interviewType,
  targetRole,
  durationMin,
  difficulty,
  plannedQuestions,
}: {
  interviewId: string;
  persona: string;
  interviewType: string;
  targetRole: string;
  durationMin: number;
  difficulty: string;
  plannedQuestions: number;
}) {
  const router = useRouter();
  /**
   * The candidate's attention-tracking choice, null until they pick.
   *
   * Read from session storage on mount rather than during render, because
   * `sessionStorage` is unavailable on the server and reading it in a render
   * would differ between the server and client passes.
   */
  const [attentionChoice, setAttentionChoice] = useState<boolean | null>(null);
  useEffect(() => {
    setAttentionChoice(attentionConsent());
  }, []);
  const {
    state,
    attachPreview,
    openDevices,
    selectCamera,
    selectMicrophone,
    selectSpeaker,
    testSpeaker,
    confirmSpeaker,
    testConnection,
    checkDisplays,
    releaseStream,
  } = useDeviceCheck(interviewId);

  // The service check needs no permission, so it runs immediately — a
  // deployment without voice should say so before asking for a camera.
  useEffect(() => {
    void testConnection();
  }, [testConnection]);

  const ready = canJoin(state.results);
  const blocked = blockingReason(state.results);
  const result = (id: DeviceCheckId) =>
    state.results.find((entry) => entry.id === id) as DeviceCheckResult;

  const cameraResult = result("camera");
  const micResult = result("microphone");
  const speakerResult = result("speaker");

  return (
    <>
      <PageHeader
        title="Device & environment check"
        description="A real interview starts badly if your microphone does not work. This checks before you join, not after."
        actions={
          <div className="flex flex-wrap gap-1.5">
            <Badge variant="secondary">{humanizeEnum(interviewType)}</Badge>
            <Badge variant="outline">{humanizeEnum(persona)}</Badge>
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        {/* Preview + join */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Camera preview</CardTitle>
              <CardDescription>
                Mirrored, so it reads the way a mirror does — the interviewer
                sees you the other way round.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="overflow-hidden rounded-lg border bg-muted/30">
                {/* One element, hidden rather than unmounted. Swapping it out
                    while the camera is still proving itself would detach the
                    stream mid-check and stop the frame counter — which is the
                    very thing deciding whether the camera works. */}
                <video
                  ref={attachPreview}
                  playsInline
                  muted
                  className={cn(
                    "h-[260px] w-full -scale-x-100 object-cover",
                    cameraResult.status !== "READY" && "hidden",
                  )}
                  aria-label="Camera preview"
                />
                {cameraResult.status !== "READY" && (
                  <div className="flex h-[260px] flex-col items-center justify-center gap-2 p-6 text-center">
                    <CameraOff
                      className="h-8 w-8 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <p className="text-sm font-medium">
                      {state.started ? cameraResult.detail : "Camera not opened yet"}
                    </p>
                    <p className="max-w-xs text-xs text-muted-foreground">
                      {state.started
                        ? (cameraResult.recovery ??
                          "The interview can run audio-only.")
                        : "Start the check to see yourself and confirm the camera works."}
                    </p>
                  </div>
                )}
              </div>

              {!state.started ? (
                <Button className="w-full" onClick={() => void openDevices()}>
                  <Camera aria-hidden="true" />
                  Start device check
                </Button>
              ) : (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => void openDevices()}
                >
                  Re-run camera & microphone check
                </Button>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">This interview</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5 text-sm">
              <Row label="Role" value={targetRole} />
              <Row label="Interview" value={humanizeEnum(interviewType)} />
              <Row label="Duration" value={`${durationMin} minutes`} />
              <Row label="Interviewer" value={humanizeEnum(persona)} />
              <Row label="Difficulty" value={humanizeEnum(difficulty)} />
              <Row label="Questions planned" value={String(plannedQuestions)} />
            </CardContent>
          </Card>
        </div>

        {/* Checks */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Checks</CardTitle>
              <CardDescription>
                A tick means we observed it working, not that a device exists.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Microphone */}
              <CheckRow result={micResult} required>
                {micResult.status !== "FAILED" && state.started && (
                  <div className="mt-2 space-y-1.5">
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className={cn(
                          "h-full transition-[width] duration-75",
                          micResult.status === "READY" ? "bg-success" : "bg-warning",
                        )}
                        style={{ width: `${state.level}%` }}
                        role="meter"
                        aria-valuenow={Math.round(state.level)}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-label="Microphone input level"
                      />
                    </div>
                    <DevicePicker
                      label="Microphone"
                      devices={state.microphones}
                      value={state.selectedMicrophone}
                      onChange={selectMicrophone}
                    />
                  </div>
                )}
              </CheckRow>

              {/* Camera */}
              <CheckRow result={cameraResult}>
                {state.cameras.length > 0 && state.started && (
                  <div className="mt-2">
                    <DevicePicker
                      label="Camera"
                      devices={state.cameras}
                      value={state.selectedCamera}
                      onChange={selectCamera}
                    />
                  </div>
                )}
              </CheckRow>

              {/* Speaker */}
              <CheckRow result={speakerResult}>
                <div className="mt-2 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void testSpeaker()}
                      disabled={state.speakerTesting}
                    >
                      {state.speakerTesting ? (
                        <Loader2 className="animate-spin" aria-hidden="true" />
                      ) : (
                        <Volume2 aria-hidden="true" />
                      )}
                      Test speaker
                    </Button>
                    {speakerResult.status === "CHECKING" && (
                      <>
                        <Button size="sm" onClick={() => confirmSpeaker(true)}>
                          I heard it
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => confirmSpeaker(false)}
                        >
                          I heard nothing
                        </Button>
                      </>
                    )}
                  </div>
                  {state.outputSelectionSupported && state.speakers.length > 0 && (
                    <DevicePicker
                      label="Speaker"
                      devices={state.speakers}
                      value={state.selectedSpeaker}
                      onChange={selectSpeaker}
                    />
                  )}
                </div>
              </CheckRow>

              {/* Connection */}
              <CheckRow result={result("connection")} required>
                {result("connection").status === "FAILED" && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => void testConnection()}>
                      Retry
                    </Button>
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/interview/${interviewId}`}>Use chat interview</Link>
                    </Button>
                  </div>
                )}
              </CheckRow>

              {/* Environment */}
              <CheckRow result={result("environment")}>
                {state.screenDetailsSupported && (
                  <div className="mt-2">
                    <Button size="sm" variant="outline" onClick={() => void checkDisplays()}>
                      Check displays
                    </Button>
                  </div>
                )}
              </CheckRow>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                What is captured
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>
                Your microphone audio is streamed to Google Gemini so the
                interviewer can hear and answer you. Your camera, if enabled, is
                sampled a couple of times a second{" "}
                <span className="font-medium text-foreground">
                  inside your own browser
                </span>{" "}
                to measure framing, lighting and whether you are facing the
                camera. Those frames are never uploaded.
              </p>
              <p className="font-medium text-foreground">
                No audio or video recording is stored — not by us, and not
                anywhere else. What is saved to your account is the text
                transcript, the timings, the derived presentation figures, and
                your report.
              </p>
              <p>
                You can mute, turn the camera off, or end the interview at any
                point. Ending it releases both devices immediately.
              </p>
            </CardContent>
          </Card>

          {/*
            Asked before the interview, and only where the feature is enabled.
            No pre-ticked box: tracking stays off until the candidate chooses
            it, and `attentionActive` treats "never asked" as no.
          */}
          {attentionTrackingEnabled() && (
            <AttentionConsent
              decided={attentionChoice}
              onDecide={(enabled) => {
                setAttentionConsent(enabled);
                setAttentionChoice(enabled);
              }}
            />
          )}

          <div className="space-y-3 rounded-lg border bg-card p-4">
            {blocked && (
              <Alert>
                <Info aria-hidden="true" />
                <AlertDescription>{blocked}</AlertDescription>
              </Alert>
            )}
            {ready && cameraResult.status !== "READY" && (
              <Alert>
                <AlertTriangle aria-hidden="true" />
                <AlertDescription>
                  You can join without a camera. The interview runs on voice, but
                  there will be no visual presentation feedback in your report.
                </AlertDescription>
              </Alert>
            )}
            <div className="flex flex-wrap gap-2">
              <Button
                className="flex-1"
                disabled={!ready}
                onClick={() => {
                  // Hand the devices over rather than holding two captures.
                  releaseStream();
                  router.push(
                    `/interview/${interviewId}/room?video=${
                      videoEnabled(state.results) ? "on" : "off"
                    }`,
                  );
                }}
              >
                Join interview
              </Button>
              <Button asChild variant="outline">
                <Link href={`/interview/${interviewId}`}>Use chat instead</Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}

function DevicePicker({
  label,
  devices,
  value,
  onChange,
}: {
  label: string;
  devices: Array<{ deviceId: string; label: string; kind: "videoinput" | "audioinput" | "audiooutput" }>;
  value: string | null;
  onChange: (deviceId: string) => void;
}) {
  if (devices.length <= 1) return null;
  return (
    <Select value={value ?? undefined} onValueChange={onChange}>
      <SelectTrigger className="h-9 text-xs" aria-label={`${label} device`}>
        <SelectValue placeholder={`Select ${label.toLowerCase()}`} />
      </SelectTrigger>
      <SelectContent>
        {devices.map((device, index) => (
          <SelectItem key={device.deviceId || index} value={device.deviceId}>
            {deviceLabel(device, index)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

const STATUS_ICON: Record<CheckStatus, typeof Check> = {
  READY: Check,
  FAILED: X,
  CHECKING: Loader2,
  LIMITED: Info,
  PENDING: Minus,
};

const STATUS_TEXT: Record<CheckStatus, string> = {
  READY: "Ready",
  FAILED: "Not working",
  CHECKING: "Checking",
  LIMITED: "Limited",
  PENDING: "Not checked",
};

/**
 * One check.
 *
 * Status is carried by an icon *and* a word, never colour alone — a red tick
 * and a green tick are the same tick to a candidate who cannot distinguish
 * them, and this screen decides whether someone can start an interview.
 */
function CheckRow({
  result,
  required = false,
  children,
}: {
  result: DeviceCheckResult;
  required?: boolean;
  children?: React.ReactNode;
}) {
  const Icon = STATUS_ICON[result.status];

  return (
    <div className="border-b pb-4 last:border-0 last:pb-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-medium">
            {CHECK_LABEL[result.id]}
            {required && (
              <span className="text-xs font-normal text-muted-foreground">
                (required)
              </span>
            )}
          </p>
          <p className="mt-0.5 text-pretty text-xs text-muted-foreground">
            {result.detail}
          </p>
          {result.recovery && result.status === "FAILED" && (
            <p className="mt-1 text-pretty text-xs text-foreground">{result.recovery}</p>
          )}
        </div>
        <span
          className={cn(
            "flex shrink-0 items-center gap-1.5 text-xs font-medium",
            result.status === "READY" && "text-success",
            result.status === "FAILED" && "text-destructive",
            result.status === "LIMITED" && "text-warning",
            (result.status === "PENDING" || result.status === "CHECKING") &&
              "text-muted-foreground",
          )}
        >
          <Icon
            className={cn("h-4 w-4", result.status === "CHECKING" && "animate-spin")}
            aria-hidden="true"
          />
          {STATUS_TEXT[result.status]}
        </span>
      </div>
      {children}
    </div>
  );
}
