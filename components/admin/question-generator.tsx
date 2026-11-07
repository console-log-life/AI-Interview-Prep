"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiPost, errorMessage } from "@/lib/api/client";
import { humanizeEnum } from "@/lib/utils";

const CATEGORIES = [
  "DSA",
  "DBMS",
  "OPERATING_SYSTEMS",
  "COMPUTER_NETWORKS",
  "OOP",
  "SYSTEM_DESIGN",
  "JAVA",
  "PYTHON",
  "JAVASCRIPT",
  "BEHAVIORAL",
  "APTITUDE",
  "HR",
] as const;

const DIFFICULTIES = ["EASY", "MEDIUM", "HARD"] as const;
const TYPES = ["MCQ", "MULTI_SELECT", "SHORT_ANSWER", "TRUE_FALSE"] as const;

type GenerationResult = {
  requested: number;
  accepted: number;
  rejected: number;
  createdIds: string[];
  rejections: Array<{ text: string; reasons: string[] }>;
};

/**
 * Generation is a proposal, not a publication.
 *
 * With review required (the default) accepted questions land as PENDING and
 * are invisible to students until an admin approves them. Rejections are shown
 * with their reasons rather than silently dropped — that feedback is how the
 * quality rules earn trust.
 */
export function QuestionGenerator({ aiEnabled }: { aiEnabled: boolean }) {
  const router = useRouter();
  const [category, setCategory] = useState<string>("DSA");
  const [topic, setTopic] = useState("");
  const [difficulty, setDifficulty] = useState<string>("MEDIUM");
  const [count, setCount] = useState("5");
  const [types, setTypes] = useState<string[]>(["MCQ"]);
  const [requireReview, setRequireReview] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<GenerationResult | null>(null);

  function toggleType(type: string) {
    setTypes((current) =>
      current.includes(type)
        ? current.filter((item) => item !== type)
        : [...current, type],
    );
  }

  async function generate() {
    setGenerating(true);
    setResult(null);
    try {
      const response = await apiPost<GenerationResult>(
        "/api/admin/questions/generate",
        {
          category,
          topic: topic.trim(),
          difficulty,
          count: Number(count),
          types,
          requireReview,
        },
      );
      setResult(response);
      toast.success(
        `${response.accepted} accepted, ${response.rejected} rejected.`,
      );
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setGenerating(false);
    }
  }

  const canGenerate =
    aiEnabled && !generating && topic.trim().length >= 2 && types.length > 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Generate questions</CardTitle>
        <CardDescription>
          Every generated question passes a quality gate — banned patterns, no
          correct option, duplicate detection — before it can be stored.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5">
            <Label htmlFor="gen-category">Category</Label>
            <Select
              value={category}
              onValueChange={setCategory}
              disabled={!aiEnabled || generating}
            >
              <SelectTrigger id="gen-category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((item) => (
                  <SelectItem key={item} value={item}>
                    {humanizeEnum(item)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="gen-topic">Topic</Label>
            <Input
              id="gen-topic"
              value={topic}
              onChange={(event) => setTopic(event.target.value)}
              placeholder="e.g. Binary search trees"
              maxLength={100}
              disabled={!aiEnabled || generating}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="gen-difficulty">Difficulty</Label>
            <Select
              value={difficulty}
              onValueChange={setDifficulty}
              disabled={!aiEnabled || generating}
            >
              <SelectTrigger id="gen-difficulty">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DIFFICULTIES.map((item) => (
                  <SelectItem key={item} value={item}>
                    {humanizeEnum(item)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="gen-count">How many</Label>
            <Select
              value={count}
              onValueChange={setCount}
              disabled={!aiEnabled || generating}
            >
              <SelectTrigger id="gen-count">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {/* Capped at 15 to match the server-side limit. */}
                {[3, 5, 10, 15].map((item) => (
                  <SelectItem key={item} value={String(item)}>
                    {item}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Question types</legend>
          <div className="flex flex-wrap gap-4">
            {TYPES.map((type) => (
              <div key={type} className="flex items-center gap-2">
                <Checkbox
                  id={`type-${type}`}
                  checked={types.includes(type)}
                  onCheckedChange={() => toggleType(type)}
                  disabled={!aiEnabled || generating}
                />
                <Label htmlFor={`type-${type}`} className="font-normal">
                  {humanizeEnum(type)}
                </Label>
              </div>
            ))}
          </div>
        </fieldset>

        <div className="flex items-start gap-2 rounded-lg border p-3">
          <Checkbox
            id="require-review"
            checked={requireReview}
            onCheckedChange={(checked) => setRequireReview(checked === true)}
            disabled={!aiEnabled || generating}
            className="mt-0.5"
          />
          <Label htmlFor="require-review" className="font-normal">
            Hold for review before students can see them
            <span className="mt-0.5 block text-xs text-muted-foreground">
              Strongly recommended. Unticking this publishes AI-written
              questions immediately.
            </span>
          </Label>
        </div>

        {!requireReview && (
          <Alert variant="destructive">
            <AlertTriangle aria-hidden="true" />
            <AlertTitle>These will go live immediately</AlertTitle>
            <AlertDescription>
              Nobody will have read them before a student does.
            </AlertDescription>
          </Alert>
        )}

        <Button onClick={() => void generate()} disabled={!canGenerate}>
          {generating ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Sparkles className="h-4 w-4" aria-hidden="true" />
          )}
          Generate
        </Button>

        {result && (
          <div className="space-y-3 rounded-lg border p-4" aria-live="polite">
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">{result.requested} requested</Badge>
              <Badge className="bg-success text-success-foreground">
                {result.accepted} accepted
              </Badge>
              {result.rejected > 0 && (
                <Badge variant="destructive">{result.rejected} rejected</Badge>
              )}
            </div>

            {result.rejections.length > 0 && (
              <div>
                <p className="mb-2 text-sm font-medium">
                  Rejected, and why
                </p>
                <ul className="space-y-2">
                  {result.rejections.map((rejection, index) => (
                    <li
                      key={`${rejection.text}-${index}`}
                      className="rounded-md bg-muted/50 p-2"
                    >
                      <p className="text-pretty text-xs">{rejection.text}</p>
                      <ul className="mt-1 list-inside list-disc">
                        {rejection.reasons.map((reason) => (
                          <li
                            key={reason}
                            className="text-xs text-destructive"
                          >
                            {reason}
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
