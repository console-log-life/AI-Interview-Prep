"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { History, Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";

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

export type RoadmapSummary = {
  id: string;
  title: string;
  horizonDays: number;
  isActive: boolean;
  createdAt: string;
  taskCount: number;
};

/**
 * Past roadmaps.
 *
 * Superseded plans are kept rather than deleted, so restoring one brings back
 * its ticked-off tasks too — regenerating would both cost an AI call and throw
 * that progress away.
 */
export function RoadmapHistory({ roadmaps }: { roadmaps: RoadmapSummary[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);

  const superseded = roadmaps.filter((roadmap) => !roadmap.isActive);
  if (superseded.length === 0) return null;

  async function activate(id: string) {
    setBusyId(id);
    try {
      await apiPost(`/api/roadmap/${id}/activate`);
      toast.success("Roadmap restored.");
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <History className="h-4 w-4" aria-hidden="true" />
          Previous roadmaps
        </CardTitle>
        <CardDescription>
          Kept with their progress. Restoring one does not cost an AI call.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2">
          {superseded.map((roadmap) => (
            <li
              key={roadmap.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
            >
              <div className="min-w-0">
                <Link
                  href={`/roadmap/${roadmap.id}`}
                  className="truncate text-sm font-medium underline-offset-2 hover:underline"
                >
                  {roadmap.title}
                </Link>
                <p className="text-xs text-muted-foreground">
                  {roadmap.taskCount} task{roadmap.taskCount === 1 ? "" : "s"} ·
                  created {formatDate(roadmap.createdAt)}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Badge variant="outline">{roadmap.horizonDays} days</Badge>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busyId !== null}
                  onClick={() => void activate(roadmap.id)}
                >
                  {busyId === roadmap.id ? (
                    <Loader2
                      className="h-3.5 w-3.5 animate-spin"
                      aria-hidden="true"
                    />
                  ) : (
                    <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                  Restore
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
