import type { ReactNode } from "react";

type PageHeaderProps = {
  /** Accepts a node so pages can compose a client greeting into the heading. */
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  /** Small label above the title, e.g. the user's target role. */
  eyebrow?: ReactNode;
};

export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
}: PageHeaderProps) {
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow mb-1.5">{eyebrow}</p>}
        {/* Bigger and bolder than before: the page title is the one piece of
            type on a dense page that should be unambiguous about hierarchy. */}
        <h1 className="text-balance text-2xl font-bold tracking-tight sm:text-title">
          {title}
        </h1>
        {description && (
          <p className="mt-2 max-w-2xl text-pretty text-sm leading-relaxed text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {actions && (
        <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
      )}
    </header>
  );
}
