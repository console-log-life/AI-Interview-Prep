"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { TaskKind } from "@prisma/client";
import { Clock, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { apiPatch, errorMessage } from "@/lib/api/client";
import { cn } from "@/lib/utils";

export type RoadmapTaskView = {
  id: string;
  day: number;
  title: string;
  detail: string | null;
  kind: TaskKind;
  topic: string | null;
  estimatedMin: number;
  actionUrl: string | null;
  isCompleted: boolean;
};

/** Grouped by day so a 90-day plan is still readable. */
export function RoadmapView({ tasks: initial }: { tasks: RoadmapTaskView[] }) {
  const [tasks, setTasks] = useState(initial);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const days = useMemo(() => {
    const grouped = new Map<number, RoadmapTaskView[]>();
    for (const task of tasks) {
      const list = grouped.get(task.day) ?? [];
      list.push(task);
      grouped.set(task.day, list);
    }
    return [...grouped.entries()].sort((a, b) => a[0] - b[0]);
  }, [tasks]);

  const done = tasks.filter((task) => task.isCompleted).length;
  const percent = tasks.length ? Math.round((done / tasks.length) * 100) : 0;

  async function toggle(task: RoadmapTaskView) {
    const nextValue = !task.isCompleted;
    setPendingId(task.id);
    setTasks((current) =>
      current.map((row) =>
        row.id === task.id ? { ...row, isCompleted: nextValue } : row,
      ),
    );

    try {
      await apiPatch(`/api/roadmap/tasks/${task.id}`, { isCompleted: nextValue });
    } catch (error) {
      setTasks((current) =>
        current.map((row) =>
          row.id === task.id ? { ...row, isCompleted: !nextValue } : row,
        ),
      );
      toast.error(errorMessage(error));
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Plan progress</span>
          <span className="font-medium tabular-nums">
            {done} of {tasks.length} tasks
          </span>
        </div>
        <Progress
          value={percent}
          aria-label={`${percent} percent of the roadmap complete`}
        />
      </div>

      <div className="space-y-4">
        {days.map(([day, dayTasks]) => {
          const dayMinutes = dayTasks.reduce(
            (total, task) => total + task.estimatedMin,
            0,
          );
          const dayDone = dayTasks.every((task) => task.isCompleted);

          return (
            <Card key={day} className={cn(dayDone && "opacity-70")}>
              <CardHeader className="flex-row items-center justify-between space-y-0 py-3">
                <CardTitle className="text-base">Day {day}</CardTitle>
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                  {dayMinutes} min
                </span>
              </CardHeader>
              <CardContent className="space-y-3 pb-4">
                {dayTasks.map((task) => (
                  <div key={task.id} className="flex items-start gap-3">
                    <Checkbox
                      id={`roadmap-${task.id}`}
                      checked={task.isCompleted}
                      disabled={pendingId === task.id}
                      onCheckedChange={() => void toggle(task)}
                      aria-label={`Mark "${task.title}" as ${
                        task.isCompleted ? "not done" : "done"
                      }`}
                      className="mt-0.5"
                    />
                    <div className="min-w-0 flex-1">
                      <label
                        htmlFor={`roadmap-${task.id}`}
                        className={cn(
                          "cursor-pointer text-sm font-medium",
                          task.isCompleted &&
                            "text-muted-foreground line-through",
                        )}
                      >
                        {task.title}
                      </label>
                      {task.detail && (
                        <p className="text-pretty text-xs text-muted-foreground">
                          {task.detail}
                        </p>
                      )}
                      {task.topic && (
                        <Badge variant="outline" className="mt-1.5">
                          {task.topic}
                        </Badge>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      {pendingId === task.id && (
                        <Loader2
                          className="h-3.5 w-3.5 animate-spin text-muted-foreground"
                          aria-hidden="true"
                        />
                      )}
                      {task.actionUrl && (
                        <Button asChild variant="ghost" size="sm">
                          <Link href={task.actionUrl}>Open</Link>
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
