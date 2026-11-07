"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, MessageSquare, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { apiDelete, errorMessage } from "@/lib/api/client";
import { cn } from "@/lib/utils";

export type ConversationSummary = {
  id: string;
  title: string | null;
  messageCount: number;
};

/**
 * Saved coach conversations.
 *
 * Deleting is confirmed because a conversation carries the grounding snapshot
 * that justified each reply — it is the audit trail for advice the user acted
 * on, and losing it silently would be worse than a click of friction.
 */
export function ConversationList({
  conversations,
  activeId,
}: {
  conversations: ConversationSummary[];
  activeId: string | null;
}) {
  const router = useRouter();
  const [target, setTarget] = useState<ConversationSummary | null>(null);
  const [deleting, setDeleting] = useState(false);

  if (conversations.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nothing yet. Your first question starts a conversation.
      </p>
    );
  }

  async function confirmDelete() {
    if (!target) return;
    setDeleting(true);
    try {
      await apiDelete(`/api/coach/conversations/${target.id}`);
      toast.success("Conversation deleted.");
      const wasActive = target.id === activeId;
      setTarget(null);
      // Leaving the deleted conversation open would 404 on the next render.
      if (wasActive) router.push("/coach");
      else router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <ul className="space-y-1">
        {conversations.map((conversation) => {
          const isActive = conversation.id === activeId;
          return (
            <li key={conversation.id} className="group flex items-center gap-1">
              <Link
                href={`/coach?c=${conversation.id}`}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex min-w-0 flex-1 items-start gap-2 rounded-md px-2 py-2 text-sm",
                  isActive ? "bg-accent" : "hover:bg-accent",
                )}
              >
                <MessageSquare
                  className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
                <span className="min-w-0">
                  <span className="block truncate">
                    {conversation.title ?? "Untitled"}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {conversation.messageCount} message
                    {conversation.messageCount === 1 ? "" : "s"}
                  </span>
                </span>
              </Link>

              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0 opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
                onClick={() => setTarget(conversation)}
                aria-label={`Delete conversation "${conversation.title ?? "Untitled"}"`}
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              </Button>
            </li>
          );
        })}
      </ul>

      <Dialog
        open={target !== null}
        onOpenChange={(open) => !open && setTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this conversation?</DialogTitle>
            <DialogDescription>
              This removes the messages and the record of what your results
              were when the coach replied. It cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTarget(null)}>
              Keep it
            </Button>
            <Button
              variant="destructive"
              onClick={() => void confirmDelete()}
              disabled={deleting}
            >
              {deleting && (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              )}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
