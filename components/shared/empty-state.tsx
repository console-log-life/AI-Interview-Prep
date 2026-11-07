import Link from "next/link";
import type { LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type EmptyStateProps = {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: { label: string; href: string };
  secondaryAction?: { label: string; href: string };
  className?: string;
};

/**
 * Shown wherever a user genuinely has no data yet.
 *
 * Explicitly NOT a fake chart or a placeholder statistic — an honest empty
 * state plus a next step is more useful than an invented number.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  secondaryAction,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-2xl border border-dashed bg-card/50 px-6 py-14 text-center",
        className,
      )}
    >
      {/* Tinted rather than grey: an empty state is a starting point, and a
          grey circle makes it look like something failed. */}
      <div className="icon-badge-lg mb-4">
        <Icon className="h-6 w-6" aria-hidden="true" />
      </div>
      <h3 className="type-card-title">{title}</h3>
      <p className="mt-2 max-w-sm text-pretty text-sm text-muted-foreground">
        {description}
      </p>
      {(action || secondaryAction) && (
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          {action && (
            <Button asChild className="rounded-full px-5">
              <Link href={action.href}>{action.label}</Link>
            </Button>
          )}
          {secondaryAction && (
            <Button asChild variant="outline" className="rounded-full px-5">
              <Link href={secondaryAction.href}>{secondaryAction.label}</Link>
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
