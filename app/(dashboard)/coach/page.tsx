import type { Metadata } from "next";
import Link from "next/link";

import { CoachChat, type CoachMessageView } from "@/components/coach/coach-chat";
import { ConversationList } from "@/components/coach/conversation-list";
import { PageHeader } from "@/components/shared/page-header";
import { ServiceNotice } from "@/components/shared/service-notice";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { aiAvailable } from "@/lib/ai";
import { aiKeyEnvHint } from "@/lib/env";
import { requireUserPage } from "@/lib/auth/session";
import {
  COACH_SUGGESTIONS,
  getConversation,
  listConversations,
} from "@/lib/coach/service";

export const metadata: Metadata = {
  title: "AI coach",
  description: "A coach that only speaks from your measured results.",
};

export const dynamic = "force-dynamic";

type SuggestedTask = { title: string; topic: string; estimatedMin: number };

/** The stored `suggestedTasks` JSON is AI output, so it is re-checked here. */
function toSuggestedTasks(value: unknown): SuggestedTask[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    if (typeof record.title !== "string") return [];
    return [
      {
        title: record.title,
        topic: typeof record.topic === "string" ? record.topic : "",
        estimatedMin:
          typeof record.estimatedMin === "number" ? record.estimatedMin : 0,
      },
    ];
  });
}

export default async function CoachPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string }>;
}) {
  const user = await requireUserPage("/coach");
  const params = await searchParams;

  const conversations = await listConversations(user.id);

  let messages: CoachMessageView[] = [];
  let activeId: string | null = null;

  if (params.c) {
    // getConversation enforces ownership; a bad id 404s rather than leaking.
    const conversation = await getConversation(user.id, params.c);
    activeId = conversation.id;
    messages = conversation.messages.map((message) => ({
      id: message.id,
      role: message.role === "assistant" ? "assistant" : "user",
      content: message.content,
      suggestedTasks: toSuggestedTasks(message.suggestedTasks),
    }));
  }

  return (
    <>
      <PageHeader
        title="AI coach"
        description="Grounded in your real scores, mistakes and activity — nothing invented."
        actions={
          activeId ? (
            <Button asChild variant="outline">
              <Link href="/coach">New conversation</Link>
            </Button>
          ) : undefined
        }
      />

      {!aiAvailable() && (
        <ServiceNotice
          title="The AI coach is not configured"
          message="Coaching needs an AI provider key. Your dashboard, skills, plan and all practice features continue to work without one."
          envHint={aiKeyEnvHint()}
        />
      )}

      <div className="grid gap-6 lg:grid-cols-4">
        <div className="lg:col-span-3">
          <CoachChat
            conversationId={activeId}
            initialMessages={messages}
            suggestions={COACH_SUGGESTIONS}
            aiEnabled={aiAvailable()}
          />
        </div>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="type-card-title">Past conversations</CardTitle>
            <CardDescription>Saved to your account.</CardDescription>
          </CardHeader>
          <CardContent>
            <ConversationList
              activeId={activeId}
              conversations={conversations.map((conversation) => ({
                id: conversation.id,
                title: conversation.title,
                messageCount: conversation._count.messages,
              }))}
            />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
