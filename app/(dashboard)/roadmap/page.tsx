import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { CalendarClock, Map as MapIcon } from "lucide-react";

import { DailyPlanCard } from "@/components/dashboard/daily-plan-card";
import { RoadmapGenerator } from "@/components/roadmap/roadmap-generator";
import { RoadmapView } from "@/components/roadmap/roadmap-view";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { ServiceNotice } from "@/components/shared/service-notice";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { aiAvailable } from "@/lib/ai";
import { aiKeyEnvHint } from "@/lib/env";
import { RoadmapHistory } from "@/components/roadmap/roadmap-history";
import { requireUserPage } from "@/lib/auth/session";
import { countDueReviews } from "@/lib/practice/service";
import {
  getActiveRoadmap,
  getOrCreateDailyPlan,
  listRoadmaps,
} from "@/lib/roadmap/service";

export const metadata: Metadata = {
  title: "Roadmap",
  description: "Your personalised preparation plan.",
};

export const dynamic = "force-dynamic";

async function RoadmapContent({ userId }: { userId: string }) {
  const [roadmap, plan, history, dueReviews] = await Promise.all([
    getActiveRoadmap(userId),
    getOrCreateDailyPlan(userId),
    listRoadmaps(userId),
    // A plan that ignores what you are actively forgetting is not a plan.
    countDueReviews(userId),
  ]);

  return (
    <div className="space-y-6">
      {dueReviews > 0 && (
        <Alert>
          <CalendarClock aria-hidden="true" />
          <AlertTitle>
            {dueReviews} concept{dueReviews === 1 ? "" : "s"} due for review
          </AlertTitle>
          <AlertDescription className="flex flex-wrap items-center gap-3">
            <span className="text-pretty">
              Spaced review comes first — reinforcing something you already
              half-know is cheaper than learning it again from scratch.
            </span>
            <Button asChild size="sm" variant="outline">
              <Link href="/practice">Start reviewing</Link>
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <DailyPlanCard
        tasks={plan.tasks.map((task) => ({
          id: task.id,
          title: task.title,
          detail: task.detail,
          kind: task.kind,
          topic: task.topic,
          isDone: task.isCompleted,
        }))}
      />

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                {roadmap ? roadmap.title : "Long-term roadmap"}
                {roadmap && (
                  <Badge variant="secondary">{roadmap.horizonDays} days</Badge>
                )}
              </CardTitle>
              <CardDescription>
                {roadmap
                  ? roadmap.summary
                  : "A multi-week plan built from your weak skills, repeated mistakes and target role."}
              </CardDescription>
            </div>
            <RoadmapGenerator
              aiEnabled={aiAvailable()}
              hasActive={Boolean(roadmap)}
            />
          </div>
        </CardHeader>

        <CardContent>
          {!roadmap ? (
            <EmptyState
              icon={MapIcon}
              title="No roadmap yet"
              description="Generate one above. It is built from your measured results, so the more you practise first, the better targeted it is."
            />
          ) : (
            <RoadmapView
              tasks={roadmap.tasks.map((task) => ({
                id: task.id,
                day: task.day,
                title: task.title,
                detail: task.detail,
                kind: task.kind,
                topic: task.topic,
                estimatedMin: task.estimatedMin,
                actionUrl: task.actionUrl,
                isCompleted: task.isCompleted,
              }))}
            />
          )}
        </CardContent>
      </Card>

      <RoadmapHistory
        roadmaps={history.map((item) => ({
          id: item.id,
          title: item.title,
          horizonDays: item.horizonDays,
          isActive: item.isActive,
          createdAt: item.createdAt.toISOString(),
          taskCount: item._count.tasks,
        }))}
      />
    </div>
  );
}

export default async function RoadmapPage() {
  const user = await requireUserPage("/roadmap");

  return (
    <>
      <PageHeader
        title="Preparation roadmap"
        description="Today's plan works without AI. The long-term roadmap needs a key."
      />

      {!aiAvailable() && (
        <ServiceNotice
          title="Roadmap generation is not configured"
          message="Multi-week roadmaps need an AI provider key. Today's plan below is rule-based and works regardless."
          envHint={aiKeyEnvHint()}
        />
      )}

      <Suspense
        fallback={
          <div className="space-y-6">
            <Skeleton className="h-64" />
            <Skeleton className="h-96" />
          </div>
        }
      >
        <RoadmapContent userId={user.id} />
      </Suspense>
    </>
  );
}
