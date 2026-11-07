"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import type { TaskKind } from "@prisma/client";
import { CalendarCheck, Loader2 } from "lucide-react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { apiPatch, errorMessage } from "@/lib/api/client";
import { cn } from "@/lib/utils";

export type DailyPlanTaskView = {
  id: string;
  title: string;
  detail: string | null;
  kind: TaskKind;
  topic: string | null;
  isDone: boolean;
};

/** Where each kind of task actually gets done — no dead buttons. */
const TASK_HREF: Record<TaskKind, string> = {
  ASSESSMENT: "/assessments",
  INTERVIEW: "/interview/new",
  CODING: "/coding",
  REVIEW: "/progress",
  STUDY: "/interview/new",
  RESUME: "/resume",
};

const TASK_LABEL: Record<TaskKind, string> = {
  ASSESSMENT: "Assessment",
  INTERVIEW: "Interview",
  CODING: "Coding",
  REVIEW: "Review",
  STUDY: "Study",
  RESUME: "Resume",
};

/**
 * Today's plan.
 *
 * Deliberately built without the AI: the plan is derived from measured weak
 * skills and repeated mistakes, so it works identically with or without an API
 * key. Ticking a task writes to the database immediately.
 */
export function DailyPlanCard({
  tasks: initialTasks,
}: {
  tasks: DailyPlanTaskView[];
}) {
  const [tasks, setTasks] = useState(initialTasks);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const done = tasks.filter((task) => task.isDone).length;
  const percent = tasks.length ? Math.round((done / tasks.length) * 100) : 0;

  async function toggle(task: DailyPlanTaskView) {
    const nextValue = !task.isDone;
    setPendingId(task.id);
    // Optimistic — reverted below if the write fails.
    setTasks((current) =>
      current.map((row) =>
        row.id === task.id ? { ...row, isDone: nextValue } : row,
      ),
    );

    try {
      await apiPatch(`/api/plan/tasks/${task.id}`, { isCompleted: nextValue });
      startTransition(() => {
        if (nextValue) toast.success("Nice — task ticked off.");
      });
    } catch (error) {
      setTasks((current) =>
        current.map((row) =>
          row.id === task.id ? { ...row, isDone: !nextValue } : row,
        ),
      );
      toast.error(errorMessage(error));
    } finally {
      setPendingId(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle>Today&apos;s preparation plan</CardTitle>
            <CardDescription>
              Built from your weakest measured areas and repeated mistakes.
            </CardDescription>
          </div>
          <Badge variant="secondary" className="shrink-0 tabular-nums">
            {done}/{tasks.length}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {tasks.length === 0 ? (
          <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
            No plan for today yet. It appears the first time you open the
            dashboard each day.
          </p>
        ) : (
          <>
            <Progress
              value={percent}
              aria-label={`${percent} percent of today's plan complete`}
            />

            <ul className="space-y-3">
              {tasks.map((task) => (
                <li key={task.id} className="flex items-start gap-3">
                  <Checkbox
                    id={`task-${task.id}`}
                    checked={task.isDone}
                    disabled={pendingId === task.id}
                    onCheckedChange={() => void toggle(task)}
                    aria-label={`Mark "${task.title}" as ${
                      task.isDone ? "not done" : "done"
                    }`}
                    className="mt-0.5"
                  />
                  <div className="min-w-0 flex-1">
                    <label
                      htmlFor={`task-${task.id}`}
                      className={cn(
                        "cursor-pointer text-sm font-medium",
                        task.isDone && "text-muted-foreground line-through",
                      )}
                    >
                      {task.title}
                    </label>
                    {task.detail && (
                      <p className="text-pretty text-xs text-muted-foreground">
                        {task.detail}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {pendingId === task.id && (
                      <Loader2
                        className="h-3.5 w-3.5 animate-spin text-muted-foreground"
                        aria-hidden="true"
                      />
                    )}
                    <Button asChild variant="ghost" size="sm">
                      <Link href={TASK_HREF[task.kind]}>
                        {TASK_LABEL[task.kind]}
                      </Link>
                    </Button>
                  </div>
                </li>
              ))}
            </ul>

            {done === tasks.length && (
              <p className="flex items-center gap-2 rounded-md bg-success/10 px-3 py-2 text-sm text-success">
                <CalendarCheck className="h-4 w-4" aria-hidden="true" />
                Whole plan done. That is a real day of preparation.
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
