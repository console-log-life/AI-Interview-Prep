import "server-only";

import { computeReadinessV2 } from "@/lib/analytics/service";
import type { ReadinessResult } from "@/lib/analytics/readiness";
import { getMistakes, refreshMistakeStatuses } from "@/lib/mistakes/service";
import type { MistakeRow } from "@/lib/mistakes/service";
import { getReviewQueue, type ReviewQueue } from "@/lib/practice/service";
import { getStreak } from "@/lib/progress/service";
import { getOrCreateDailyPlan } from "@/lib/roadmap/service";
import {
  getHeadlineSkills,
  getStrongSkills,
  getWeakSkills,
  type SkillIntelligenceRow,
} from "@/lib/skills/service";
import type { DailyPlanTaskView } from "@/components/dashboard/daily-plan-card";

/**
 * Everything the Interview Intelligence Center renders, in one place.
 *
 * Gathered in parallel because the dashboard is the most-loaded page in the
 * app and each of these is an independent read. Mistake statuses are refreshed
 * first — "improving" and "resolved" are functions of elapsed time, so they
 * would otherwise go stale until the user's next interview.
 */
export type DashboardIntelligence = {
  readiness: ReadinessResult;
  streak: number;
  headlineSkills: SkillIntelligenceRow[];
  weakSkills: SkillIntelligenceRow[];
  strongSkills: SkillIntelligenceRow[];
  mistakes: MistakeRow[];
  planTasks: DailyPlanTaskView[];
  reviews: ReviewQueue;
};

export async function getDashboardIntelligence(
  userId: string,
): Promise<DashboardIntelligence> {
  await refreshMistakeStatuses(userId);

  const [
    readiness,
    streak,
    headlineSkills,
    weakSkills,
    strongSkills,
    mistakes,
    plan,
    reviews,
  ] = await Promise.all([
    computeReadinessV2(userId),
    getStreak(userId),
    getHeadlineSkills(userId),
    getWeakSkills(userId, 5),
    getStrongSkills(userId, 5),
    getMistakes(userId, { limit: 5 }),
    getOrCreateDailyPlan(userId),
    // Enrols any newly-repeated mistake as a side effect, so the queue is
    // current without a scheduled job.
    getReviewQueue(userId, { dueLimit: 5, upcomingLimit: 3 }),
  ]);

  return {
    readiness,
    streak,
    headlineSkills,
    weakSkills,
    strongSkills,
    mistakes,
    reviews,
    planTasks: plan.tasks.map((task) => ({
      id: task.id,
      title: task.title,
      detail: task.detail,
      kind: task.kind,
      topic: task.topic,
      isDone: task.isCompleted,
    })),
  };
}
