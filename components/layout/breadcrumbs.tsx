"use client";

import { Fragment } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";

import { ADMIN_NAV, MAIN_NAV } from "@/components/layout/nav-config";

/**
 * Breadcrumbs derived from the URL.
 *
 * Only rendered below the top level: on `/dashboard` a single crumb saying
 * "Dashboard" is noise, and the sidebar already shows where you are. It earns
 * its space on `/interview/abc/result`, where the path is genuinely deep.
 *
 * Opaque ids (cuids) are skipped rather than printed — "cm3x9f2..." tells the
 * user nothing and looks broken.
 */
const LABELS = new Map(
  [...MAIN_NAV, ADMIN_NAV]
    .flatMap((section) => section.items)
    .map((item) => [item.href.replace(/^\//, ""), item.label] as const),
);

/** Segment overrides for paths that are not top-level nav entries. */
const SEGMENT_LABELS: Record<string, string> = {
  new: "New",
  result: "Result",
  admin: "Admin",
  "content-studio": "Content studio",
  observability: "AI observability",
  "job-description": "Job matching",
  practice: "Review",
};

function isOpaqueId(segment: string): boolean {
  // cuid-ish or uuid-ish: long, and not a word the user would recognise.
  return /^[a-z0-9]{16,}$/i.test(segment) || /^[0-9a-f-]{32,}$/i.test(segment);
}

function labelFor(segment: string): string {
  return (
    SEGMENT_LABELS[segment] ??
    LABELS.get(segment) ??
    segment.replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase())
  );
}

export function Breadcrumbs() {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);

  if (segments.length < 2) return null;

  const crumbs = segments
    .map((segment, index) => ({
      segment,
      href: `/${segments.slice(0, index + 1).join("/")}`,
      isLast: index === segments.length - 1,
    }))
    .filter((crumb) => !isOpaqueId(crumb.segment));

  if (crumbs.length < 2) return null;

  return (
    <nav aria-label="Breadcrumb" className="min-w-0">
      <ol className="flex items-center gap-1 text-sm text-muted-foreground">
        {crumbs.map((crumb, index) => (
          <Fragment key={crumb.href}>
            {index > 0 && (
              <ChevronRight
                className="h-3.5 w-3.5 shrink-0 opacity-50"
                aria-hidden="true"
              />
            )}
            <li className="min-w-0">
              {crumb.isLast ? (
                <span
                  aria-current="page"
                  className="truncate font-medium text-foreground"
                >
                  {labelFor(crumb.segment)}
                </span>
              ) : (
                <Link
                  href={crumb.href}
                  className="truncate rounded transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {labelFor(crumb.segment)}
                </Link>
              )}
            </li>
          </Fragment>
        ))}
      </ol>
    </nav>
  );
}
