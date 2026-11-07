"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  QuestionEditor,
  type QuestionFormValues,
} from "@/components/admin/question-editor";
import {
  CategoryBadge,
  DifficultyBadge,
} from "@/components/shared/difficulty-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiDelete, errorMessage } from "@/lib/api/client";
import { humanizeEnum } from "@/lib/utils";
import { ClipboardList } from "lucide-react";

export type AdminQuestionRow = {
  id: string;
  text: string;
  category: string;
  topic: string;
  difficulty: "EASY" | "MEDIUM" | "HARD";
  type: string;
  points: number;
  isActive: boolean;
  expectedAnswer: string | null;
  explanation: string | null;
  skillsTested: string[];
  tags: string[];
  options: Array<{ id: string; text: string; isCorrect: boolean }>;
};

export function QuestionTable({ questions }: { questions: AdminQuestionRow[] }) {
  const router = useRouter();
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<QuestionFormValues | undefined>();
  const [deleteTarget, setDeleteTarget] = useState<AdminQuestionRow | null>(null);
  const [pending, startTransition] = useTransition();

  function openNew() {
    setEditing(undefined);
    setEditorOpen(true);
  }

  function openEdit(question: AdminQuestionRow) {
    setEditing({
      id: question.id,
      text: question.text,
      category: question.category,
      topic: question.topic,
      difficulty: question.difficulty,
      type: question.type,
      expectedAnswer: question.expectedAnswer ?? "",
      explanation: question.explanation ?? "",
      skillsTested: question.skillsTested,
      tags: question.tags,
      points: question.points,
      isActive: question.isActive,
      options: question.options.map((option) => ({
        text: option.text,
        isCorrect: option.isCorrect,
      })),
    });
    setEditorOpen(true);
  }

  function remove() {
    if (!deleteTarget) return;
    startTransition(async () => {
      try {
        await apiDelete(`/api/admin/questions/${deleteTarget.id}`);
        toast.success("Question deleted.");
        setDeleteTarget(null);
        router.refresh();
      } catch (error) {
        toast.error(errorMessage(error));
      }
    });
  }

  return (
    <>
      <div className="flex justify-end">
        <Button onClick={openNew}>
          <Plus aria-hidden="true" />
          New question
        </Button>
      </div>

      {questions.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="No questions found"
          description="No questions match your filters. Create one, or run the seed script to load the starter bank."
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Question</TableHead>
              <TableHead className="hidden md:table-cell">Category</TableHead>
              <TableHead className="hidden lg:table-cell">Topic</TableHead>
              <TableHead className="hidden sm:table-cell">Type</TableHead>
              <TableHead>Difficulty</TableHead>
              <TableHead className="hidden xl:table-cell">Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {questions.map((question) => (
              <TableRow key={question.id}>
                <TableCell className="max-w-[320px]">
                  <p className="truncate text-sm">{question.text}</p>
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  <CategoryBadge category={question.category} />
                </TableCell>
                <TableCell className="hidden text-sm text-muted-foreground lg:table-cell">
                  {question.topic}
                </TableCell>
                <TableCell className="hidden sm:table-cell">
                  <Badge variant="outline">{humanizeEnum(question.type)}</Badge>
                </TableCell>
                <TableCell>
                  <DifficultyBadge difficulty={question.difficulty} />
                </TableCell>
                <TableCell className="hidden xl:table-cell">
                  <Badge variant={question.isActive ? "success" : "secondary"}>
                    {question.isActive ? "Active" : "Inactive"}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => openEdit(question)}
                      aria-label={`Edit question: ${question.text.slice(0, 40)}`}
                    >
                      <Pencil aria-hidden="true" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setDeleteTarget(question)}
                      aria-label={`Delete question: ${question.text.slice(0, 40)}`}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 aria-hidden="true" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <QuestionEditor
        open={editorOpen}
        onOpenChange={setEditorOpen}
        initial={editing}
      />

      <Dialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this question?</DialogTitle>
            <DialogDescription>
              It will be removed from every assessment that uses it, along with
              any recorded answers. Consider marking it inactive instead.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={remove} loading={pending}>
              Delete permanently
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
