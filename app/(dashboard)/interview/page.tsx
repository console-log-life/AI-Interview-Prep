import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Bot, MessagesSquare, Plus, Video } from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { requireUserPage } from "@/lib/auth/session";
import { isLiveVoiceConfigured } from "@/lib/env";
import { listUserInterviews } from "@/lib/interviews/service";
import { formatDateTime, humanizeEnum } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Interviews",
  description: "Practise by chat, or join a realtime mock interview.",
};

export const dynamic = "force-dynamic";

const STATUS_VARIANT: Record<
  string,
  "success" | "warning" | "destructive" | "secondary" | "outline"
> = {
  COMPLETED: "success",
  IN_PROGRESS: "warning",
  STARTED: "warning",
  PAUSED: "secondary",
  FAILED: "destructive",
};

export default async function InterviewListPage() {
  const user = await requireUserPage("/interview");
  const interviews = await listUserInterviews(user.id, 30);
  const liveAvailable = isLiveVoiceConfigured();

  const inProgress = interviews.filter(
    (interview) =>
      interview.status === "IN_PROGRESS" || interview.status === "STARTED",
  );

  return (
    <>
      <PageHeader
        title="Interview preparation"
        description="Two ways to practise. Both give you a scored report."
        actions={
          <Button asChild variant="outline">
            <Link href="/interview/new">
              <Plus aria-hidden="true" />
              New interview
            </Link>
          </Button>
        }
      />

      {/* The two experiences, presented as the choice they are rather than a
          setting buried inside one of them. */}
      <section aria-labelledby="modes-heading" className="space-y-3">
        <h2 id="modes-heading" className="sr-only">
          Choose a practice format
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <ModeCard
            href="/interview/new"
            icon={MessagesSquare}
            title="Chat interview"
            tagline="Quick text-based practice"
            points={[
              "Type your answers at your own pace",
              "No camera or microphone needed",
              "Good for a focused ten minutes",
            ]}
            cta="Start typing"
          />
          <ModeCard
            href="/interview/new"
            icon={Video}
            title="Mock interview"
            tagline="Real-time camera + voice simulation"
            points={[
              "Speak your answers out loud",
              "Device check, then a live interview room",
              "Adds delivery and presentation feedback",
            ]}
            cta={liveAvailable ? "Set up and join" : "Voice not configured here"}
            disabled={!liveAvailable}
            highlighted
          />
        </div>
      </section>

      {inProgress.length > 0 && (
        <section aria-labelledby="resume-heading" className="space-y-3">
          <h2 id="resume-heading" className="text-sm font-semibold">
            Pick up where you left off
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {inProgress.map((interview) => (
              <Card key={interview.id} className="border-warning/40 bg-warning/5">
                <CardContent className="flex items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {interview.targetRole}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Started {formatDateTime(interview.startedAt)}
                    </p>
                  </div>
                  <Button asChild size="sm">
                    <Link href={`/interview/${interview.id}`}>Resume</Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}

      {interviews.length === 0 ? (
        <EmptyState
          icon={Bot}
          title="No interviews yet"
          description="A 20-minute mock interview gives you a scored breakdown across technical depth, communication, problem solving and answer structure."
          action={{ label: "Start your first interview", href: "/interview/new" }}
        />
      ) : (
        <section aria-labelledby="history-heading" className="space-y-3">
          <h2 id="history-heading" className="text-sm font-semibold">
            History
          </h2>
          <ul className="divide-y rounded-lg border">
            {interviews.map((interview) => (
              <li key={interview.id}>
                <Link
                  href={
                    interview.status === "COMPLETED"
                      ? `/interview/${interview.id}/result`
                      : `/interview/${interview.id}`
                  }
                  className="flex flex-wrap items-center justify-between gap-3 p-4 transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {interview.targetRole}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {humanizeEnum(interview.type)} ·{" "}
                      {humanizeEnum(interview.difficulty)} ·{" "}
                      {formatDateTime(interview.createdAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={STATUS_VARIANT[interview.status] ?? "outline"}>
                      {humanizeEnum(interview.status)}
                    </Badge>
                    {interview.report && (
                      <Badge
                        variant={
                          interview.report.overallScore >= 75
                            ? "success"
                            : interview.report.overallScore >= 50
                              ? "warning"
                              : "destructive"
                        }
                      >
                        {interview.report.overallScore}/100
                      </Badge>
                    )}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

/**
 * One of the two entry points.
 *
 * Given equal weight on purpose: a candidate arriving here should be able to
 * tell in one glance which one opens a camera, without reading a settings
 * panel to find out.
 */
function ModeCard({
  href,
  icon: Icon,
  title,
  tagline,
  points,
  cta,
  disabled = false,
  highlighted = false,
}: {
  href: string;
  icon: typeof Bot;
  title: string;
  tagline: string;
  points: string[];
  cta: string;
  disabled?: boolean;
  highlighted?: boolean;
}) {
  return (
    <Card className={highlighted && !disabled ? "border-primary/40" : undefined}>
      <CardContent className="flex h-full flex-col gap-3 p-5">
        <div className="flex items-center gap-2">
          <Icon className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
          <div>
            <p className="font-medium">{title}</p>
            <p className="text-xs text-muted-foreground">{tagline}</p>
          </div>
        </div>
        <ul className="flex-1 space-y-1 text-sm text-muted-foreground">
          {points.map((point) => (
            <li key={point} className="text-pretty">
              {point}
            </li>
          ))}
        </ul>
        <Button asChild={!disabled} disabled={disabled} className="w-full" variant={highlighted ? "default" : "outline"}>
          {disabled ? (
            <span>{cta}</span>
          ) : (
            <Link href={href}>
              {cta}
              <ArrowRight aria-hidden="true" />
            </Link>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
