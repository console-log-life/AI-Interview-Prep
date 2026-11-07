import type { Metadata } from "next";
import Link from "next/link";
import { MessageSquareOff } from "lucide-react";

import { CommunicationCoach } from "@/components/interview/communication-coach";
import { DeliveryReport } from "@/components/interview/delivery-report";
import { InterviewImpact } from "@/components/interview/interview-impact";
import { InterviewReportView } from "@/components/interview/interview-report";
import { ReportRetry } from "@/components/interview/report-retry";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { aiAvailable } from "@/lib/ai";
import { requireUserPage } from "@/lib/auth/session";
import { getInterviewCommunication } from "@/lib/communication/service";
import { getInterviewDelivery } from "@/lib/interviews/delivery-service";
import { parseStoredEvidence } from "@/lib/interviews/report-evidence";
import { parseRubricNotes } from "@/lib/interviews/rubric";
import { wordCount } from "@/lib/interviews/speech-metrics";
import { getInterviewIntelligence } from "@/lib/interviews/report-intelligence";
import { getInterviewResult } from "@/lib/interviews/service";
import { formatDateTime, humanizeEnum } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Interview report",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function InterviewResultPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUserPage();
  const { id } = await params;

  const interview = await getInterviewResult(user.id, id);
  const answered = interview.evaluations.length;

  // Both are reads of rows this interview already wrote, so they are cheap and
  // safe to fetch even when the AI report itself failed to generate.
  const [intelligence, communication] = answered
    ? await Promise.all([
        getInterviewIntelligence(user.id, id),
        getInterviewCommunication(user.id, id),
      ])
    : [null, null];

  // Delivery is fetched regardless of `answered`: a candidate who spoke but
  // whose turns never reached the evaluator still spoke, and telling them
  // nothing about how they came across would discard a real measurement.
  const delivery = await getInterviewDelivery(user.id, id);

  return (
    <>
      <PageHeader
        title="Interview report"
        description={`${interview.targetRole} · completed ${formatDateTime(
          interview.completedAt ?? interview.startedAt,
        )}`}
        actions={
          <div className="flex flex-wrap gap-1.5">
            <Badge variant="secondary">{humanizeEnum(interview.type)}</Badge>
            <Badge variant="outline">{humanizeEnum(interview.persona)}</Badge>
            <Badge variant="outline">{humanizeEnum(interview.difficulty)}</Badge>
          </div>
        }
      />

      {answered === 0 ? (
        <EmptyState
          icon={MessageSquareOff}
          title="No answers to report on"
          description="This interview ended before you answered any questions, so there is nothing to score. Nothing has been invented to fill the gap."
          action={{ label: "Start a new interview", href: "/interview/new" }}
        />
      ) : !interview.report ? (
        <div className="space-y-6">
          <ReportRetry interviewId={id} />
          <p className="text-sm text-muted-foreground">
            You can still{" "}
            <Button asChild variant="link" className="h-auto px-0">
              <Link href={`/interview/${id}`}>read the full transcript</Link>
            </Button>
            .
          </p>
          {/* The AI summary failed, but the measurements it wrote are real
              and still worth showing. */}
          {intelligence && <InterviewImpact intelligence={intelligence} />}
        </div>
      ) : (
        <InterviewReportView
          interviewId={id}
          report={{
            overallScore: interview.report.overallScore,
            technicalScore: interview.report.technicalScore,
            communicationScore: interview.report.communicationScore,
            problemSolvingScore: interview.report.problemSolvingScore,
            behavioralScore: interview.report.behavioralScore,
            structureScore: interview.report.structureScore,
            summary: interview.report.summary,
            strengths: interview.report.strengths,
            weaknesses: interview.report.weaknesses,
            // JSONB, so it is parsed defensively: an older report has none and
            // renders the plain list.
            evidence: parseStoredEvidence(interview.report.evidence),
            repeatedMistakes: interview.report.repeatedMistakes,
            recommendations: interview.report.recommendations,
            suggestedTopics: interview.report.suggestedTopics,
          }}
          evaluations={interview.evaluations.map((evaluation) => ({
            id: evaluation.id,
            questionText: evaluation.questionText,
            answerText: evaluation.answerText,
            topic: evaluation.topic,
            score: evaluation.score,
            feedback: evaluation.feedback,
            strengths: evaluation.strengths,
            missingPoints: evaluation.missingPoints,
            improvedAnswer: evaluation.improvedAnswer,
            rubric: {
              correctness: evaluation.correctness,
              relevance: evaluation.relevance,
              clarity: evaluation.clarity,
              technicalDepth: evaluation.technicalDepth,
              completeness: evaluation.completeness,
              structure: evaluation.structure,
            },
            // JSONB, so parsed defensively: an older evaluation has `{}` and
            // renders its scores without justifications.
            rubricNotes: parseRubricNotes(evaluation.rubricNotes),
          }))}
        />
      )}

      {intelligence && interview.report && (
        <InterviewImpact intelligence={intelligence} />
      )}

      {delivery && (
        <DeliveryReport
          delivery={delivery}
          // Counted from the answers already rendered on this page. No new
          // measurement — the chart only draws what the transcript contains.
          answerWordCounts={interview.evaluations.map((evaluation) =>
            wordCount(evaluation.answerText),
          )}
        />
      )}

      {communication && (
        <CommunicationCoach
          interviewId={id}
          initialRows={communication.rows}
          initialPending={communication.pending}
          aiEnabled={aiAvailable()}
        />
      )}
    </>
  );
}
