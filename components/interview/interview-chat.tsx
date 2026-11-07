"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, Send, StopCircle, Video } from "lucide-react";
import { toast } from "sonner";

import { AnswerFeedback } from "@/components/interview/answer-feedback";
import {
  InterviewMessage,
  InterviewThinking,
} from "@/components/interview/interview-message";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SpeakQuestion } from "@/components/interview/speak-question";
import { VoiceAnswer } from "@/components/interview/voice-answer";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { useInterview } from "@/hooks/use-interview";
import { apiPost, errorMessage } from "@/lib/api/client";
import { humanizeEnum } from "@/lib/utils";
import type { InterviewStateDTO } from "@/types/interview";

type InterviewChatProps = {
  state: InterviewStateDTO;
  /** Voice controls appear only when the corresponding provider is configured. */
  voice: { sttEnabled: boolean; ttsEnabled: boolean };
  /** True when a realtime voice room can actually be opened. */
  liveAvailable?: boolean;
};

export function InterviewChat({
  state,
  voice,
  liveAvailable = false,
}: InterviewChatProps) {
  const router = useRouter();
  const [draft, setDraft] = useState("");
  const [completing, setCompleting] = useState(false);
  const [endOpen, setEndOpen] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const {
    messages,
    evaluations,
    sending,
    error,
    finished,
    awaitingAnswer,
    answersGiven,
    plannedQuestions,
    restoredDraft,
    sendAnswer,
  } = useInterview({
    interviewId: state.id,
    initialMessages: state.messages,
    plannedQuestions: state.plannedQuestions,
  });

  // A failed send hands the text back so nothing typed is lost.
  useEffect(() => {
    if (restoredDraft) setDraft(restoredDraft);
  }, [restoredDraft]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, sending]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const answer = draft;
    setDraft("");
    await sendAnswer(answer);
  }

  async function complete() {
    setCompleting(true);
    try {
      await apiPost(`/api/interviews/${state.id}/complete`);
      router.push(`/interview/${state.id}/result`);
    } catch (caught) {
      setCompleting(false);
      setEndOpen(false);
      toast.error(errorMessage(caught));
    }
  }

  const progress = (answersGiven / plannedQuestions) * 100;

  return (
    <div className="space-y-4">
      {/* Sticky status bar */}
      <Card className="sticky top-20 z-10">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{state.targetRole}</Badge>
            <Badge variant="outline">{humanizeEnum(state.type)}</Badge>
            <Badge variant="outline">{humanizeEnum(state.persona)}</Badge>
            <Badge variant="outline">{humanizeEnum(state.difficulty)}</Badge>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm tabular-nums text-muted-foreground">
              {answersGiven} / {plannedQuestions} answered
            </span>
            {liveAvailable && answersGiven === 0 && (
              <Button asChild variant="outline" size="sm">
                <Link href={`/interview/${state.id}/check`}>
                  <Video aria-hidden="true" />
                  Switch to mock interview
                </Link>
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setEndOpen(true)}
              disabled={completing}
            >
              <StopCircle aria-hidden="true" />
              End &amp; get report
            </Button>
          </div>
        </CardContent>
        <Progress
          value={progress}
          className="h-1 rounded-none rounded-b-xl"
          aria-label={`${answersGiven} of ${plannedQuestions} questions answered`}
        />
      </Card>

      {/* Transcript */}
      <div className="space-y-5">
        {messages.map((message) => (
          <div key={message.id} className="space-y-3">
            <InterviewMessage
              role={message.role}
              content={message.content}
              topic={message.topic}
              isFollowUp={message.isFollowUp}
            />
            {message.role === "INTERVIEWER" && message.isQuestion && (
              <SpeakQuestion text={message.content} enabled={voice.ttsEnabled} />
            )}
            {evaluations[message.id] && (
              <AnswerFeedback evaluation={evaluations[message.id]} />
            )}
          </div>
        ))}
        {sending && <InterviewThinking />}
        <div ref={endRef} />
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle aria-hidden="true" />
          <AlertDescription>
            {error} Your answer has been put back in the box below — press send
            to try again.
          </AlertDescription>
        </Alert>
      )}

      {/* Composer / completion */}
      {finished ? (
        <Card className="rounded-2xl border-border/70">
          <CardContent className="flex flex-col items-center gap-4 p-8 text-center">
            <CheckCircle2 className="h-10 w-10 text-success" aria-hidden="true" />
            <div>
              <h2 className="text-lg font-semibold">
                That&apos;s all the questions
              </h2>
              <p className="mt-1 text-sm text-muted-foreground text-pretty">
                Generate your report to see scores across technical depth,
                communication, problem solving and structure.
              </p>
            </div>
            <Button onClick={complete} loading={completing} size="lg">
              Generate my report
            </Button>
          </CardContent>
        </Card>
      ) : (
        <form onSubmit={handleSubmit} className="sticky bottom-0 pt-2">
          <Card className="rounded-2xl border-border/70">
            <CardContent className="space-y-3 p-4">
              <label htmlFor="answer" className="sr-only">
                Your answer
              </label>
              <Textarea
                id="answer"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  // Ctrl/Cmd+Enter sends; plain Enter inserts a newline, since
                  // interview answers are usually multi-paragraph.
                  if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                    event.preventDefault();
                    void handleSubmit(event);
                  }
                }}
                placeholder={
                  awaitingAnswer
                    ? "Type your answer. Take your time — structure matters as much as content."
                    : "Waiting for the next question…"
                }
                rows={4}
                maxLength={8000}
                disabled={sending || !awaitingAnswer}
                className="resize-none"
              />

              <VoiceAnswer
                enabled={voice.sttEnabled}
                disabled={sending || !awaitingAnswer}
                onTranscript={(text) => {
                  // Appended, not replaced — a partial typed answer survives.
                  setDraft((current) =>
                    current.trim() ? `${current.trim()}\n\n${text}` : text,
                  );
                }}
              />

              <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-muted-foreground">
                  {draft.length > 0 && `${draft.length} characters · `}
                  Ctrl+Enter to send
                </p>
                <Button
                  type="submit"
                  loading={sending}
                  disabled={!draft.trim() || !awaitingAnswer}
                >
                  <Send aria-hidden="true" />
                  Send answer
                </Button>
              </div>
            </CardContent>
          </Card>
        </form>
      )}

      <Dialog open={endOpen} onOpenChange={setEndOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>End this interview?</DialogTitle>
            <DialogDescription>
              {answersGiven === 0
                ? "You haven't answered anything yet, so there's nothing to report on. You can end it anyway, or go back and answer the first question."
                : `You've answered ${answersGiven} of ${plannedQuestions} questions. We'll generate a report from what you answered — but a partial interview gives a partial picture.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEndOpen(false)}>
              Keep going
            </Button>
            <Button onClick={complete} loading={completing}>
              End and generate report
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
