import {
  Award,
  Braces,
  Flame,
  ListChecks,
  Lock,
  Medal,
  Star,
  Target,
  Trophy,
  type LucideIcon,
} from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { cn, formatDate } from "@/lib/utils";

const ICONS: Record<string, LucideIcon> = {
  trophy: Trophy,
  award: Award,
  medal: Medal,
  star: Star,
  flame: Flame,
  target: Target,
  braces: Braces,
  "list-checks": ListChecks,
};

export type AchievementItem = {
  code: string;
  title: string;
  description: string;
  icon: string;
  points: number;
  threshold: number;
  current: number;
  unlocked: boolean;
  unlockedAt: Date | null;
};

/**
 * Achievement wall.
 *
 * Locked badges show real progress towards the threshold, so the grid is
 * informative on day one without ever awarding something unearned.
 */
export function AchievementGrid({ items }: { items: AchievementItem[] }) {
  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((item) => {
        const Icon = ICONS[item.icon] ?? Trophy;
        const percent =
          item.threshold > 0
            ? Math.min(100, (item.current / item.threshold) * 100)
            : 0;

        return (
          <li key={item.code}>
            <Card
              className={cn(
                "h-full",
                item.unlocked ? "border-success/40 bg-success/5" : "opacity-90",
              )}
            >
              <CardContent className="flex gap-3 p-4">
                <div
                  className={cn(
                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
                    item.unlocked
                      ? "bg-success/15 text-success"
                      : "bg-muted text-muted-foreground",
                  )}
                  aria-hidden="true"
                >
                  {item.unlocked ? (
                    <Icon className="h-5 w-5" />
                  ) : (
                    <Lock className="h-4 w-4" />
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-sm font-medium">{item.title}</h3>
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                      {item.points} pts
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground text-pretty">
                    {item.description}
                  </p>

                  {item.unlocked ? (
                    <p className="mt-2 text-xs font-medium text-success">
                      Unlocked {formatDate(item.unlockedAt)}
                    </p>
                  ) : (
                    <div className="mt-2 space-y-1">
                      <Progress
                        value={percent}
                        className="h-1.5"
                        aria-label={`${item.title}: ${item.current} of ${item.threshold}`}
                      />
                      <p className="text-xs tabular-nums text-muted-foreground">
                        {item.current} / {item.threshold}
                      </p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </li>
        );
      })}
    </ul>
  );
}
