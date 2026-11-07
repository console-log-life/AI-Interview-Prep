import { Bot, User } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { MessageRole } from "@/types/interview";

type InterviewMessageProps = {
  role: MessageRole;
  content: string;
  topic?: string | null;
  isFollowUp?: boolean;
};

export function InterviewMessage({
  role,
  content,
  topic,
  isFollowUp,
}: InterviewMessageProps) {
  const isInterviewer = role === "INTERVIEWER";

  return (
    <article
      className={cn(
        "flex gap-3",
        isInterviewer ? "flex-row" : "flex-row-reverse",
      )}
    >
      <div
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
          isInterviewer ? "bg-primary/10" : "bg-secondary",
        )}
        aria-hidden="true"
      >
        {isInterviewer ? (
          <Bot className="h-4 w-4 text-primary" />
        ) : (
          <User className="h-4 w-4" />
        )}
      </div>

      <div className={cn("min-w-0 max-w-[85%]", !isInterviewer && "text-right")}>
        <p className="mb-1 text-xs font-medium text-muted-foreground">
          {isInterviewer ? "Interviewer" : "You"}
        </p>

        <div
          className={cn(
            "inline-block rounded-2xl px-4 py-3 text-left text-sm leading-relaxed",
            isInterviewer
              ? "rounded-tl-sm bg-muted"
              : "rounded-tr-sm bg-primary text-primary-foreground",
          )}
        >
          <p className="whitespace-pre-wrap text-pretty">{content}</p>
        </div>

        {isInterviewer && (topic || isFollowUp) && (
          <div
            className={cn(
              "mt-1.5 flex flex-wrap gap-1.5",
              !isInterviewer && "justify-end",
            )}
          >
            {topic && <Badge variant="secondary">{topic}</Badge>}
            {isFollowUp && <Badge variant="outline">Follow-up</Badge>}
          </div>
        )}
      </div>
    </article>
  );
}

export function InterviewThinking() {
  return (
    <div className="flex gap-3" role="status" aria-live="polite">
      <div
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10"
        aria-hidden="true"
      >
        <Bot className="h-4 w-4 text-primary" />
      </div>
      <div>
        <p className="mb-1 text-xs font-medium text-muted-foreground">
          Interviewer
        </p>
        <div className="inline-flex items-center gap-1.5 rounded-2xl rounded-tl-sm bg-muted px-4 py-3">
          <span className="sr-only">
            The interviewer is reviewing your answer
          </span>
          {[0, 1, 2].map((index) => (
            <span
              key={index}
              className="h-1.5 w-1.5 animate-pulse rounded-full bg-muted-foreground/60"
              style={{ animationDelay: `${index * 160}ms` }}
              aria-hidden="true"
            />
          ))}
        </div>
      </div>
    </div>
  );
}
