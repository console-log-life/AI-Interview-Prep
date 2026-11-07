"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
  "OOP",
  "OPERATING_SYSTEMS",
  "COMPUTER_NETWORKS",
  "JAVA",
  "PYTHON",
  "JAVASCRIPT",
  "APTITUDE",
  "LOGICAL_REASONING",
  "HR",
  "BEHAVIORAL",
  "SYSTEM_DESIGN",
] as const;

const DIFFICULTIES = ["EASY", "MEDIUM", "HARD"] as const;

/**
 * Builds a one-off practice set from the question bank.
 * Everything is validated again server-side by `startAssessmentSchema`.
 */
export function PracticeGenerator({
  defaultCategory,
}: {
  defaultCategory?: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [category, setCategory] = useState<string>(defaultCategory ?? "DSA");
  const [difficulty, setDifficulty] = useState<string>("ANY");
  const [questionCount, setQuestionCount] = useState("10");
  const [durationMin, setDurationMin] = useState("15");

  async function generate(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    try {
      const { attemptId } = await apiPost<{ attemptId: string }>(
        "/api/assessments/practice",
        {
          category,
          difficulty: difficulty === "ANY" ? undefined : difficulty,
          questionCount: Number(questionCount),
          durationMin: Number(durationMin),
        },
      );
      router.push(`/assessments/${attemptId}`);
    } catch (error) {
      setLoading(false);
      toast.error(errorMessage(error));
    }
  }

  return (
    <Card className="rounded-2xl border-border/70">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />
          Build a practice set
        </CardTitle>
        <CardDescription>
          Pull random questions from the bank and start immediately.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={generate} className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="practice-category">Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger id="practice-category">
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
            <Label htmlFor="practice-difficulty">Difficulty</Label>
            <Select value={difficulty} onValueChange={setDifficulty}>
              <SelectTrigger id="practice-difficulty">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ANY">Mixed</SelectItem>
                {DIFFICULTIES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {humanizeEnum(value)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="practice-count">Questions</Label>
            <Input
              id="practice-count"
              type="number"
              min={5}
              max={50}
              value={questionCount}
              onChange={(event) => setQuestionCount(event.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="practice-duration">Time limit (minutes)</Label>
            <Input
              id="practice-duration"
              type="number"
              min={5}
              max={180}
              value={durationMin}
              onChange={(event) => setDurationMin(event.target.value)}
            />
          </div>

          <Button type="submit" loading={loading} className="sm:col-span-2">
            Generate and start
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
