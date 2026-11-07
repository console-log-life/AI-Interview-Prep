import type { Metadata } from "next";
import { Suspense } from "react";

import { ReviewQueue } from "@/components/practice/review-queue";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { Skeleton } from "@/components/ui/skeleton";
import { CalendarClock, Layers, Repeat } from "lucide-react";
import { requireUserPage } from "@/lib/auth/session";
import { getReviewQueue } from "@/lib/practice/service";
import { MAX_INTERVAL_DAYS } from "@/lib/practice/scheduling";

export const metadata: Metadata = {
  title: "Review",
  description: "Spaced review of the concepts you keep getting wrong.",
};

export const dynamic = "force-dynamic";

async function PracticeContent({ userId }: { userId: string }) {
  // The whole queue, not the dashboard's preview slice — this is the page
  // where a candidate with twenty due concepts actually works through them.
  const queue = await getReviewQueue(userId, {
    dueLimit: 50,
    upcomingLimit: 20,
  });

  const totalLapses = [...queue.due, ...queue.upcoming].reduce(
    (sum, item) => sum + item.lapses,
    0,
  );

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Due now"
          value={queue.dueTotal}
          icon={CalendarClock}
          hint={
            queue.dueTotal > 0
              ? "Worst-forgotten first"
              : "Nothing to review right now"
          }
        />
        <StatCard
          label="Tracked concepts"
          value={queue.totalActive}
          icon={Layers}
          hint="Enrolled automatically from your results"
        />
        <StatCard
          label="Times forgotten"
          value={totalLapses}
          icon={Repeat}
          hint={
            totalLapses > 0
              ? "Across all tracked concepts"
              : "Nothing forgotten yet"
          }
        />
      </div>

      <ReviewQueue
        due={queue.due}
        upcoming={queue.upcoming}
        dueTotal={queue.dueTotal}
        totalActive={queue.totalActive}
      />
    </div>
  );
}

export default async function PracticePage() {
  const user = await requireUserPage("/practice");

  return (
    <>
      <PageHeader
        title="Spaced review"
        description={`Concepts resurface on a widening schedule — up to ${MAX_INTERVAL_DAYS} days — until they stop coming back.`}
      />

      <Suspense
        fallback={
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-3">
              {Array.from({ length: 3 }).map((_, index) => (
                <Skeleton key={index} className="h-28" />
              ))}
            </div>
            <Skeleton className="h-96" />
          </div>
        }
      >
        <PracticeContent userId={user.id} />
      </Suspense>
    </>
  );
}
