"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  CalendarClock,
  CheckCircle2,
  Loader2,
  Repeat,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { EmptyState } from "@/components/shared/empty-state";
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
import { apiDelete, apiPatch, errorMessage } from "@/lib/api/client";
import {
  QUALITY_LABEL,
  type ReviewQuality,
} from "@/lib/practice/scheduling";
import type { ReviewItemView } from "@/lib/practice/service";
import { cn } from "@/lib/utils";

const QUALITY_ORDER: ReviewQuality[] = ["AGAIN", "HARD", "GOOD", "EASY"];

const QUALITY_STYLE: Record<ReviewQuality, string> = {
  AGAIN: "border-destructive/40 text-destructive hover:bg-destructive/10",
  HARD: "border-warning/50 text-warning-foreground hover:bg-warning/10",
  GOOD: "border-success/40 text-success hover:bg-success/10",
  EASY: "border-primary/40 text-primary hover:bg-primary/10",
};

/**
 * The spaced-repetition queue.
 *
 * Grading is explicitly the candidate's own judgement of their recall, and is
 * labelled as such — it schedules the next review, and is never mixed into
 * the measured skill scores, which only ever come from graded answers.
 */
export function ReviewQueue({
  due: initialDue,
  upcoming,
  totalActive,
  dueTotal,
  /** Set on the dashboard, where only the first few items are shown. */
  moreHref,
}: {
  due: ReviewItemView[];
  upcoming: ReviewItemView[];
  totalActive: number;
  dueTotal: number;
  moreHref?: string;
}) {
  const router = useRouter();
  const [due, setDue] = useState(initialDue);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reviewed, setReviewed] = useState(0);

  async function grade(item: ReviewItemView, quality: ReviewQuality) {
    setBusyId(item.id);
    setError(null);
    try {
      const updated = await apiPatch<ReviewItemView>(
        `/api/practice/reviews/${item.id}`,
        { quality },
      );
      setDue((current) => current.filter((row) => row.id !== item.id));
      setReviewed((count) => count + 1);
      toast.success(
        `Back in ${updated.intervalDays} day${updated.intervalDays === 1 ? "" : "s"}.`,
      );
      router.refresh();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusyId(null);
    }
  }

  async function retire(item: ReviewItemView) {
    setBusyId(item.id);
    setError(null);
    try {
      await apiDelete(`/api/practice/reviews/${item.id}`);
      setDue((current) => current.filter((row) => row.id !== item.id));
      toast.success("Removed from your review queue.");
      router.refresh();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Card className="rounded-2xl border-border/70">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <CalendarClock className="h-5 w-5" aria-hidden="true" />
              Due for review
            </CardTitle>
            <CardDescription>
              Concepts you have got wrong before, resurfaced on a spacing
              schedule so they stop coming back.
            </CardDescription>
          </div>
          {totalActive > 0 && (
            <Badge variant="secondary" className="shrink-0 tabular-nums">
              {dueTotal} due · {totalActive} tracked
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {error && (
          <Alert variant="destructive">
            <AlertCircle aria-hidden="true" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {due.length === 0 ? (
          reviewed > 0 ? (
            <p className="flex items-center gap-2 rounded-md bg-success/10 px-3 py-3 text-sm text-success">
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              Review session done — {reviewed} concept
              {reviewed === 1 ? "" : "s"} rescheduled.
            </p>
          ) : totalActive === 0 ? (
            <EmptyState
              icon={CheckCircle2}
              title="Nothing to review"
              description="Concepts join this queue automatically once a mistake has recurred or a skill is measured weak with enough evidence. Nothing is added speculatively."
            />
          ) : (
            <EmptyState
              icon={CheckCircle2}
              title="All caught up"
              description="Nothing is due right now. The next items are listed below."
            />
          )
        ) : (
          <ul className="space-y-3">
            {due.map((item) => (
              <li key={item.id} className="rounded-lg border p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-pretty text-sm font-medium">
                      {item.label}
                    </p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                      <span>
                        {item.kind === "MISTAKE"
                          ? "Repeated mistake"
                          : "Weak skill"}
                      </span>
                      {item.lapses > 0 && (
                        <span className="flex items-center gap-1 text-destructive">
                          <Repeat className="h-3 w-3" aria-hidden="true" />
                          forgotten {item.lapses}×
                        </span>
                      )}
                      {item.daysOverdue > 0 && (
                        <span>{item.daysOverdue}d overdue</span>
                      )}
                      {item.reviewCount > 0 && (
                        <span>{item.reviewCount} reviews so far</span>
                      )}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-1">
                    <Button asChild variant="ghost" size="sm">
                      <Link href={item.actionUrl}>Practise</Link>
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      disabled={busyId === item.id}
                      onClick={() => void retire(item)}
                      aria-label={`Stop reviewing "${item.label}"`}
                    >
                      <X className="h-3.5 w-3.5" aria-hidden="true" />
                    </Button>
                  </div>
                </div>

                <div className="mt-3">
                  <p className="mb-1.5 text-xs text-muted-foreground">
                    How well could you explain this right now?
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {QUALITY_ORDER.map((quality) => (
                      <Button
                        key={quality}
                        variant="outline"
                        size="sm"
                        className={cn(QUALITY_STYLE[quality])}
                        disabled={busyId !== null}
                        onClick={() => void grade(item, quality)}
                      >
                        {busyId === item.id ? (
                          <Loader2
                            className="h-3.5 w-3.5 animate-spin"
                            aria-hidden="true"
                          />
                        ) : null}
                        {QUALITY_LABEL[quality]}
                        <span className="ml-1 text-xs opacity-70">
                          {item.intervals[quality]}d
                        </span>
                      </Button>
                    ))}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}

        {moreHref && dueTotal > due.length && (
          <Button asChild variant="outline" size="sm" className="w-full">
            <Link href={moreHref}>
              Review all {dueTotal} due concepts
            </Link>
          </Button>
        )}

        {upcoming.length > 0 && (
          <section aria-labelledby="review-upcoming" className="border-t pt-4">
            <h3
              id="review-upcoming"
              className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground"
            >
              Coming up
            </h3>
            <ul className="space-y-1.5">
              {upcoming.map((item) => (
                <li
                  key={item.id}
                  className="flex items-center justify-between gap-3 text-sm"
                >
                  <span className="min-w-0 truncate text-muted-foreground">
                    {item.label}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {formatDue(item.dueAt)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <p className="border-t pt-3 text-xs text-muted-foreground">
          Your grade here schedules the next review. It is your own assessment
          of recall and is kept separate from your skill scores, which only
          ever come from graded answers.
        </p>
      </CardContent>
    </Card>
  );
}

function formatDue(iso: string): string {
  const days = Math.ceil(
    (new Date(iso).getTime() - Date.now()) / 86_400_000,
  );
  if (days <= 1) return "tomorrow";
  return `in ${days} days`;
}
