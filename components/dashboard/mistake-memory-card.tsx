import { AlertTriangle, CheckCircle2, Repeat } from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";
import { MistakeTimelineDialog } from "@/components/skills/mistake-timeline";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { MistakeRow } from "@/lib/mistakes/service";
import { cn } from "@/lib/utils";

const STATUS_STYLE: Record<MistakeRow["status"], string> = {
  ACTIVE: "border-destructive/30 bg-destructive/10 text-destructive",
  IMPROVING: "border-warning/40 bg-warning/10 text-warning-foreground",
  RESOLVED: "border-success/40 bg-success/10 text-success",
};

const STATUS_LABEL: Record<MistakeRow["status"], string> = {
  ACTIVE: "Still happening",
  IMPROVING: "Improving",
  RESOLVED: "Resolved",
};

/**
 * Mistake memory.
 *
 * The point of this card is that the platform *remembers*. A concept the
 * candidate has fumbled three times across different interviews is a different
 * problem from one bad answer, and only the frequency count can tell them apart.
 */
export function MistakeMemoryCard({ mistakes }: { mistakes: MistakeRow[] }) {
  return (
    <Card className="rounded-2xl border-border/70">
      <CardHeader>
        <CardTitle>Mistake memory</CardTitle>
        <CardDescription>
          Concepts you have got wrong before, tracked until they stop recurring.
        </CardDescription>
      </CardHeader>

      <CardContent>
        {mistakes.length === 0 ? (
          <EmptyState
            icon={CheckCircle2}
            title="Nothing recurring"
            description="Mistakes are recorded when an answer is weak on a concept we can name. Nothing has repeated so far."
          />
        ) : (
          <ul className="space-y-3">
            {mistakes.map((mistake) => (
              <li
                key={mistake.id}
                className="rounded-lg border p-3 last:mb-0"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-sm font-medium">
                      {mistake.severity === "HIGH" && (
                        <AlertTriangle
                          className="h-3.5 w-3.5 shrink-0 text-destructive"
                          aria-label="High severity"
                        />
                      )}
                      <span className="truncate">{mistake.label}</span>
                    </p>
                    {mistake.latestDetail && (
                      <p className="mt-1 text-pretty text-xs text-muted-foreground">
                        {mistake.latestDetail}
                      </p>
                    )}
                  </div>
                  <Badge
                    variant="outline"
                    className={cn("shrink-0", STATUS_STYLE[mistake.status])}
                  >
                    {STATUS_LABEL[mistake.status]}
                  </Badge>
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Repeat className="h-3 w-3" aria-hidden="true" />
                    Seen {mistake.frequency}×
                  </span>
                  <span>Last {formatDate(mistake.lastSeenAt)}</span>
                  <MistakeTimelineDialog
                    mistakeId={mistake.id}
                    label={mistake.label}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function formatDate(date: Date): string {
  return new Date(date).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  });
}
