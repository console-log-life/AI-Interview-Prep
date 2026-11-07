import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { RoadmapView } from "@/components/roadmap/roadmap-view";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requireUserPage } from "@/lib/auth/session";
import { getRoadmap } from "@/lib/roadmap/service";
import { formatDateTime } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Roadmap",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * A single roadmap, current or superseded.
 *
 * Tasks stay tickable on a superseded plan — the work was still done, and
 * hiding that would misrepresent the user's own history back to them.
 */
export default async function RoadmapDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUserPage();
  const { id } = await params;

  const roadmap = await getRoadmap(user.id, id);

  return (
    <>
      <PageHeader
        title={roadmap.title}
        description={`${roadmap.horizonDays}-day plan · created ${formatDateTime(
          roadmap.createdAt,
        )}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={roadmap.isActive ? "default" : "outline"}>
              {roadmap.isActive ? "Active" : "Superseded"}
            </Badge>
            <Button asChild variant="outline" size="sm">
              <Link href="/roadmap">
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                All roadmaps
              </Link>
            </Button>
          </div>
        }
      />

      {roadmap.summary && (
        <p className="text-pretty text-sm text-muted-foreground">
          {roadmap.summary}
        </p>
      )}

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
    </>
  );
}
