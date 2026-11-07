import type { Metadata } from "next";

import { QuestionGenerator } from "@/components/admin/question-generator";
import {
  ReviewQueue,
  type PendingQuestion,
} from "@/components/admin/review-queue";
import { PageHeader } from "@/components/shared/page-header";
import { ServiceNotice } from "@/components/shared/service-notice";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { aiAvailable } from "@/lib/ai";
import { aiKeyEnvHint } from "@/lib/env";
import { requireAdminPage } from "@/lib/auth/session";
import { listPendingQuestions } from "@/lib/assessments/generation";

export const metadata: Metadata = {
  title: "Content studio",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function ContentStudioPage() {
  await requireAdminPage();

  const pending = await listPendingQuestions(1, 25);

  const questions: PendingQuestion[] = pending.items.map((question) => ({
    id: question.id,
    text: question.text,
    category: question.category,
    topic: question.topic,
    difficulty: question.difficulty,
    type: question.type,
    explanation: question.explanation,
    expectedAnswer: question.expectedAnswer,
    qualityScore: question.qualityScore,
    options: question.options.map((option) => ({
      id: option.id,
      text: option.text,
      isCorrect: option.isCorrect,
    })),
  }));

  return (
    <>
      <PageHeader
        title="Content studio"
        description="Generate questions with AI, then approve them before students ever see them."
      />

      {!aiAvailable() && (
        <ServiceNotice
          title="Question generation is not configured"
          message="Generating questions needs an AI provider key. The review queue and the manual question editor work without one."
          envHint={aiKeyEnvHint()}
        />
      )}

      <QuestionGenerator aiEnabled={aiAvailable()} />

      <Card className="rounded-2xl border-border/70">
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle>Review queue</CardTitle>
              <CardDescription>
                Pending questions are inactive — they cannot appear in an
                assessment until approved here.
              </CardDescription>
            </div>
            <Badge variant="secondary" className="shrink-0 tabular-nums">
              {pending.total} pending
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <ReviewQueue questions={questions} />
        </CardContent>
      </Card>
    </>
  );
}
