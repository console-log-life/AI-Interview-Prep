"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  CheckCircle2,
  Play,
  RotateCcw,
  Send,
  Sparkles,
  Terminal,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { CodeEditor } from "@/components/coding/code-editor";
import { CodeReviewPanel } from "@/components/coding/code-review-panel";
import { DifficultyBadge } from "@/components/shared/difficulty-badge";
import { ServiceNotice } from "@/components/shared/service-notice";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { apiPost, errorMessage } from "@/lib/api/client";
import { cn, humanizeEnum, relativeTime } from "@/lib/utils";
import { LANGUAGE_LABELS, type CodeLanguage } from "@/types/user";

type SampleCase = {
  id: string;
  input: string;
  expected: string;
  explanation: string | null;
};

type SubmissionRow = {
  id: string;
  status: string;
  language: string;
  passedTests: number;
  totalTests: number;
  runtimeMs: number | null;
  createdAt: string;
};

type TestResult = {
  index: number;
  isSample: boolean;
  passed: boolean;
  input: string | null;
  expected: string | null;
  actual: string | null;
  stderr: string | null;
};

type RunOutcome = {
  verdict: string;
  stdout: string;
  stderr: string;
  compileOutput: string;
  runtimeMs: number | null;
  memoryKb: number | null;
};

type SubmitOutcome = {
  submissionId: string;
  status: string;
  passedTests: number;
  totalTests: number;
  runtimeMs: number | null;
  memoryKb: number | null;
  stderr: string | null;
  compileOutput: string | null;
  results: TestResult[];
};

type CodingWorkspaceProps = {
  problem: {
    id: string;
    title: string;
    difficulty: "EASY" | "MEDIUM" | "HARD";
    topic: string;
    description: string;
    constraints: string | null;
    inputFormat: string | null;
    outputFormat: string | null;
    timeLimitMs: number;
    memoryLimitKb: number;
    totalTests: number;
    starterCode: Partial<Record<CodeLanguage, string>>;
    samples: SampleCase[];
  };
  submissions: SubmissionRow[];
  executionEnabled: boolean;
  /** False when no AI key is configured — the review tab says so honestly. */
  reviewEnabled: boolean;
  preferredLanguage: CodeLanguage;
};

const LANGUAGES = Object.keys(LANGUAGE_LABELS) as CodeLanguage[];

const VERDICT_META: Record<
  string,
  { label: string; variant: "success" | "destructive" | "warning" }
> = {
  ACCEPTED: { label: "Accepted", variant: "success" },
  WRONG_ANSWER: { label: "Wrong answer", variant: "destructive" },
  TIME_LIMIT_EXCEEDED: { label: "Time limit exceeded", variant: "warning" },
  MEMORY_LIMIT_EXCEEDED: { label: "Memory limit exceeded", variant: "warning" },
  RUNTIME_ERROR: { label: "Runtime error", variant: "destructive" },
  COMPILE_ERROR: { label: "Compile error", variant: "destructive" },
  INTERNAL_ERROR: { label: "Sandbox error", variant: "warning" },
};

function Console({ label, body }: { label: string; body: string }) {
  if (!body.trim()) return null;
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <pre className="mt-1 max-h-56 overflow-auto whitespace-pre-wrap rounded-md border bg-muted/50 p-3 text-xs scrollbar-thin">
        <code>{body}</code>
      </pre>
    </div>
  );
}

export function CodingWorkspace({
  problem,
  submissions,
  executionEnabled,
  reviewEnabled,
  preferredLanguage,
}: CodingWorkspaceProps) {
  const router = useRouter();
  const [language, setLanguage] = useState<CodeLanguage>(preferredLanguage);
  const [code, setCode] = useState(
    problem.starterCode[preferredLanguage] ?? "",
  );
  const [stdin, setStdin] = useState(problem.samples[0]?.input ?? "");
  const [running, setRunning] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [runOutcome, setRunOutcome] = useState<RunOutcome | null>(null);
  const [submitOutcome, setSubmitOutcome] = useState<SubmitOutcome | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState("testcases");

  function switchLanguage(next: CodeLanguage) {
    // Only replace the buffer when it is still untouched starter code, so a
    // stray click on the language selector cannot destroy real work.
    const currentStarter = problem.starterCode[language] ?? "";
    if (code.trim() === currentStarter.trim() || code.trim() === "") {
      setCode(problem.starterCode[next] ?? "");
    }
    setLanguage(next);
  }

  function resetCode() {
    setCode(problem.starterCode[language] ?? "");
    toast.info("Editor reset to the starter template.");
  }

  async function run() {
    setRunning(true);
    setError(null);
    setSubmitOutcome(null);
    try {
      const result = await apiPost<RunOutcome>(
        `/api/coding/${problem.id}/run`,
        { language, code, stdin },
      );
      setRunOutcome(result);
      setTab("output");
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setRunning(false);
    }
  }

  async function submit() {
    setSubmitting(true);
    setError(null);
    setRunOutcome(null);
    try {
      const result = await apiPost<SubmitOutcome>(
        `/api/coding/${problem.id}/submit`,
        { language, code },
      );
      setSubmitOutcome(result);
      setTab("output");
      if (result.status === "ACCEPTED") {
        toast.success(
          `Accepted — all ${result.totalTests} test cases passed.`,
        );
      } else {
        toast.error(
          `${VERDICT_META[result.status]?.label ?? result.status} — ${result.passedTests}/${result.totalTests} passed.`,
        );
      }
      router.refresh();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Left: problem statement */}
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center gap-2">
              <DifficultyBadge difficulty={problem.difficulty} />
              <Badge variant="secondary">{problem.topic}</Badge>
              <Badge variant="outline">
                {problem.timeLimitMs / 1000}s · {Math.round(problem.memoryLimitKb / 1024)} MB
              </Badge>
            </div>
            <CardTitle className="mt-1">{problem.title}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="whitespace-pre-wrap text-sm leading-relaxed text-pretty">
              {problem.description}
            </div>

            {problem.inputFormat && (
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Input
                </h3>
                <p className="mt-1 whitespace-pre-wrap text-sm">
                  {problem.inputFormat}
                </p>
              </div>
            )}

            {problem.outputFormat && (
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Output
                </h3>
                <p className="mt-1 whitespace-pre-wrap text-sm">
                  {problem.outputFormat}
                </p>
              </div>
            )}

            {problem.constraints && (
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Constraints
                </h3>
                <pre className="mt-1 whitespace-pre-wrap font-mono text-xs text-muted-foreground">
                  {problem.constraints}
                </pre>
              </div>
            )}

            {problem.samples.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Examples
                </h3>
                {problem.samples.map((sample, index) => (
                  <div key={sample.id} className="rounded-lg border p-3">
                    <p className="text-xs font-medium">Example {index + 1}</p>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      <div>
                        <p className="text-xs text-muted-foreground">Input</p>
                        <pre className="mt-1 overflow-x-auto rounded bg-muted/60 p-2 font-mono text-xs">
                          {sample.input}
                        </pre>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Output</p>
                        <pre className="mt-1 overflow-x-auto rounded bg-muted/60 p-2 font-mono text-xs">
                          {sample.expected}
                        </pre>
                      </div>
                    </div>
                    {sample.explanation && (
                      <p className="mt-2 text-xs text-muted-foreground text-pretty">
                        {sample.explanation}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {submissions.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Your submissions</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="divide-y">
                {submissions.map((submission) => {
                  const meta = VERDICT_META[submission.status];
                  return (
                    <li
                      key={submission.id}
                      className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
                    >
                      <div className="min-w-0">
                        <p className="text-sm">
                          {LANGUAGE_LABELS[submission.language as CodeLanguage] ??
                            submission.language}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {submission.passedTests}/{submission.totalTests} tests ·{" "}
                          {relativeTime(submission.createdAt)}
                        </p>
                      </div>
                      <Badge variant={meta?.variant ?? "warning"}>
                        {meta?.label ?? humanizeEnum(submission.status)}
                      </Badge>
                    </li>
                  );
                })}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Right: editor + console */}
      <div className="space-y-4">
        {!executionEnabled && (
          <ServiceNotice
            title="Code execution is not configured"
            message="You can write and save code, but Run and Submit need a sandbox. Point the app at a Judge0 instance (self-hosted with Docker, or the RapidAPI-hosted one)."
            envHint={
              'CODE_EXECUTION_PROVIDER="judge0"\nJUDGE0_URL="http://localhost:2358"'
            }
          />
        )}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Label htmlFor="language" className="sr-only">
              Language
            </Label>
            <Select
              value={language}
              onValueChange={(value) => switchLanguage(value as CodeLanguage)}
            >
              <SelectTrigger id="language" className="w-[150px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LANGUAGES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {LANGUAGE_LABELS[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="ghost" size="sm" onClick={resetCode}>
              <RotateCcw aria-hidden="true" />
              Reset
            </Button>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={run}
              loading={running}
              disabled={!executionEnabled || submitting}
            >
              <Play aria-hidden="true" />
              Run
            </Button>
            <Button
              size="sm"
              onClick={submit}
              loading={submitting}
              disabled={!executionEnabled || running}
            >
              <Send aria-hidden="true" />
              Submit
            </Button>
          </div>
        </div>

        <CodeEditor language={language} value={code} onChange={setCode} />

        {error && (
          <Alert variant="destructive">
            <AlertCircle aria-hidden="true" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <Card>
          <CardContent className="p-4">
            <Tabs value={tab} onValueChange={setTab}>
              <TabsList>
                <TabsTrigger value="testcases">Custom input</TabsTrigger>
                <TabsTrigger value="output">
                  <Terminal className="h-3.5 w-3.5" aria-hidden="true" />
                  Output
                </TabsTrigger>
                <TabsTrigger value="review" disabled={!submitOutcome}>
                  <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                  AI review
                </TabsTrigger>
              </TabsList>

              <TabsContent value="testcases" className="space-y-2">
                <Label htmlFor="stdin">Standard input</Label>
                <Textarea
                  id="stdin"
                  value={stdin}
                  onChange={(event) => setStdin(event.target.value)}
                  rows={5}
                  maxLength={10000}
                  className="font-mono text-xs"
                  placeholder="Input passed to your program on stdin when you press Run."
                />
              </TabsContent>

              <TabsContent value="output" className="space-y-4">
                {!runOutcome && !submitOutcome && (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    Run or submit your code to see output here.
                  </p>
                )}

                {runOutcome && (
                  <div className="space-y-3" aria-live="polite">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge
                        variant={
                          VERDICT_META[runOutcome.verdict]?.variant ?? "warning"
                        }
                      >
                        {VERDICT_META[runOutcome.verdict]?.label ??
                          humanizeEnum(runOutcome.verdict)}
                      </Badge>
                      {runOutcome.runtimeMs !== null && (
                        <span className="text-xs text-muted-foreground">
                          {runOutcome.runtimeMs} ms
                        </span>
                      )}
                      {runOutcome.memoryKb !== null && (
                        <span className="text-xs text-muted-foreground">
                          {Math.round(runOutcome.memoryKb / 1024)} MB
                        </span>
                      )}
                    </div>
                    <Console label="Output" body={runOutcome.stdout} />
                    <Console label="Errors" body={runOutcome.stderr} />
                    <Console
                      label="Compiler output"
                      body={runOutcome.compileOutput}
                    />
                  </div>
                )}

                {submitOutcome && (
                  <div className="space-y-4" aria-live="polite">
                    <div
                      className={cn(
                        "flex items-center gap-3 rounded-lg border p-4",
                        submitOutcome.status === "ACCEPTED"
                          ? "border-success/50 bg-success/10"
                          : "border-destructive/50 bg-destructive/10",
                      )}
                    >
                      {submitOutcome.status === "ACCEPTED" ? (
                        <CheckCircle2
                          className="h-5 w-5 text-success"
                          aria-hidden="true"
                        />
                      ) : (
                        <XCircle
                          className="h-5 w-5 text-destructive"
                          aria-hidden="true"
                        />
                      )}
                      <div>
                        <p className="text-sm font-semibold">
                          {VERDICT_META[submitOutcome.status]?.label ??
                            humanizeEnum(submitOutcome.status)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {submitOutcome.passedTests} of{" "}
                          {submitOutcome.totalTests} test cases passed
                          {submitOutcome.runtimeMs
                            ? ` · ${submitOutcome.runtimeMs} ms`
                            : ""}
                        </p>
                      </div>
                    </div>

                    <ul className="space-y-2">
                      {submitOutcome.results.map((testResult) => (
                        <li
                          key={testResult.index}
                          className={cn(
                            "rounded-md border p-3 text-xs",
                            testResult.passed
                              ? "border-success/40"
                              : "border-destructive/40",
                          )}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium">
                              Test {testResult.index + 1}
                              {!testResult.isSample && " (hidden)"}
                            </span>
                            <Badge
                              variant={testResult.passed ? "success" : "destructive"}
                            >
                              {testResult.passed ? "Passed" : "Failed"}
                            </Badge>
                          </div>
                          {testResult.isSample && !testResult.passed && (
                            <div className="mt-2 grid gap-2 sm:grid-cols-3">
                              <div>
                                <p className="text-muted-foreground">Input</p>
                                <pre className="mt-0.5 overflow-x-auto rounded bg-muted/60 p-1.5 font-mono">
                                  {testResult.input}
                                </pre>
                              </div>
                              <div>
                                <p className="text-muted-foreground">Expected</p>
                                <pre className="mt-0.5 overflow-x-auto rounded bg-muted/60 p-1.5 font-mono">
                                  {testResult.expected}
                                </pre>
                              </div>
                              <div>
                                <p className="text-muted-foreground">Got</p>
                                <pre className="mt-0.5 overflow-x-auto rounded bg-muted/60 p-1.5 font-mono">
                                  {testResult.actual || "(no output)"}
                                </pre>
                              </div>
                            </div>
                          )}
                          {!testResult.isSample && !testResult.passed && (
                            <p className="mt-1.5 text-muted-foreground">
                              Hidden test inputs aren&apos;t shown — work out the
                              edge case from the constraints.
                            </p>
                          )}
                        </li>
                      ))}
                    </ul>

                    <Console
                      label="Errors"
                      body={submitOutcome.stderr ?? ""}
                    />
                    <Console
                      label="Compiler output"
                      body={submitOutcome.compileOutput ?? ""}
                    />
                  </div>
                )}
              </TabsContent>

              <TabsContent value="review">
                {submitOutcome ? (
                  <CodeReviewPanel
                    // Keyed so a second submission starts a fresh review.
                    key={submitOutcome.submissionId}
                    submissionId={submitOutcome.submissionId}
                    aiEnabled={reviewEnabled}
                  />
                ) : (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    Submit a solution to have it reviewed.
                  </p>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        <Alert variant="info">
          <AlertTitle className="text-xs">How your code is run</AlertTitle>
          <AlertDescription className="text-xs">
            Submissions execute in an isolated external sandbox with its own CPU,
            memory and time limits — never inside this application server.
          </AlertDescription>
        </Alert>
      </div>
    </div>
  );
}
