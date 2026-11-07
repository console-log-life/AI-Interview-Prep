"use client";

import { useState } from "react";
import { AlertCircle, History, Loader2 } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { apiGet, errorMessage } from "@/lib/api/client";
import type { MistakeTimeline as Timeline } from "@/lib/mistakes/service";
import { cn, humanizeEnum } from "@/lib/utils";

const STATUS_STYLE: Record<Timeline["status"], string> = {
  ACTIVE: "border-destructive/30 bg-destructive/10 text-destructive",
  IMPROVING: "border-warning/40 bg-warning/10 text-warning-foreground",
  RESOLVED: "border-success/40 bg-success/10 text-success",
};

/**
 * The history behind a single mistake.
 *
 * Loaded on demand rather than with the page: most users open at most one, and
 * eagerly fetching fifty occurrence lists for a full ledger would be waste.
 */
export function MistakeTimelineDialog({
  mistakeId,
  label,
}: {
  mistakeId: string;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const [timeline, setTimeline] = useState<Timeline | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setOpen(true);
    if (timeline || loading) return;

    setLoading(true);
    setError(null);
    try {
      setTimeline(await apiGet<Timeline>(`/api/mistakes/${mistakeId}`));
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => void load()}
        aria-label={`View the history of "${label}"`}
      >
        <History className="h-3.5 w-3.5" aria-hidden="true" />
        History
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{timeline?.label ?? label}</DialogTitle>
            <DialogDescription>
              Every time this concept has come up in your practice.
            </DialogDescription>
          </DialogHeader>

          {loading && (
            <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              <span role="status">Loading history…</span>
            </div>
          )}

          {error && (
            <Alert variant="destructive">
              <AlertCircle aria-hidden="true" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {timeline && (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <Badge
                  variant="outline"
                  className={cn(STATUS_STYLE[timeline.status])}
                >
                  {humanizeEnum(timeline.status)}
                </Badge>
                <Badge variant="secondary">Seen {timeline.frequency}×</Badge>
                <Badge variant="outline">{timeline.severity} severity</Badge>
                {timeline.skillLabel && (
                  <Badge variant="outline">{timeline.skillLabel}</Badge>
                )}
              </div>

              <p className="text-sm text-muted-foreground">
                First seen {formatDate(timeline.firstSeenAt)}, last seen{" "}
                {formatDate(timeline.lastSeenAt)}
                {timeline.daysSinceLastSeen > 0 &&
                  ` (${timeline.daysSinceLastSeen} day${
                    timeline.daysSinceLastSeen === 1 ? "" : "s"
                  } ago)`}
                .{" "}
                {timeline.status === "RESOLVED"
                  ? "It has not recurred for long enough to be treated as resolved — it will reopen automatically if it happens again."
                  : timeline.status === "IMPROVING"
                    ? "It has been quiet for a couple of weeks. Keep it that way and it will be marked resolved."
                    : "It is still recurring, so it is costing you readiness points."}
              </p>

              <ol className="space-y-3 border-l pl-4">
                {timeline.occurrences.map((occurrence) => (
                  <li key={occurrence.id} className="relative">
                    <span
                      className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-border"
                      aria-hidden="true"
                    />
                    <p className="text-xs text-muted-foreground">
                      {formatDate(occurrence.createdAt)} ·{" "}
                      {humanizeEnum(occurrence.source)}
                    </p>
                    <p className="text-pretty text-sm">{occurrence.detail}</p>
                  </li>
                ))}
              </ol>

              {timeline.occurrences.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No individual occurrences are recorded for this mistake.
                </p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
