"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  Bot,
  ListChecks,
  Loader2,
  Quote,
  Send,
  User,
} from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { apiPost, errorMessage } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import type { CoachTurnResult } from "@/lib/coach/service";

export type CoachMessageView = {
  id: string;
  role: "user" | "assistant";
  content: string;
  suggestedTasks: Array<{ title: string; topic: string; estimatedMin: number }>;
};

type CoachChatProps = {
  conversationId: string | null;
  initialMessages: CoachMessageView[];
  suggestions: string[];
  /** False when no AI key is configured — the composer is disabled, not faked. */
  aiEnabled: boolean;
};

/**
 * The coach conversation.
 *
 * The reply carries `citedFacts` — the measured numbers the answer was built
 * from — and they are rendered. If the coach says "your DBMS is weak", the
 * user can see the score it is talking about rather than taking it on faith.
 */
export function CoachChat({
  conversationId: initialConversationId,
  initialMessages,
  suggestions,
  aiEnabled,
}: CoachChatProps) {
  const router = useRouter();
  const [conversationId, setConversationId] = useState(initialConversationId);
  const [messages, setMessages] = useState<CoachMessageView[]>(initialMessages);
  const [citedFacts, setCitedFacts] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, sending]);

  async function ask(question: string) {
    const trimmed = question.trim();
    if (trimmed.length < 3 || sending) return;

    setError(null);
    setDraft("");
    setSending(true);
    setCitedFacts([]);

    // Show the question immediately; the server persists it before calling AI.
    const optimisticId = `local-${Date.now()}`;
    setMessages((current) => [
      ...current,
      { id: optimisticId, role: "user", content: trimmed, suggestedTasks: [] },
    ]);

    try {
      const result = await apiPost<CoachTurnResult>("/api/coach/message", {
        conversationId: conversationId ?? undefined,
        question: trimmed,
      });

      setConversationId(result.conversationId);
      setCitedFacts(result.citedFacts);
      setMessages((current) => [
        ...current,
        {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          content: result.answer,
          suggestedTasks: result.suggestedTasks.map((task) => ({
            title: task.title,
            topic: task.topic,
            estimatedMin: task.estimatedMin,
          })),
        },
      ]);

      // Refresh so a newly created conversation appears in the sidebar list.
      if (!conversationId) router.refresh();
    } catch (caught) {
      setError(errorMessage(caught));
      // Roll the question back out of the thread and hand the text back.
      setMessages((current) =>
        current.filter((message) => message.id !== optimisticId),
      );
      setDraft(trimmed);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardContent className="space-y-4 p-4 sm:p-6">
          {messages.length === 0 && !sending ? (
            <div className="py-6 text-center">
              <Bot
                className="mx-auto mb-3 h-8 w-8 text-muted-foreground"
                aria-hidden="true"
              />
              <p className="text-sm font-medium">
                Ask about your own preparation
              </p>
              <p className="mx-auto mt-1 max-w-md text-pretty text-sm text-muted-foreground">
                The coach only answers from your measured results. If it has no
                data on something, it will say so instead of guessing.
              </p>

              <div className="mt-4 flex flex-wrap justify-center gap-2">
                {suggestions.map((suggestion) => (
                  <Button
                    key={suggestion}
                    variant="outline"
                    size="sm"
                    disabled={!aiEnabled}
                    onClick={() => void ask(suggestion)}
                  >
                    {suggestion}
                  </Button>
                ))}
              </div>
            </div>
          ) : (
            <ul className="space-y-5">
              {messages.map((message) => (
                <li key={message.id}>
                  <CoachBubble message={message} />
                </li>
              ))}
            </ul>
          )}

          {sending && (
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              <span role="status">Reading your results…</span>
            </div>
          )}

          {citedFacts.length > 0 && !sending && (
            <div className="rounded-lg border bg-muted/40 p-3">
              <p className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                <Quote className="h-3 w-3" aria-hidden="true" />
                Facts this answer used
              </p>
              <ul className="space-y-1">
                {citedFacts.map((fact) => (
                  <li key={fact} className="text-xs text-muted-foreground">
                    {fact}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div ref={endRef} />
        </CardContent>
      </Card>

      {error && (
        <Alert variant="destructive">
          <AlertCircle aria-hidden="true" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void ask(draft);
        }}
        className="space-y-2"
      >
        <label htmlFor="coach-question" className="sr-only">
          Your question
        </label>
        <Textarea
          id="coach-question"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              void ask(draft);
            }
          }}
          placeholder={
            aiEnabled
              ? "Ask about your weak areas, your plan, or whether you're ready…"
              : "The AI coach needs an API key to be configured."
          }
          rows={3}
          maxLength={2000}
          disabled={!aiEnabled || sending}
        />
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            {aiEnabled
              ? "Ctrl/⌘ + Enter to send."
              : "Every other feature on this page works without a key."}
          </p>
          <Button
            type="submit"
            disabled={!aiEnabled || sending || draft.trim().length < 3}
          >
            {sending ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Send className="h-4 w-4" aria-hidden="true" />
            )}
            Ask
          </Button>
        </div>
      </form>
    </div>
  );
}

function CoachBubble({ message }: { message: CoachMessageView }) {
  const isUser = message.role === "user";
  const Icon = isUser ? User : Bot;

  return (
    <div className={cn("flex gap-3", isUser && "flex-row-reverse")}>
      <span
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
          isUser ? "bg-primary text-primary-foreground" : "bg-muted",
        )}
      >
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>

      <div className={cn("min-w-0 flex-1 space-y-2", isUser && "text-right")}>
        <p className="sr-only">{isUser ? "You said" : "Coach replied"}</p>
        <div
          className={cn(
            "inline-block max-w-full whitespace-pre-wrap rounded-lg px-3 py-2 text-left text-sm",
            isUser ? "bg-primary text-primary-foreground" : "bg-muted",
          )}
        >
          {message.content}
        </div>

        {message.suggestedTasks.length > 0 && (
          <div className="rounded-lg border p-3 text-left">
            <p className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              <ListChecks className="h-3 w-3" aria-hidden="true" />
              Suggested next steps
            </p>
            <ul className="space-y-1.5">
              {message.suggestedTasks.map((task) => (
                <li
                  key={task.title}
                  className="flex items-center justify-between gap-3 text-sm"
                >
                  <span className="min-w-0 truncate">{task.title}</span>
                  <Badge variant="secondary" className="shrink-0">
                    {task.estimatedMin} min
                  </Badge>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
