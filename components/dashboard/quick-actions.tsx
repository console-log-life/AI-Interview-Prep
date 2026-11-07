import Link from "next/link";
import { Bot, Braces, ClipboardList, FileText, Target } from "lucide-react";

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

export function QuickActions() {
  return (
    <section aria-labelledby="quick-actions-heading">
      <h2 id="quick-actions-heading" className="sr-only">
        Quick actions
      </h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {ACTIONS.map((action) => (
          <Card
            key={action.href}
            className="group transition-colors hover:border-primary/40 hover:bg-accent/40"
          >
            <CardContent className="p-4">
              <Link
                href={action.href}
                className="flex flex-col gap-2 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                  <action.icon
                    className="h-4.5 w-4.5 text-primary"
                    aria-hidden="true"
                  />
                </span>
                <span className="text-sm font-medium leading-tight">
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
