import Link from "next/link";
import { ArrowRight, Lightbulb } from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type Recommendation = {
  id: string;
  title: string;
  reason: string;
  priority: "HIGH" | "MEDIUM" | "LOW";
  actionUrl: string | null;
  actionLabel: string | null;
};

const PRIORITY_VARIANT: Record<
  Recommendation["priority"],
  "destructive" | "warning" | "secondary"
> = {
  HIGH: "destructive",
  MEDIUM: "warning",
  LOW: "secondary",
};

const PRIORITY_LABEL: Record<Recommendation["priority"], string> = {
  HIGH: "High priority",
  MEDIUM: "Medium priority",
  LOW: "Low priority",
};

export function RecommendationsCard({
  recommendations,
}: {
  recommendations: Recommendation[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recommended next</CardTitle>
        <CardDescription>
          Generated from your measured performance, not a generic checklist.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {recommendations.length === 0 ? (
          <EmptyState
            icon={Lightbulb}
            title="Nothing to recommend yet"
            description="Complete an assessment or a mock interview and we'll point you at your weakest area."
            action={{ label: "Take an assessment", href: "/assessments" }}
          />
        ) : (
          <ul className="space-y-3">
            {recommendations.map((rec) => (
              <li
                key={rec.id}
                className="rounded-lg border p-4 transition-colors hover:bg-accent/40"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <h3 className="text-sm font-medium">{rec.title}</h3>
                  <Badge variant={PRIORITY_VARIANT[rec.priority]}>
                    {PRIORITY_LABEL[rec.priority]}
                  </Badge>
                </div>
                <p className="mt-1.5 text-sm text-muted-foreground text-pretty">
                  {rec.reason}
                </p>
                {rec.actionUrl && (
                  <Button
                    asChild
                    variant="link"
                    size="sm"
                    className="mt-1 h-auto px-0"
                  >
                    <Link href={rec.actionUrl}>
                      {rec.actionLabel ?? "Open"}
                      <ArrowRight aria-hidden="true" />
                    </Link>
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
