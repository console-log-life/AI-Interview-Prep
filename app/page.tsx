import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  Bot,
  Braces,
  CheckCircle2,
  ClipboardList,
  FileText,
  Gauge,
  ListChecks,
  MessageSquareQuote,
  Sparkles,
  Target,
} from "lucide-react";

import { MarketingFooter } from "@/components/layout/marketing-footer";
import { MarketingHeader } from "@/components/layout/marketing-header";
import { ScoreRing } from "@/components/shared/score-ring";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

const FEATURES = [
  {
    icon: Bot,
    title: "Adaptive AI interviewer",
    body: "No fixed script. Every question is chosen from your last answer, your resume and your target role — including follow-ups when an answer is half right.",
  },
  {
    icon: MessageSquareQuote,
    title: "Answer-level feedback",
    body: "Each answer is scored on correctness, depth, structure and clarity, with the specific points a strong answer would have covered.",
  },
  {
    icon: ClipboardList,
    title: "Timed assessments",
    body: "Thirteen categories from DSA to HR, with a server-enforced timer, mark-for-review, autosave and a topic-by-topic result breakdown.",
  },
  {
    icon: Braces,
    title: "Coding practice",
    body: "Monaco editor, four languages, sample and hidden test cases, and execution in an isolated sandbox — never on the app server.",
  },
  {
    icon: FileText,
    title: "Resume intelligence",
    body: "Upload a PDF and get a structured, fully editable profile. Your interviews then ask about your real projects, not hypothetical ones.",
  },
  {
    icon: Target,
    title: "Job description matching",
    body: "Paste a posting and see a skill-by-skill match, what's missing, and a dated preparation roadmap built around the gaps.",
  },
];

const STEPS = [
  {
    step: "01",
    title: "Build your profile",
    body: "Add your target role, skills and education, then upload your resume so the AI knows who it is interviewing.",
  },
  {
    step: "02",
    title: "Practise",
    body: "Run mock interviews, take timed assessments and solve coding problems. Everything is scored and stored.",
  },
  {
    step: "03",
    title: "Read the feedback",
    body: "Get a per-answer breakdown and an end-of-interview report covering technical depth, communication and structure.",
  },
  {
    step: "04",
    title: "Fix the weak areas",
    body: "The recommendation engine watches your topic scores and tells you exactly what to practise next — then you repeat.",
  },
];

const MODULES = [
  {
    icon: Bot,
    title: "AI mock interview",
    points: [
      "Six round types: HR, technical, behavioural, coding, mixed and system design",
      "Four interviewer personalities, from friendly to stress interview",
      "Full transcript persisted — refresh or close the tab and resume exactly where you left off",
      "STAR-structure scoring on behavioural answers",
    ],
  },
  {
    icon: ListChecks,
    title: "Assessments",
    points: [
      "MCQ, multi-select and true/false across 13 categories",
      "Server-side timer with auto-submit — the browser clock is display only",
      "Answers autosave, so a refresh never costs you progress",
      "Results break down by topic and by difficulty, with explanations",
    ],
  },
  {
    icon: BarChart3,
    title: "Progress & recommendations",
    points: [
      "A readiness score weighted across interviews, assessments and coding",
      "Real dated history — never an invented trend line",
      "Weak-area detection driven by rolling per-topic averages",
      "Achievements unlocked only by genuine activity",
    ],
  },
];

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <MarketingHeader />

      <main id="main-content" className="flex-1">
        {/* ---------------------------------------------------------- Hero */}
        <section className="gradient-hero relative overflow-hidden border-b">
          {/* The grid stays, far fainter, under the gradient — it gives the
              wash something to sit on without reading as a spreadsheet. */}
          <div
            className="surface-grid pointer-events-none absolute inset-0 opacity-[0.15]"
            aria-hidden="true"
          />
          <div className="container relative py-24 md:py-32">
            <div className="mx-auto max-w-3xl text-center">
              <span className="brand-chip mb-5">
                <Sparkles className="h-3 w-3" aria-hidden="true" />
                Built for campus and early-career hiring
              </span>

              <h1 className="text-balance text-[2.5rem] font-bold leading-[1.08] tracking-tight sm:text-6xl md:text-7xl">
                Prepare smarter.
                <br className="hidden sm:block" />{" "}
                {/* The one place the gradient is allowed to touch type. */}
                <span className="bg-gradient-to-br from-primary via-primary to-chart-5 bg-clip-text text-transparent">
                  Interview with confidence.
                </span>
              </h1>

              <p className="mx-auto mt-6 max-w-2xl text-pretty text-lg leading-relaxed text-muted-foreground sm:text-xl">
                An adaptive AI interviewer, a skill ledger that knows what you
                keep forgetting, and a readiness score that tells you the truth
                about how prepared you actually are.
              </p>

              <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <Button
                  asChild
                  size="lg"
                  className="gradient-cta h-12 rounded-full px-7 text-base text-white shadow-lg transition-transform hover:scale-[1.02] hover:shadow-xl"
                >
                  <Link href="/register">
                    Start preparing
                    <ArrowRight aria-hidden="true" />
                  </Link>
                </Button>
                <Button
                  asChild
                  size="lg"
                  variant="outline"
                  className="h-12 rounded-full border-2 bg-card px-7 text-base"
                >
                  <Link href="#features">Explore features</Link>
                </Button>
              </div>

              <p className="mt-4 text-sm text-muted-foreground">
                No credit card. Your practice data stays private to your account.
              </p>
            </div>

            {/* A real component from the product, rendered with illustrative
                numbers and labelled as an example — never presented as a
                specific person's results. */}
            <div className="mx-auto mt-16 max-w-2xl">
              <div className="surface overflow-hidden shadow-lg">
                <div className="flex items-center justify-between border-b bg-muted/40 px-5 py-3">
                  <span className="eyebrow">Interview readiness</span>
                  <span className="text-xs text-muted-foreground">Example</span>
                </div>
                <div className="grid gap-6 p-6 sm:grid-cols-[auto,1fr] sm:items-center">
                  <div className="flex justify-center">
                    <ScoreRing score={76} label="Readiness" />
                  </div>
                  <div className="space-y-3">
                    {[
                      { label: "Interviews", value: 82 },
                      { label: "Assessments", value: 74 },
                      { label: "Coding", value: 61 },
                    ].map((pillar) => (
                      <div key={pillar.label} className="space-y-1">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">
                            {pillar.label}
                          </span>
                          <span className="font-medium tabular-nums">
                            {pillar.value}%
                          </span>
                        </div>
                        <Progress
                          value={pillar.value}
                          aria-label={`${pillar.label} ${pillar.value} percent`}
                        />
                      </div>
                    ))}
                    <p className="pt-1 text-xs text-muted-foreground">
                      Evidence confidence: <strong>High</strong> — discounted for
                      practice volume, breadth and recency.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <dl className="mx-auto mt-16 grid max-w-3xl grid-cols-2 gap-x-6 gap-y-8 sm:grid-cols-4">
              {[
                { value: "13", label: "Question categories" },
                { value: "6", label: "Interview round types" },
                { value: "4", label: "Interviewer personalities" },
                { value: "4", label: "Coding languages" },
              ].map((stat) => (
                <div key={stat.label} className="text-center">
                  <dt className="sr-only">{stat.label}</dt>
                  <dd>
                    <span className="block font-display text-4xl font-bold tabular-nums text-foreground">
                      {stat.value}
                    </span>
                    <span className="mt-1 block text-sm text-muted-foreground">
                      {stat.label}
                    </span>
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {/* ------------------------------------------------------ Features */}
        <section id="features" className="border-b py-20 md:py-28">
          <div className="container">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-3xl font-semibold tracking-tight text-balance">
                Everything the interview actually tests
              </h2>
              <p className="mt-3 text-muted-foreground text-pretty">
                Six modules that work together — what you learn in one shows up
                in the recommendations for the next.
              </p>
            </div>

            <div className="mt-14 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map((feature) => (
                <Card
                  key={feature.title}
                  className="rounded-2xl border-border/70 transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-lg"
                >
                  <CardHeader>
                    <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                      <feature.icon
                        className="h-5 w-5 text-primary"
                        aria-hidden="true"
                      />
                    </div>
                    <CardTitle className="type-card-title">{feature.title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm leading-relaxed text-muted-foreground text-pretty">
                      {feature.body}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* -------------------------------------------------- How it works */}
        <section id="how-it-works" className="border-b bg-muted/40 py-20 md:py-28">
          <div className="container">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl">
                A loop, not a one-off test
              </h2>
              <p className="mt-3 text-muted-foreground text-pretty">
                Practise, get scored, find the weak spot, fix it, measure the
                improvement. That cycle is the whole product.
              </p>
            </div>

            <ol className="mt-14 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
              {STEPS.map((item) => (
                <li key={item.step}>
                  <Card className="h-full rounded-2xl border-border/70 bg-card shadow-sm">
                    <CardHeader>
                      <span
                        className="icon-badge mb-1 font-display text-sm font-bold"
                        aria-hidden="true"
                      >
                        {item.step}
                      </span>
                      <CardTitle className="type-card-title">{item.title}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm leading-relaxed text-muted-foreground text-pretty">
                        {item.body}
                      </p>
                    </CardContent>
                  </Card>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* --------------------------------------------------- Deep modules */}
        <section id="modules" className="border-b py-20 md:py-28">
          <div className="container">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-3xl font-semibold tracking-tight text-balance">
                Inside the three core modules
              </h2>
              <p className="mt-3 text-muted-foreground text-pretty">
                Where most of the engineering went.
              </p>
            </div>

            <div className="mt-14 grid gap-6 lg:grid-cols-3">
              {MODULES.map((module) => (
                <Card key={module.title} className="h-full">
                  <CardHeader>
                    <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                      <module.icon
                        className="h-5 w-5 text-primary"
                        aria-hidden="true"
                      />
                    </div>
                    <CardTitle className="type-card-title">{module.title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2.5">
                      {module.points.map((point) => (
                        <li key={point} className="flex gap-2.5 text-sm">
                          <CheckCircle2
                            className="mt-0.5 h-4 w-4 shrink-0 text-success"
                            aria-hidden="true"
                          />
                          <span className="text-muted-foreground text-pretty">
                            {point}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* ------------------------------------------------------- Honesty */}
        <section className="border-b bg-muted/30 py-16">
          <div className="container">
            <div className="mx-auto flex max-w-3xl flex-col items-start gap-4 rounded-2xl border bg-card p-6 shadow-sm sm:flex-row sm:items-center">
              <Gauge className="h-8 w-8 shrink-0 text-primary" aria-hidden="true" />
              <div>
                <h2 className="text-base font-semibold">
                  Your numbers are real numbers
                </h2>
                <p className="mt-1 text-sm text-muted-foreground text-pretty">
                  A new account shows empty states, not sample charts. Every
                  score, streak and achievement on your dashboard comes from
                  something you actually did. PrepPilot is a preparation tool —
                  it never makes or predicts a hiring decision.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ----------------------------------------------------------- CTA */}
        <section className="py-20 md:py-28">
          <div className="container">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-balance text-3xl font-bold tracking-tight sm:text-5xl">
                Your next interview is a practice session away
              </h2>
              <p className="mt-4 text-muted-foreground text-pretty">
                Create an account, set your target role, and run your first mock
                interview in under five minutes.
              </p>
              <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <Button
                  asChild
                  size="lg"
                  className="gradient-cta h-12 rounded-full px-7 text-base text-white shadow-lg transition-transform hover:scale-[1.02] hover:shadow-xl"
                >
                  <Link href="/register">
                    Create your account
                    <ArrowRight aria-hidden="true" />
                  </Link>
                </Button>
                <Button
                  asChild
                  size="lg"
                  variant="outline"
                  className="h-12 rounded-full border-2 bg-card px-7 text-base"
                >
                  <Link href="/login">I already have one</Link>
                </Button>
              </div>
            </div>
          </div>
        </section>
      </main>

      <MarketingFooter />
    </div>
  );
}
