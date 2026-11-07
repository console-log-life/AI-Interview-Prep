"use client";

import { useState } from "react";
import {
  AlertCircle,
  Check,
  Loader2,
  MessageSquareQuote,
  Mic,
  X,
} from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";
import { ScoreBar } from "@/components/shared/score-bar";
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
import { apiPost, errorMessage } from "@/lib/api/client";
import {
  DIMENSION_LABEL,
  STAR_LABEL,
  STAR_PARTS,
  summarizeCommunication,
  type CommunicationDimension,
} from "@/lib/communication/aggregate";
import type { CommunicationRowView } from "@/lib/communication/service";
import { cn } from "@/lib/utils";

type PendingAnswer = {
  evaluationId: string;
  questionText: string;
  topic: string | null;
  score: number;
};

type CommunicationCoachProps = {
  interviewId: string;
  initialRows: CommunicationRowView[];
  initialPending: PendingAnswer[];
  /** False when no AI key is configured. */
  aiEnabled: boolean;
};

/**
 * Per-answer communication coaching.
 *
 * Coaching is requested one answer at a time rather than generated for the
 * whole interview up front — most of the value is in the two or three answers
 * the candidate already knows were shaky, and charging for the rest would be
 * waste. The aggregate recomputes client-side from the rows actually analysed,
 * using the same pure function the server uses.
 */
export function CommunicationCoach({
  interviewId,
  initialRows,
  initialPending,
  aiEnabled,
}: CommunicationCoachProps) {
  const [rows, setRows] = useState(initialRows);
  const [pending, setPending] = useState(initialPending);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const summary = summarizeCommunication(rows);

  async function analyse(evaluationId: string) {
    setBusyId(evaluationId);
    setError(null);
    try {
      const analysis = await apiPost<CommunicationRowView>(
        `/api/interviews/${interviewId}/communication`,
        { evaluationId },
      );
      setRows((current) => [...current, analysis]);
      setPending((current) =>
        current.filter((answer) => answer.evaluationId !== evaluationId),
      );
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Card className="rounded-2xl border-border/70">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mic className="h-5 w-5" aria-hidden="true" />
          Communication coaching
        </CardTitle>
        <CardDescription>
          How you said it, separately from whether it was right. Coaching is
          per-answer, so you only spend it where you want it.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {!aiEnabled && (
          <Alert>
            <AlertCircle aria-hidden="true" />
            <AlertDescription>
              Communication coaching needs an Anthropic API key. The rest of
              this report is stored data and works without one.
            </AlertDescription>
          </Alert>
        )}

        {error && (
          <Alert variant="destructive">
            <AlertCircle aria-hidden="true" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {summary.analysed === 0 ? (
          <EmptyState
            icon={MessageSquareQuote}
            title="No answers coached yet"
            description="Pick an answer below and we'll look at clarity, structure, conciseness and — for behavioural answers — whether it followed STAR."
          />
        ) : (
          <>
            <section aria-labelledby="comm-summary">
              <h3 id="comm-summary" className="mb-3 text-sm font-medium">
                Across {summary.analysed} coached answer
                {summary.analysed === 1 ? "" : "s"}
              </h3>
              <div className="space-y-3">
                {(
                  Object.keys(DIMENSION_LABEL) as CommunicationDimension[]
                ).map((dimension) => {
                  const mean = summary.means[dimension];
                  if (mean === null) return null;
                  return (
                    <ScoreBar
                      key={dimension}
                      label={DIMENSION_LABEL[dimension]}
                      score={mean * 10}
                      detail={`${mean}/10${
                        summary.weakest === dimension ? " · weakest area" : ""
                      }`}
                    />
                  );
                })}
              </div>
            </section>

            {summary.starCoverage ? (
              <section aria-labelledby="comm-star">
                <h3 id="comm-star" className="mb-2 text-sm font-medium">
                  STAR coverage
                  <span className="ml-1.5 font-normal text-muted-foreground">
                    across {summary.behaviouralCount} behavioural answer
                    {summary.behaviouralCount === 1 ? "" : "s"}
                  </span>
                </h3>
                <div className="flex flex-wrap gap-2">
                  {STAR_PARTS.map((part) => {
                    const coverage = summary.starCoverage?.[part] ?? 0;
                    const strong = coverage >= 0.5;
                    return (
                      <Badge
                        key={part}
                        variant="outline"
                        className={cn(
                          strong
                            ? "border-success/40 bg-success/10 text-success"
                            : "border-destructive/30 bg-destructive/10 text-destructive",
                        )}
                      >
                        {strong ? (
                          <Check className="h-3 w-3" aria-hidden="true" />
                        ) : (
                          <X className="h-3 w-3" aria-hidden="true" />
                        )}
                        {STAR_LABEL[part]} {Math.round(coverage * 100)}%
                      </Badge>
                    );
                  })}
                </div>
                {summary.starGaps.length > 0 && (
                  <p className="mt-2 text-pretty text-sm text-muted-foreground">
                    Most often missing:{" "}
                    <span className="font-medium text-foreground">
                      {summary.starGaps
                        .map((part) => STAR_LABEL[part])
                        .join(", ")}
                    </span>
                    . Naming the outcome is what turns a story into evidence.
                  </p>
                )}
              </section>
            ) : (
              <p className="text-sm text-muted-foreground">
                No behavioural answers coached yet, so STAR coverage is not
                reported — it would be meaningless for a technical answer.
              </p>
            )}

            <section aria-labelledby="comm-detail" className="space-y-3">
              <h3 id="comm-detail" className="text-sm font-medium">
                Per-answer coaching
              </h3>
              {rows.map((row) => (
                <article
                  key={row.evaluationId}
                  className="rounded-lg border p-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className="min-w-0 text-pretty text-sm font-medium">
                      {row.questionText}
                    </p>
                    {row.isBehavioural && (
                      <Badge variant="secondary" className="shrink-0">
                        Behavioural
                      </Badge>
                    )}
                  </div>

                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {(
                      Object.keys(DIMENSION_LABEL) as CommunicationDimension[]
                    ).map((dimension) => (
                      <Badge key={dimension} variant="outline">
                        {DIMENSION_LABEL[dimension]} {row[dimension]}/10
                      </Badge>
                    ))}
                  </div>

                  {row.observations.length > 0 && (
                    <ul className="mt-2 list-inside list-disc space-y-1">
                      {row.observations.map((observation) => (
                        <li
                          key={observation}
                          className="text-pretty text-sm text-muted-foreground"
                        >
                          {observation}
                        </li>
                      ))}
                    </ul>
                  )}

                  {row.coaching && (
                    <p className="mt-2 text-pretty text-sm">{row.coaching}</p>
                  )}
                </article>
              ))}
            </section>
          </>
        )}

        {pending.length > 0 && (
          <section aria-labelledby="comm-pending" className="border-t pt-4">
            <h3 id="comm-pending" className="mb-3 text-sm font-medium">
              Coach another answer
            </h3>
            <ul className="space-y-2">
              {pending.map((answer) => (
                <li
                  key={answer.evaluationId}
                  className="flex items-center justify-between gap-3 rounded-lg border p-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm">{answer.questionText}</p>
                    <p className="text-xs text-muted-foreground">
                      {answer.topic ?? "General"} · scored {answer.score}/10
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0"
                    disabled={!aiEnabled || busyId !== null}
                    onClick={() => void analyse(answer.evaluationId)}
                  >
                    {busyId === answer.evaluationId ? (
                      <Loader2
                        className="h-4 w-4 animate-spin"
                        aria-hidden="true"
                      />
                    ) : (
                      <MessageSquareQuote
                        className="h-4 w-4"
                        aria-hidden="true"
                      />
                    )}
                    Coach this
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </CardContent>
    </Card>
  );
}
