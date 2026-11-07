"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Trash2 } from "lucide-react";
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
import { apiDelete, apiPatch, errorMessage } from "@/lib/api/client";

export function AssessmentAdminControls({
  assessmentId,
  isPublished,
  attemptCount,
}: {
  assessmentId: string;
  isPublished: boolean;
  attemptCount: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);

  function togglePublish() {
    startTransition(async () => {
      try {
        await apiPatch(`/api/admin/assessments/${assessmentId}`, {
          isPublished: !isPublished,
        });
        toast.success(isPublished ? "Unpublished." : "Published.");
        router.refresh();
      } catch (error) {
        toast.error(errorMessage(error));
      }
    });
  }

  function remove() {
    startTransition(async () => {
      try {
        const result = await apiDelete<{
          deleted: boolean;
          unpublished: boolean;
          message?: string;
        }>(`/api/admin/assessments/${assessmentId}`);
        // The API refuses to delete anything students have attempted, and
        // unpublishes it instead — surface exactly what happened.
        toast[result.deleted ? "success" : "info"](
          result.message ?? "Assessment deleted.",
        );
        setConfirmOpen(false);
        router.refresh();
      } catch (error) {
        toast.error(errorMessage(error));
      }
    });
  }

  return (
    <>
      <div className="flex justify-end gap-1">
        <Button
          variant="ghost"
          size="sm"
          onClick={togglePublish}
          disabled={pending}
        >
          {isPublished ? (
            <>
              <Eye aria-hidden="true" />
              Published
            </>
          ) : (
            <>
              <EyeOff aria-hidden="true" />
              Hidden
            </>
          )}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setConfirmOpen(true)}
          disabled={pending}
          aria-label="Delete assessment"
          className="text-destructive hover:text-destructive"
        >
          <Trash2 aria-hidden="true" />
        </Button>
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this assessment?</DialogTitle>
            <DialogDescription>
              {attemptCount > 0
                ? `${attemptCount} student attempt${attemptCount === 1 ? " has" : "s have"} been recorded against this assessment, so it will be unpublished rather than deleted — deleting it would erase their results.`
                : "No students have attempted this yet, so it will be permanently deleted."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={remove} loading={pending}>
              {attemptCount > 0 ? "Unpublish" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
