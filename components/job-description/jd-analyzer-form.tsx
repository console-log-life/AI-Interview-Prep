"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Target } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { apiPost, errorMessage } from "@/lib/api/client";
import { analyzeJobDescriptionSchema } from "@/lib/validation/job-description";

const MIN_LENGTH = 80;

export function JdAnalyzerForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [title, setTitle] = useState("");
  const [company, setCompany] = useState("");
  const [rawText, setRawText] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function analyse(event: React.FormEvent) {
    event.preventDefault();
    setErrors({});

    const parsed = analyzeJobDescriptionSchema.safeParse({
      title,
      company,
      rawText,
    });
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (typeof key === "string" && !next[key]) next[key] = issue.message;
      }
      setErrors(next);
      return;
    }

    setLoading(true);
    try {
      const { id } = await apiPost<{ id: string }>(
        "/api/job-description/analyze",
        parsed.data,
      );
      router.push(`/job-description/${id}`);
    } catch (error) {
      setLoading(false);
      toast.error(errorMessage(error));
    }
  }

  return (
    <Card className="rounded-2xl border-border/70">
      <CardHeader>
        <CardTitle className="type-card-title">Analyse a job posting</CardTitle>
        <CardDescription>
          Paste the description and we&apos;ll match it against your profile and
          resume, then build a study plan for the gaps.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={analyse} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="jd-title">Job title</Label>
              <Input
                id="jd-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Software Engineer, Backend"
                required
                aria-invalid={Boolean(errors.title)}
                aria-describedby={errors.title ? "jd-title-error" : undefined}
              />
              {errors.title && (
                <p id="jd-title-error" className="text-sm text-destructive">
                  {errors.title}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="jd-company">Company (optional)</Label>
              <Input
                id="jd-company"
                value={company}
                onChange={(event) => setCompany(event.target.value)}
                placeholder="Acme Corp"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="jd-text">Job description</Label>
            <Textarea
              id="jd-text"
              value={rawText}
              onChange={(event) => setRawText(event.target.value)}
              rows={14}
              maxLength={20000}
              placeholder="Paste the full job description here — responsibilities, requirements, everything."
              required
              aria-invalid={Boolean(errors.rawText)}
              aria-describedby="jd-text-hint"
              className="font-mono text-xs"
            />
            <p
              id="jd-text-hint"
              className="flex items-center justify-between text-xs text-muted-foreground"
            >
              <span>
                {errors.rawText ??
                  `Paste at least ${MIN_LENGTH} characters for a useful analysis.`}
              </span>
              <span className="tabular-nums">
                {rawText.length.toLocaleString()} / 20,000
              </span>
            </p>
          </div>

          <Button
            type="submit"
            loading={loading}
            disabled={rawText.trim().length < MIN_LENGTH}
          >
            <Target aria-hidden="true" />
            Analyse and build my plan
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
