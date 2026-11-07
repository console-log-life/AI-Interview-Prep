import {
  Activity,
  Camera,
  Crop,
  Eye,
  Gauge,
  Hash,
  ListChecks,
  MessageSquare,
  Mic,
  Sun,
  Timer,
  TrendingDown,
  TrendingUp,
} from "lucide-react";

import { EvidenceList } from "@/components/interview/delivery/evidence-list";
import {
  AnswerLengths,
  PaceScale,
} from "@/components/interview/delivery/delivery-charts";
import {
  InsightCard,
  LimitationsNotice,
  MetricCell,
  SignalTile,
  StatTile,
  type SignalTone,
} from "@/components/interview/delivery/delivery-primitives";
import { Badge } from "@/components/ui/badge";
import type { DeliveryView } from "@/lib/interviews/delivery-service";
import { PACE_LABEL } from "@/lib/interviews/speech-metrics";
import {
  ENGAGEMENT_LABEL,
  FRAMING_LABEL,
  LIGHTING_LABEL,
  STABILITY_LABEL,
  type EngagementBand,
  type FramingBand,
  type LightingBand,
  type StabilityBand,
} from "@/lib/interviews/visual";

/**
 * Delivery review: how the candidate came across, as distinct from what they
 * said.
 *
 * Written so that the limitations are as prominent as the findings. A section
 * that reports "camera engagement: mostly consistent" without saying it was
 * derived from landmark geometry over sampled frames invites the candidate to
 * read it as eye tracking, and that would be this feature quietly becoming the
 * thing it was built not to be.
 *
 * Nothing here is an inference about the candidate's state of mind. Pace rose;
 * pauses occurred; the face left the frame. What that meant is theirs to know.
 *
 * There is deliberately **no overall delivery score.** The underlying analysis
 * produces bands and counts, not a scale, and inventing a number to head the
 * section would be exactly the fabricated metric the rest of this code goes to
 * some length to avoid.
 */
export function DeliveryReport({
  delivery,
  answerWordCounts = [],
}: {
  delivery: DeliveryView;
  /**
   * Words per spoken answer, for the answer-length chart.
   *
   * Counted from the answers already shown on this page rather than stored, so
   * no new measurement is introduced. Only used when the count matches the
   * turns the speech analysis saw — otherwise the two disagree about what an
   * "answer" is and the chart would be quietly wrong.
   */
  answerWordCounts?: number[];
}) {
  const { visual, speech } = delivery;
  const hasSpeech = speech.turns > 0;
  const hasVisual = visual.samples > 0;

  if (!hasSpeech && !hasVisual) return null;

  const showAnswerLengths =
    answerWordCounts.length > 0 && answerWordCounts.length === speech.turns;

  return (
    <section aria-labelledby="delivery-heading" className="space-y-5">
      {/* Header */}
      <header className="flex flex-wrap items-end justify-between gap-3 border-b pb-4">
        <div className="space-y-1">
          <h2
            id="delivery-heading"
            className="flex items-center gap-2 text-xl font-semibold tracking-tight"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-info/10">
              <Activity className="h-4 w-4 text-info" aria-hidden="true" />
            </span>
            Delivery
          </h2>
          <p className="text-sm text-muted-foreground">
            How you performed during the interview
          </p>
        </div>
        <p className="max-w-md text-pretty text-xs leading-relaxed text-muted-foreground">
          Measured from your own audio timing and, where the browser supported
          it, from camera frames analysed on your machine.{" "}
          <span className="font-medium text-foreground">
            No recording was kept.
          </span>
        </p>
      </header>

      {/* Summary strip */}
      {hasSpeech && (
        <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile
            icon={Gauge}
            label="Words per minute"
            value={speech.wordsPerMinute === null ? "—" : String(speech.wordsPerMinute)}
            sub={speech.paceBand ? PACE_LABEL[speech.paceBand] : "Not enough speech"}
            index={0}
          />
          <StatTile
            icon={Hash}
            label="Words spoken"
            value={String(speech.words)}
            sub={
              speech.meanAnswerWords === null
                ? undefined
                : `${speech.meanAnswerWords} per answer`
            }
            index={1}
          />
          <StatTile
            icon={MessageSquare}
            label="Answers"
            value={String(speech.turns)}
            sub={
              speech.shortAnswers > 0
                ? `${speech.shortAnswers} under 25 words`
                : "none very short"
            }
            index={2}
          />
          <StatTile
            icon={Timer}
            label="Speaking time"
            value={formatMinutes(speech.totalSpeakingMs)}
            sub={
              delivery.interruptions > 0
                ? `${delivery.interruptions} interruption${delivery.interruptions === 1 ? "" : "s"}`
                : undefined
            }
            index={3}
          />
        </dl>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Speaking behaviour */}
        <article className="space-y-4 rounded-xl border bg-card p-5">
          <div>
            <h3 className="flex items-center gap-2 text-base font-semibold">
              <Mic className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              Speaking behaviour
            </h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              How clearly and effectively you communicated
            </p>
          </div>

          {speech.wordsPerMinute !== null && speech.paceBand && (
            <PaceScale
              wordsPerMinute={speech.wordsPerMinute}
              band={speech.paceBand}
            />
          )}

          <dl className="grid grid-cols-2 gap-2.5">
            <MetricCell
              label="Mean answer"
              value={
                speech.meanAnswerWords === null ? null : String(speech.meanAnswerWords)
              }
              unit="words"
            />
            <MetricCell
              label="Very short answers"
              value={String(speech.shortAnswers)}
              sub="under 25 words"
              tone={speech.shortAnswers > 0 ? "caution" : "positive"}
            />
            <MetricCell
              label="Long pauses"
              value={String(speech.longPauses)}
              sub="mid-answer, over 2s"
              tone={speech.longPauses > 0 ? "caution" : "positive"}
            />
            <MetricCell
              label="Self-corrections"
              value={String(speech.selfCorrections)}
              sub="audible restarts"
              tone={speech.selfCorrections > 0 ? "caution" : "positive"}
            />
          </dl>

          {showAnswerLengths && <AnswerLengths wordCounts={answerWordCounts} />}

          {speech.paceShift && (
            <div className="flex items-start gap-2.5 rounded-md border bg-muted/20 p-3">
              {speech.paceShift.deltaPercent > 0 ? (
                <TrendingUp
                  className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
              ) : (
                <TrendingDown
                  className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
              )}
              <p className="text-xs leading-relaxed">
                <span className="font-medium">Pace across the interview:</span>{" "}
                {speech.paceShift.earlyWpm} wpm early, {speech.paceShift.lateWpm} wpm
                late ({speech.paceShift.deltaPercent > 0 ? "+" : ""}
                {speech.paceShift.deltaPercent}%).
              </p>
            </div>
          )}

          {speech.fillers.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">
                Fillers and hedges
              </p>
              <div className="flex flex-wrap gap-1.5">
                {speech.fillers.map((filler) => (
                  <Badge key={filler.term} variant="outline" className="font-normal">
                    {filler.term}
                    <span className="ml-1 tabular-nums text-muted-foreground">
                      {filler.count}
                    </span>
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {speech.observations.length > 0 && (
            <ul className="space-y-2">
              {speech.observations.map((item, index) => (
                <InsightCard key={item} icon={ListChecks} text={item} index={index} />
              ))}
            </ul>
          )}

          <LimitationsNotice
            title="What this does not tell you"
            items={speech.limitations}
          />
        </article>

        {/* Visual presentation */}
        <article className="space-y-4 rounded-xl border bg-card p-5">
          <div>
            <h3 className="flex items-center gap-2 text-base font-semibold">
              <Eye className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              Visual presentation
            </h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Camera and presentation signals detected during your interview
            </p>
          </div>

          {hasVisual ? (
            <>
              <dl className="grid grid-cols-2 gap-2.5">
                <MetricCell
                  label="Frames analysed"
                  value={visual.samples.toLocaleString()}
                />
                <MetricCell
                  label="Analysis window"
                  value={formatMinutes(visual.durationMs)}
                />
              </dl>

              <div className="grid grid-cols-2 gap-2.5">
                <SignalTile
                  icon={Camera}
                  label="Camera engagement"
                  value={
                    visual.engagementBand
                      ? ENGAGEMENT_LABEL[visual.engagementBand]
                      : null
                  }
                  note={
                    visual.engagementBand
                      ? visual.faceVisibleRatio === null
                        ? undefined
                        : `face in frame ${Math.round(visual.faceVisibleRatio * 100)}%`
                      : "Browser limitation"
                  }
                  tone={engagementTone(visual.engagementBand)}
                  index={0}
                />
                <SignalTile
                  icon={Crop}
                  label="Framing"
                  value={visual.framingBand ? FRAMING_LABEL[visual.framingBand] : null}
                  note={visual.framingBand ? undefined : "Browser limitation"}
                  tone={framingTone(visual.framingBand)}
                  index={1}
                />
                <SignalTile
                  icon={Sun}
                  label="Lighting"
                  value={visual.lightingBand ? LIGHTING_LABEL[visual.lightingBand] : null}
                  note={visual.lightingBand ? undefined : "Browser limitation"}
                  tone={lightingTone(visual.lightingBand)}
                  index={2}
                />
                <SignalTile
                  icon={Activity}
                  label="Image stability"
                  value={
                    visual.stabilityBand ? STABILITY_LABEL[visual.stabilityBand] : null
                  }
                  note={visual.stabilityBand ? undefined : "Browser limitation"}
                  tone={stabilityTone(visual.stabilityBand)}
                  index={3}
                />
              </div>

              {visual.observations.length > 0 && (
                <ul className="space-y-2">
                  {visual.observations.map((item, index) => (
                    <InsightCard key={item} icon={Eye} text={item} index={index} />
                  ))}
                </ul>
              )}
            </>
          ) : (
            <p className="rounded-md border border-dashed bg-muted/20 p-4 text-sm text-muted-foreground">
              Your camera was off for this interview, so there is no visual
              analysis.
            </p>
          )}

          <LimitationsNotice
            title="Measurement limitations"
            items={visual.limitations}
          />
        </article>
      </div>

      {/* Traceability: what was observed, and the exchange it came from. */}
      <EvidenceList evidence={delivery.evidence} />
    </section>
  );
}

/**
 * Band → tone.
 *
 * Nothing maps to a destructive state. These are presentation signals about a
 * webcam, and colouring "off-centre" the same red as a failed payment would
 * misrepresent how much any of it matters. `null` is always the neutral
 * unavailable state, never a bad one.
 */
function engagementTone(band: EngagementBand | null): SignalTone {
  if (band === null) return "unavailable";
  return band === "CONSISTENT" || band === "MOSTLY_CONSISTENT"
    ? "positive"
    : "caution";
}

function framingTone(band: FramingBand | null): SignalTone {
  if (band === null) return "unavailable";
  return band === "WELL_FRAMED" ? "positive" : "caution";
}

function lightingTone(band: LightingBand | null): SignalTone {
  if (band === null) return "unavailable";
  return band === "GOOD" ? "positive" : "caution";
}

function stabilityTone(band: StabilityBand | null): SignalTone {
  if (band === null) return "unavailable";
  if (band === "STEADY") return "positive";
  return band === "UNSTABLE" ? "caution" : "neutral";
}

function formatMinutes(ms: number): string {
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, "0")}s`;
}
