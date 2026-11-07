import { Target, TrendingUp } from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";
import { ScoreBar } from "@/components/shared/score-bar";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type Topic = {
  id: string;
  topic: string;
  averageScore: number;
  totalAttempts: number;
};

export function SkillBreakdown({ topics }: { topics: Topic[] }) {
  return (
    <Card className="rounded-2xl border-border/70">
      <CardHeader>
        <CardTitle>Strongest topics</CardTitle>
        <CardDescription>
          Rolling average across every scored activity.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {topics.length === 0 ? (
          <EmptyState
            icon={TrendingUp}
            title="No topic data yet"
            description="Topic scores build up as you take assessments and interviews."
            action={{ label: "Take an assessment", href: "/assessments" }}
          />
        ) : (
          <div className="space-y-4">
            {topics.map((topic) => (
              <ScoreBar
                key={topic.id}
                label={topic.topic}
                score={topic.averageScore}
                detail={`${Math.round(topic.averageScore)}% · ${topic.totalAttempts} attempt${
                  topic.totalAttempts === 1 ? "" : "s"
                }`}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function WeakAreas({ topics }: { topics: Topic[] }) {
  return (
    <Card className="rounded-2xl border-border/70">
      <CardHeader>
        <CardTitle>Weak areas</CardTitle>
        <CardDescription>
          Topics averaging under 60% — where practice pays off most.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {topics.length === 0 ? (
          <EmptyState
            icon={Target}
            title="No weak areas detected"
            description="Either you're doing well, or there isn't enough data yet. Keep practising and we'll flag anything that slips."
          />
        ) : (
          <div className="space-y-4">
            {topics.map((topic) => (
              <ScoreBar
                key={topic.id}
                label={topic.topic}
                score={topic.averageScore}
                detail={`${Math.round(topic.averageScore)}% · ${topic.totalAttempts} attempt${
                  topic.totalAttempts === 1 ? "" : "s"
                }`}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
