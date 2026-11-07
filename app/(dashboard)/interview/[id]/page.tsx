import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertCircle } from "lucide-react";

import { InterviewChat } from "@/components/interview/interview-chat";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { requireUserPage } from "@/lib/auth/session";
import { isLiveVoiceConfigured } from "@/lib/env";
import { getInterviewState } from "@/lib/interviews/service";
import { sttAvailable, ttsAvailable } from "@/lib/voice";

export const metadata: Metadata = {
  title: "Chat interview",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * The chat interview: type your answers, read the interviewer's.
 *
 * One of two deliberately separate experiences. This page never opens a camera
 * or a microphone — the realtime interview lives at `/check` and `/room`, and
 * keeping them apart is what stops "quick text practice" and "join a real
 * interview" collapsing into one ambiguous screen.
 *
 * The `?mode=` parameters this page used to accept are still honoured as
 * redirects, so bookmarks and links from earlier sessions land in the right
 * place rather than silently losing voice.
 */
export default async function InterviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ mode?: string; video?: string }>;
}) {
  const user = await requireUserPage();
  const { id } = await params;
  const query = await searchParams;

  if (query.mode === "lobby") redirect(`/interview/${id}/check`);
  if (query.mode === "live") {
    redirect(`/interview/${id}/room?video=${query.video === "off" ? "off" : "on"}`);
  }

  const state = await getInterviewState(user.id, id);

  if (state.status === "COMPLETED") {
    redirect(`/interview/${id}/result`);
  }

  if (state.status === "FAILED") {
    return (
      <Alert variant="destructive">
        <AlertCircle aria-hidden="true" />
        <AlertTitle>This interview couldn&apos;t be started</AlertTitle>
        <AlertDescription className="space-y-3">
          <p>
            The AI service didn&apos;t respond when we tried to generate the
            first question. Nothing was lost — just start a new one.
          </p>
          <Button asChild size="sm">
            <Link href="/interview/new">Start a new interview</Link>
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <InterviewChat
      state={state}
      voice={{ sttEnabled: sttAvailable(), ttsEnabled: ttsAvailable() }}
      liveAvailable={isLiveVoiceConfigured()}
    />
  );
}
