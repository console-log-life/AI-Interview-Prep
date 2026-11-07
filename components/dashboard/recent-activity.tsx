import Link from "next/link";
import { Bot, Braces, ClipboardList } from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { humanizeEnum, relativeTime } from "@/lib/utils";

type InterviewRow = {
  id: string;
  targetRole: string;
  type: string;
  status: string;
  createdAt: Date;
  report: { overallScore: number } | null;
};

type AttemptRow = {
  id: string;
  percentage: number;
  submittedAt: Date | null;
  assessment: { title: string; category: string };
};

type SubmissionRow = {
  id: string;
  status: string;
  passedTests: number;
  totalTests: number;
  createdAt: Date;
  problem: { title: string; slug: string; difficulty: string };
};

function ScorePill({ score }: { score: number }) {
  const variant =
    score >= 75 ? "success" : score >= 50 ? "warning" : "destructive";
  return <Badge variant={variant}>{Math.round(score)}%</Badge>;
}

export function RecentInterviews({ interviews }: { interviews: InterviewRow[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent interviews</CardTitle>
        <CardDescription>Your last few mock interview sessions.</CardDescription>
      </CardHeader>
      <CardContent>
        {interviews.length === 0 ? (
          <EmptyState
            icon={Bot}
            title="No interviews yet"
            description="A mock interview gives you a scored breakdown across technical depth, communication and structure."
            action={{ label: "Start your first", href: "/interview/new" }}
          />
        ) : (
          <ul className="divide-y">
            {interviews.map((interview) => (
              <li key={interview.id}>
                <Link
                  href={
                    interview.status === "COMPLETED"
                      ? `/interview/${interview.id}/result`
                      : `/interview/${interview.id}`
                  }
                  className="-mx-2 flex items-center justify-between gap-3 rounded-md px-2 py-3 transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {interview.targetRole}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {humanizeEnum(interview.type)} ·{" "}
                      {relativeTime(interview.createdAt)}
                    </p>
                  </div>
                  {interview.report ? (
                    <ScorePill score={interview.report.overallScore} />
                  ) : (
                    <Badge variant="outline">
                      {humanizeEnum(interview.status)}
                    </Badge>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export function RecentAssessments({ attempts }: { attempts: AttemptRow[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent assessments</CardTitle>
        <CardDescription>Your last few completed attempts.</CardDescription>
      </CardHeader>
      <CardContent>
        {attempts.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title="No assessments yet"
            description="A short assessment is the quickest way to find out which topics need work."
            action={{ label: "Browse assessments", href: "/assessments" }}
          />
        ) : (
          <ul className="divide-y">
            {attempts.map((attempt) => (
              <li key={attempt.id}>
                <Link
                  href={`/assessments/${attempt.id}/result`}
                  className="-mx-2 flex items-center justify-between gap-3 rounded-md px-2 py-3 transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {attempt.assessment.title}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {humanizeEnum(attempt.assessment.category)} ·{" "}
                      {attempt.submittedAt
                        ? relativeTime(attempt.submittedAt)
                        : "—"}
                    </p>
                  </div>
                  <ScorePill score={attempt.percentage} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export function RecentCoding({ submissions }: { submissions: SubmissionRow[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Coding performance</CardTitle>
        <CardDescription>Your most recent submissions.</CardDescription>
      </CardHeader>
      <CardContent>
        {submissions.length === 0 ? (
          <EmptyState
            icon={Braces}
            title="No submissions yet"
            description="Coding rounds are where most technical interviews are decided."
            action={{ label: "Browse problems", href: "/coding" }}
          />
        ) : (
          <ul className="divide-y">
            {submissions.map((submission) => (
              <li key={submission.id}>
                <Link
                  href={`/coding/${submission.problem.slug}`}
                  className="-mx-2 flex items-center justify-between gap-3 rounded-md px-2 py-3 transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {submission.problem.title}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {submission.passedTests}/{submission.totalTests} tests ·{" "}
                      {relativeTime(submission.createdAt)}
                    </p>
                  </div>
                  <Badge
                    variant={
                      submission.status === "ACCEPTED" ? "success" : "destructive"
                    }
                  >
                    {humanizeEnum(submission.status)}
                  </Badge>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
