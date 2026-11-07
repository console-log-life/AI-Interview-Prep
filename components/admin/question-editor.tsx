"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { TagInput } from "@/components/shared/tag-input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { apiPatch, apiPost, errorMessage, ApiClientError } from "@/lib/api/client";
import { humanizeEnum } from "@/lib/utils";
import { questionUpsertSchema } from "@/lib/validation/assessment";

const CATEGORIES = [
  "DSA", "DBMS", "OOP", "OPERATING_SYSTEMS", "COMPUTER_NETWORKS",
  "JAVA", "PYTHON", "JAVASCRIPT", "APTITUDE", "LOGICAL_REASONING",
  "HR", "BEHAVIORAL", "SYSTEM_DESIGN",
] as const;

const TYPES = [
  "MCQ", "MULTI_SELECT", "TRUE_FALSE", "SHORT_ANSWER",
  "BEHAVIORAL", "TECHNICAL",
] as const;

const DIFFICULTIES = ["EASY", "MEDIUM", "HARD"] as const;

export type QuestionFormValues = {
  id?: string;
  text: string;
  category: string;
  topic: string;
  difficulty: string;
  type: string;
  expectedAnswer: string;
  explanation: string;
  skillsTested: string[];
  tags: string[];
  points: number;
  isActive: boolean;
  options: Array<{ text: string; isCorrect: boolean }>;
};

const BLANK: QuestionFormValues = {
  text: "",
  category: "DSA",
  topic: "",
  difficulty: "MEDIUM",
  type: "MCQ",
  expectedAnswer: "",
  explanation: "",
  skillsTested: [],
  tags: [],
  points: 1,
  isActive: true,
  options: [
    { text: "", isCorrect: true },
    { text: "", isCorrect: false },
  ],
};

export function QuestionEditor({
  open,
  onOpenChange,
  initial,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: QuestionFormValues;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [values, setValues] = useState<QuestionFormValues>(initial ?? BLANK);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const needsOptions =
    values.type === "MCQ" ||
    values.type === "MULTI_SELECT" ||
    values.type === "TRUE_FALSE";

  function set<K extends keyof QuestionFormValues>(
    key: K,
    value: QuestionFormValues[K],
  ) {
    setValues((previous) => ({ ...previous, [key]: value }));
  }

  function changeType(next: string) {
    // True/False has a fixed, non-editable option pair.
    if (next === "TRUE_FALSE") {
      setValues((previous) => ({
        ...previous,
        type: next,
        options: [
          { text: "True", isCorrect: true },
          { text: "False", isCorrect: false },
        ],
      }));
      return;
    }
    set("type", next);
  }

  function setOption(index: number, patch: Partial<{ text: string; isCorrect: boolean }>) {
    const next = [...values.options];
    next[index] = { ...next[index], ...patch };
    // Single-answer types allow exactly one correct option.
    if (patch.isCorrect && values.type !== "MULTI_SELECT") {
      next.forEach((option, i) => {
        if (i !== index) option.isCorrect = false;
      });
    }
    set("options", next);
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setErrors({});

    const parsed = questionUpsertSchema.safeParse({
      ...values,
      options: needsOptions ? values.options : [],
    });

    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (typeof key === "string" && !next[key]) next[key] = issue.message;
      }
      setErrors(next);
      toast.error(Object.values(next)[0] ?? "Please check the form.");
      return;
    }

    startTransition(async () => {
      try {
        if (values.id) {
          await apiPatch(`/api/admin/questions/${values.id}`, parsed.data);
          toast.success("Question updated.");
        } else {
          await apiPost("/api/admin/questions", parsed.data);
          toast.success("Question created.");
        }
        onOpenChange(false);
        router.refresh();
      } catch (error) {
        if (error instanceof ApiClientError && error.fields) setErrors(error.fields);
        toast.error(errorMessage(error));
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto scrollbar-thin">
        <DialogHeader>
          <DialogTitle>
            {values.id ? "Edit question" : "New question"}
          </DialogTitle>
          <DialogDescription>
            Questions become available to every student once active.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="q-text">Question</Label>
            <Textarea
              id="q-text"
              value={values.text}
              onChange={(event) => set("text", event.target.value)}
              rows={3}
              required
              aria-invalid={Boolean(errors.text)}
            />
            {errors.text && (
              <p className="text-sm text-destructive">{errors.text}</p>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="q-category">Category</Label>
              <Select
                value={values.category}
                onValueChange={(value) => set("category", value)}
              >
                <SelectTrigger id="q-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((value) => (
                    <SelectItem key={value} value={value}>
                      {humanizeEnum(value)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="q-topic">Topic</Label>
              <Input
                id="q-topic"
                value={values.topic}
                onChange={(event) => set("topic", event.target.value)}
                placeholder="e.g. SQL joins"
                required
                aria-invalid={Boolean(errors.topic)}
              />
              {errors.topic && (
                <p className="text-sm text-destructive">{errors.topic}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="q-type">Type</Label>
              <Select value={values.type} onValueChange={changeType}>
                <SelectTrigger id="q-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TYPES.map((value) => (
                    <SelectItem key={value} value={value}>
                      {humanizeEnum(value)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="q-difficulty">Difficulty</Label>
              <Select
                value={values.difficulty}
                onValueChange={(value) => set("difficulty", value)}
              >
                <SelectTrigger id="q-difficulty">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DIFFICULTIES.map((value) => (
                    <SelectItem key={value} value={value}>
                      {humanizeEnum(value)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {needsOptions ? (
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">
                Options
                {values.type === "MULTI_SELECT" && " (mark all correct answers)"}
              </legend>
              {errors.options && (
                <p className="text-sm text-destructive">{errors.options}</p>
              )}
              {values.options.map((option, index) => (
                <div key={index} className="flex items-center gap-2">
                  <Checkbox
                    checked={option.isCorrect}
                    onCheckedChange={(checked) =>
                      setOption(index, { isCorrect: checked === true })
                    }
                    aria-label={`Option ${index + 1} is correct`}
                  />
                  <Input
                    value={option.text}
                    onChange={(event) =>
                      setOption(index, { text: event.target.value })
                    }
                    placeholder={`Option ${index + 1}`}
                    disabled={values.type === "TRUE_FALSE"}
                    aria-label={`Option ${index + 1} text`}
                  />
                  {values.type !== "TRUE_FALSE" && values.options.length > 2 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() =>
                        set(
                          "options",
                          values.options.filter((_, i) => i !== index),
                        )
                      }
                      aria-label={`Remove option ${index + 1}`}
                    >
                      <Trash2 aria-hidden="true" />
                    </Button>
                  )}
                </div>
              ))}
              {values.type !== "TRUE_FALSE" && values.options.length < 8 && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    set("options", [...values.options, { text: "", isCorrect: false }])
                  }
                >
                  <Plus aria-hidden="true" />
                  Add option
                </Button>
              )}
            </fieldset>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="q-expected">Reference answer</Label>
              <Textarea
                id="q-expected"
                value={values.expectedAnswer}
                onChange={(event) => set("expectedAnswer", event.target.value)}
                rows={4}
                placeholder="What a strong answer covers. Shown to students after they submit."
                aria-invalid={Boolean(errors.expectedAnswer)}
              />
              {errors.expectedAnswer && (
                <p className="text-sm text-destructive">{errors.expectedAnswer}</p>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="q-explanation">Explanation</Label>
            <Textarea
              id="q-explanation"
              value={values.explanation}
              onChange={(event) => set("explanation", event.target.value)}
              rows={3}
              placeholder="Why the correct answer is correct. Shown on the result page."
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="q-skills">Skills tested</Label>
              <TagInput
                id="q-skills"
                value={values.skillsTested}
                onChange={(next) => set("skillsTested", next)}
                max={20}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="q-tags">Tags</Label>
              <TagInput
                id="q-tags"
                value={values.tags}
                onChange={(next) => set("tags", next)}
                max={20}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-6">
            <div className="flex items-center gap-2">
              <Label htmlFor="q-points">Points</Label>
              <Input
                id="q-points"
                type="number"
                min={1}
                max={20}
                value={values.points}
                onChange={(event) =>
                  set("points", Number(event.target.value) || 1)
                }
                className="w-20"
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={values.isActive}
                onCheckedChange={(checked) => set("isActive", checked === true)}
              />
              Active (available to students)
            </label>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" loading={pending}>
              <Save aria-hidden="true" />
              {values.id ? "Save changes" : "Create question"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
