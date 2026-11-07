import Link from "next/link";
import { ArrowRight, Bot, Braces, ClipboardList, FileText, Target } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";

const ACTIONS = [
  {
    href: "/interview/new",
    label: "Start mock interview",
    icon: Bot,
    hint: "20 min · adaptive",
  },
  {
    href: "/assessments",
    label: "Take an assessment",
    icon: ClipboardList,
    hint: "13 categories",
  },
  {
    href: "/coding",
    label: "Practise coding",
    icon: Braces,
    hint: "4 languages",
  },
  {
    href: "/resume",
    label: "Upload resume",
    icon: FileText,
    hint: "PDF · analysed",
  },
  {
    href: "/job-description",
    label: "Analyse a job post",
    icon: Target,
    hint: "Match + roadmap",
  },
];

/**
 * Quick actions, with one of them promoted.
 *
 * Five equal cards gave the dashboard no hierarchy: starting an interview —
 * the thing the product exists to do — looked exactly as important as
 * uploading a résumé. The first action is now a filled hero spanning two
 * columns and the rest are secondary tiles, so the page has an obvious
 * default move.
 *
 * Presentation only: the same five links, in the same order, to the same
 * routes.
 */
export function QuickActions() {
  const [hero, ...rest] = ACTIONS;

  return (
    <section aria-labelledby="quick-actions-heading">
      <h2 id="quick-actions-heading" className="sr-only">
        Quick actions
      </h2>
      <div className="grid gap-3 lg:grid-cols-4">
        {/* Hero: the one place on the dashboard the gradient is allowed. */}
        <Link
          href={hero.href}
          className="gradient-cta group relative flex flex-col justify-between gap-6 overflow-hidden rounded-2xl p-5 text-white shadow-lg transition-shadow hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:col-span-2 sm:flex-row sm:items-center lg:col-span-2"
        >
          <span className="relative flex items-start gap-4">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/20 backdrop-blur">
              <hero.icon className="h-5 w-5" aria-hidden="true" />
            </span>
            <span className="flex flex-col gap-1">
              <span className="font-display text-lg font-bold leading-tight">
                {hero.label}
              </span>
              <span className="text-sm text-white/80">{hero.hint}</span>
            </span>
          </span>
          <span
            aria-hidden="true"
            className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/20 transition-transform group-hover:translate-x-0.5"
          >
            <ArrowRight className="h-4 w-4" />
          </span>
        </Link>

        {rest.map((action) => (
          <Card
            key={action.href}
            className="group rounded-2xl border-border/70 transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
          >
            <CardContent className="p-5">
              <Link
                href={action.href}
                className="flex flex-col gap-2.5 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="icon-badge">
                  <action.icon className="h-[18px] w-[18px]" aria-hidden="true" />
                </span>
                <span className="text-sm font-semibold leading-tight">
                  {action.label}
                </span>
                <span className="text-xs text-muted-foreground">
                  {action.hint}
                </span>
              </Link>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
