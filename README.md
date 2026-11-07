# PrepPilot — AI-Powered Mock Interview & Assessment Platform

**Practice smarter. Interview better.**

AI-powered mock interviews, assessments, coding practice, and personalized
feedback in one platform. Built as a B.Tech major project.

---

## Table of contents

1. [Project overview](#project-overview)
2. [Features](#features)
3. [Tech stack](#tech-stack)
4. [Architecture](#architecture)
5. [Folder structure](#folder-structure)
6. [Getting started](#getting-started)
7. [Demo flow](#demo-flow)
8. [Environment variables](#environment-variables)
9. [Database setup](#database-setup)
10. [Authentication setup](#authentication-setup)
11. [AI setup](#ai-setup)
12. [Storage setup](#storage-setup)
13. [Code execution setup](#code-execution-setup)
14. [Development commands](#development-commands)
15. [Testing](#testing)
16. [Deployment](#deployment)
17. [Security notes](#security-notes)
18. [AI safety](#ai-safety)
19. [Known limitations](#known-limitations)
20. [Future improvements](#future-improvements)

---

## Project overview

PrepPilot closes a loop that most interview-prep tools leave open:

```
REGISTER → PROFILE → RESUME → TARGET ROLE → DASHBOARD
    → MOCK INTERVIEW → AI EVALUATION → REPORT
        → WEAKNESS DETECTION → RECOMMENDATIONS
            → ASSESSMENT / CODING → MEASURED IMPROVEMENT ↺
```

Each module feeds the next. A weak SQL answer in a mock interview lowers your
SQL topic average, which triggers a recommendation, which points you at a SQL
assessment, whose result updates the same average — and the progress chart
shows whether it actually moved.

V2 closes a second loop on top of it — the platform now *remembers*:

```
ANSWER → SKILL OBSERVATION → RECENCY-WEIGHTED SCORE + CONFIDENCE
    → MISTAKE CONCEPT (deduplicated, counted)
        → ADAPTIVE NEXT QUESTION  ↺
        → READINESS (discounted by evidence, penalised by repetition)
            → GROUNDED COACH / ROADMAP / TODAY'S PLAN ↺
```

**Design principle: no fake data.** A new account shows empty states, not
sample charts. Every score, streak, achievement and trend line is derived from
something the user actually did.

**V2 corollary: no fake confidence.** A high score from thin evidence is
displayed as exactly that — the score, the confidence, and the reasons — rather
than being rounded up into "you're ready".

---

## Features

### AI mock interview

- Six round types: HR, Technical, Behavioural, Coding, Mixed, System Design
- Four interviewer personalities: Friendly, Professional, Strict, Stress
- **Dynamic question selection** — no fixed script. Each question is chosen
  from the transcript, the candidate's resume/profile, the target role, and the
  model's private evaluation of the previous answer
- **Adaptive follow-ups** — a partially correct answer (score 3–6) with an
  identified gap triggers a follow-up on the same topic rather than a new one
- **Full state persistence** — every message is a database row. Refresh, close
  the tab, or switch device and the interview resumes exactly where it was
- Per-answer evaluation with sub-scores, missing points, and a restructured
  version of the candidate's own answer
- End-of-interview report across five categories with a radar chart

### Assessments

- 13 categories: DSA, DBMS, OOP, OS, Networks, Java, Python, JavaScript,
  Aptitude, Logical Reasoning, HR, Behavioural, System Design
- Question types: MCQ, multi-select, true/false, short answer
- **Server-enforced timer.** The browser countdown is display-only; the
  `expiresAt` column is the only authority and is re-checked on submit
- Debounced answer autosave, mark-for-review, question navigator, auto-submit
- Results break down by topic and by difficulty, with explanations
- Ad-hoc practice-set generator that pulls random questions from the bank

### Coding

- Monaco editor, four languages (Python, Java, C++, JavaScript)
- Sample and hidden test cases — hidden inputs are redacted server-side
- Run against custom input, or submit against the full suite
- Submission history with verdict, runtime and memory
- **Execution never happens in the Next.js process** — it goes through a
  `CodeExecutionProvider` into an external sandbox

### Resume

- PDF upload → storage → text extraction → AI analysis → **editable** profile
- Every extracted field is a real form input the user can correct; saving marks
  the record `userVerified`
- Extracted skills are merged into the profile, never overwriting the user's own
- Downloads go through an authenticated, ownership-checked route

### Job description matching

- Paste a posting; get a skill-by-skill match (Strong / Medium / Weak / Missing)
  with evidence, an overall preparation-match score, missing skills, and a
  dated study roadmap
- Gaps found here feed directly into the recommendation engine

### Progress & gamification

- Readiness score weighted 45/30/25 across interviews, assessments and coding,
  scaled by an evidence factor so one lucky attempt cannot read as "92% ready"
- Real dated history from stored `ProgressSnapshot` rows
- Rolling per-topic averages drive weak-area detection
- 12 achievements, unlocked only by measured activity

### Skill intelligence (V2)

- A ~50-node skill graph (`lib/skills/graph.ts`) seeded into `SkillNode`
- Every graded answer writes a `SkillObservation`; scores are recomputed from
  the raw ledger, never incrementally patched
- **Recency-weighted** with a 30-day half-life, so a score you can no longer
  reproduce fades instead of propping up the number
- **Confidence is reported separately from score.** One lucky answer produces a
  high score with *low confidence*, and the UI shows both
- Observations propagate up the graph with decay, so "SQL joins" also moves
  "DBMS" — by less

### Mistake memory (V2)

- Free-text evaluator output is normalised onto stable concept slugs, so two
  phrasings of the same error collapse and increment one counter
- ACTIVE → IMPROVING → RESOLVED transitions are functions of elapsed time
- A recurrence reopens a resolved mistake
- Repeated mistakes cost real readiness points (capped at 8)

### Adaptive interview engine (V2)

- The interview is a state machine, not a fixed question list
- Each graded answer updates difficulty, streaks, mastered/struggling topics
  and a rolling skill estimate
- The engine — not the model — decides `FOLLOW_UP` / `PROBE_FUNDAMENTALS` /
  `DEEPEN` / `PROBE_CLAIM` / `NEW_TOPIC` / `FINISH`
- Follow-up depth is hard-capped, with a test driving twenty consecutive weak
  answers to prove chains terminate

### Resume claim verification (V2)

- Claims are extracted from the resume ("Built a REST API in Node.js")
- Unverified claims become probe targets the interview works through
- The answer to a claim probe marks it VERIFIED / PARTIAL / UNCLEAR / WEAK
- Claims never probed stay UNVERIFIED — a neutral state, never a penalty

### AI coach & roadmap (V2)

- Every coach reply is grounded in `buildGrounding(userId)` — the measured
  facts. Anything not in the grounding pack cannot be asserted
- The grounding snapshot is stored with the reply, so an answer can be audited
- `citedFacts` are rendered, so the user can see the numbers behind a claim
- 7/14/30/60/90-day roadmaps
- **Today's plan is rule-based and works with no API key at all**

### Spaced practice (V2)

- **Enrolment is automatic.** A mistake that has recurred, or a skill measured
  weak with enough confidence, joins the queue on its own — nobody builds
  flashcards for their own weaknesses
- An SM-2 variant with a four-button grade. The ease factor adapts per item, so
  a concept you keep forgetting comes back faster than one you find dull
- `AGAIN` always returns an item to a one-day interval, but **never resets the
  review history** — wiping it would disguise a genuinely hard concept as new
- Intervals are capped at 120 days: a six-month gap on interview prep is
  indistinguishable from "never again"
- Grading is explicitly **your own** assessment of recall. It schedules the
  next review and is deliberately kept out of your skill scores, which only
  ever come from graded answers
- `/practice` is the full queue; the dashboard shows a preview slice with a
  link through, and reports the true due count rather than the slice size

### Communication coaching (V2)

- Scores how an answer was *delivered* — clarity, structure, conciseness,
  technical explanation — separately from whether it was correct
- **STAR is only scored where STAR was expected.** A behavioural question in a
  mixed round gets STAR coaching; a hash-collision question does not, and the
  aggregate says so rather than reporting a meaningless gap
- Opt-in per answer, so a candidate spends the AI call on the two answers they
  know were shaky instead of paying for all eight

### What each interview changed (V2)

The report ends with the rows that session actually wrote: skills measured with
their per-skill means, mistakes recorded with their lifetime frequency ("3rd
time"), and resume claims tested with their new verification status. It is
rendered even when the AI summary itself failed, because the measurements are
real regardless.

### Job-specific readiness (V2)

Shown next to — never merged into — the AI's resume match score, because they
answer different questions. `matchScore` compares your *resume text* to the
posting; measured readiness compares your *results* to it. When the resume
reads more than 15 points stronger than the evidence, the page says so plainly:
that gap is what an interviewer will probe.

### Voice interviews (V2, optional)

- Provider abstractions for speech-to-text (Deepgram, Whisper) and
  text-to-speech (ElevenLabs)
- Speech metrics are computed only from what the provider actually returned:
  without word timings, pause metrics are reported as unavailable, not guessed
- **There is no fallback that fabricates a transcript.** Unconfigured means the
  control is hidden and the API returns a typed 503

### Admin

- Platform stats, signup trend, popular categories and roles
- Full question-bank CRUD with type-aware validation
- Assessment publish/unpublish (refuses to delete anything with attempts)
- User role and status management (an admin cannot demote themselves)
- **Interview activity is metadata-only** — admins never see transcripts
- **Content studio (V2):** AI question generation behind a quality gate —
  banned patterns, no/multiple correct answers, duplicate and near-duplicate
  detection. Generated questions land PENDING and inactive until approved
- **AI observability (V2):** per-feature call counts, latency, token spend and
  failure categories. Only metadata is stored — never prompt or completion text
- **Audit trail (V2):** append-only log of role changes, question edits and
  review decisions, with the actor's email denormalised so the record survives
  account deletion

---

## Tech stack

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js 15 (App Router) | Server Components, route handlers, one deployable |
| Language | TypeScript (strict) | Zero `any` in application code |
| Styling | Tailwind CSS 3 + shadcn/ui | Owned components, no runtime UI dependency |
| Database | PostgreSQL + Prisma 6 | Relational data, typed client, migrations |
| Auth | Auth.js v5 (NextAuth) + Prisma adapter | Credentials, JWT sessions, role-based access |
| AI | Anthropic Claude via `@anthropic-ai/sdk` | Structured JSON output |
| Validation | Zod | One schema validates client, server and AI output |
| Charts | Recharts | |
| Editor | Monaco (`@monaco-editor/react`) | Lazy-loaded client-side |
| PDF | `unpdf` | Serverless-friendly pdf.js build |
| Testing | Vitest | |

### Why Auth.js instead of Clerk

The spec suggested Clerk. Auth.js was chosen deliberately:

1. **The app must run with zero third-party keys.** Clerk hard-fails every
   route without live API keys — no local development, no viva demo, no
   `npm run build`. Auth.js needs only `DATABASE_URL` and `AUTH_SECRET`.
2. **`/login` and `/register` are first-party pages** in the required route
   list, which is the credentials pattern, not Clerk's hosted flow.
3. **Viva-explainability.** bcrypt hashing, JWT sessions, and middleware
   authorisation are visible in this repository and can be walked through.

Auth lives behind `lib/auth/`, so swapping providers touches `auth.ts`,
`lib/auth/config.ts` and `middleware.ts` and nothing else.

---

## Architecture

### Layering

```
   React components (app/, components/)
              ↓  never import Prisma or the AI SDK
   Route handlers / server components  (app/api/**, app/**/page.tsx)
              ↓  requireUser() → Zod parse → service call
   Services      (lib/interviews, lib/resume, lib/coding, …)
              ↓
   Queries + Providers  (lib/db/queries/**, lib/ai, lib/storage, lib/coding)
              ↓
   PostgreSQL   |   Anthropic   |   S3/disk   |   Judge0
```

A component never queries the database and never calls the AI SDK. Every
mutation goes: **route handler → auth guard → Zod validation → service →
query/provider**.

### The AI abstraction

`types/ai.ts` declares the `AIService` interface:

```ts
interface AIService {
  generateInterviewQuestion(ctx): Promise<GeneratedQuestion>;
  generateFollowUpQuestion(ctx): Promise<GeneratedQuestion>;
  evaluateInterviewAnswer(ctx): Promise<AnswerEvaluation>;
  generateInterviewReport(ctx): Promise<InterviewReportPayload>;
  analyzeResume(text): Promise<ResumeAnalysis>;
  analyzeJobDescription(ctx): Promise<JobDescriptionAnalysis>;
  generateRecommendations(ctx): Promise<AiRecommendation[]>;
  // V2
  extractResumeClaims(text): Promise<ExtractedClaim[]>;
  reviewCode(ctx): Promise<CodeReviewResult>;
  coach(ctx): Promise<CoachReply>;
  generateRoadmap(ctx): Promise<GeneratedRoadmap>;
  generateQuestions(ctx): Promise<GeneratedQuestionItem[]>;
  analyzeCommunication(ctx): Promise<CommunicationResult>;
}
```

- `lib/ai/client.ts` is the only file in the repository that imports
  `@anthropic-ai/sdk`
- `lib/ai/prompts.ts` and `lib/ai/prompts-v2.ts` hold every prompt — one place
  to audit AI-safety rules
- `lib/ai/schemas.ts` and `lib/ai/schemas-v2.ts` hold **two** layers per call: a
  JSON Schema that constrains generation, and a Zod schema that validates what
  comes back. The JSON Schema is the request; **Zod is the trust boundary**
- `lib/ai/index.ts` is a provider registry. Adding a provider = one class +
  one switch case
- `lib/ai/observability.ts` records call metadata only — provider, model,
  latency, tokens, error category. Never prompt or completion text

The same registry pattern is used four times: `AIService`,
`CodeExecutionProvider`, `StorageProvider`, and the voice
`SpeechToTextProvider` / `TextToSpeechProvider`. In every case an unconfigured
provider throws a typed 503 naming the environment variable to set — it never
degrades into fabricated output.

`tests/integration/interview-flow.test.ts` and
`tests/integration/service-availability.test.ts` exercise the whole flow
against a fake `AIService` — no API key, no network.

### The grounding pack

`buildGrounding(userId)` in `lib/analytics/service.ts` is the single place that
decides what the AI is allowed to assert about a candidate. Anything it does
not return cannot be claimed by the coach or the roadmap generator. Unknown
values are reported as zero or empty rather than estimated, so the model can
say *"you have not practised this"* instead of inventing a number.

### Two-layer validation

Every Zod schema in `lib/validation/` runs **twice**: once in the browser for
instant feedback, once on the server as the actual gate. The client copy is a
convenience; the server copy is the security control.

### Recommendation engine

`lib/recommendations/engine.ts` is a **declarative rule list**, not a chain of
`if (topic === "SQL")` branches:

```ts
type Rule = { id: string; evaluate: (signals: SignalSet) => Recommendation[] };
```

Six rules cover weak topics, JD gaps, onboarding, first-run nudges,
re-engagement, and levelling up. Results are de-duplicated by `(kind, topic)`,
sorted by priority and capped. Adding a behaviour means appending one rule.

Every recommendation cites the number that produced it — *"You are averaging
42% on SQL joins across 3 attempts"* — never a generic tip.

### Readiness V2

`lib/analytics/readiness.ts` separates three things V1 conflated:

```
score      — how well you are performing
evidence   — how much we actually know (breadth + volume + recency)
penalties  — active repeated mistakes and stale practice

readiness = rawPerformance × evidenceFactor − mistakePenalty
```

`confidence` is returned alongside, never folded in. A 100% raw performance
from one interview surfaces as a headline well under 60 with LOW confidence,
plus the plain-English `explanations[]` that produced it — all rendered in the
UI. Pillars with no data are renormalised out rather than scored zero, so never
having coded does not silently cost you a third of the mark.

### Database design

44 models. Everything queried, filtered, aggregated or joined is relational.
JSON is used only where the shape is genuinely open-ended (AI evaluation
breakdowns, extracted resume sections, JD analysis) — and even then it is
Zod-validated before it is written.

Notable choices:

- `InterviewMessage.order` — an explicit sequence column, because `createdAt`
  can collide within a millisecond
- `AssessmentAttempt.expiresAt` — the server-side deadline; the client timer
  has no authority
- `TopicPerformance` — a rolling incremental mean, so updating a topic average
  is O(1) regardless of history length
- `ProgressSnapshot` — point-in-time history, so charts show real dated data
  instead of a recomputed guess
- `PracticeActivity` — unique on `(userId, kind, day)`, which makes streaks a
  simple date-sequence scan
- `Achievement` — badges are **rows**, not code. Each names a `metric` and a
  `threshold`; adding a badge is a seed row

---

## Folder structure

```
app/
  (auth)/               login, register  — split layout
  (dashboard)/          all authenticated student routes
    dashboard/  interview/  assessments/  coding/
    resume/  job-description/  progress/  profile/  settings/
    coach/  roadmap/  skills/  practice/               ← V2
  admin/                admin-only routes (own layout + guard)
    content-studio/  observability/                    ← V2
  api/                  route handlers
  layout.tsx  page.tsx  error.tsx  global-error.tsx  not-found.tsx

components/
  ui/          shadcn primitives (owned, not a dependency)
  layout/      shell, nav, header
  shared/      EmptyState, ErrorState, ScoreRing, ScoreBar, StatCard, …
  dashboard/  interview/  assessment/  coding/  resume/
  job-description/  progress/  profile/  settings/  admin/  auth/
  coach/  roadmap/  skills/                            ← V2

lib/
  ai/          client.ts  prompts.ts  schemas.ts  index.ts
               prompts-v2.ts  schemas-v2.ts  observability.ts     ← V2
  auth/        config.ts  password.ts  session.ts
  db/          prisma.ts  queries/{users,profile,questions,assessments,dashboard,admin}.ts
  storage/     types.ts  local.ts  s3.ts  validate.ts  index.ts
  coding/      types.ts  judge0.ts  service.ts  index.ts  review.ts
  voice/       types.ts  providers.ts  metrics.ts  index.ts        ← V2
  assessments/ scoring.ts        ← pure, fully unit-tested
               question-quality.ts  generation.ts                  ← V2
  interview/   adaptive.ts       ← pure state machine, V2
  interviews/  service.ts  report-intelligence.ts
  skills/      graph.ts  scoring.ts  service.ts                     ← V2
  mistakes/    detect.ts  service.ts                                ← V2
  analytics/   readiness.ts  service.ts                             ← V2
               job-readiness.ts  job-requirements.ts                ← V2
  communication/ aggregate.ts  service.ts                           ← V2
  practice/    scheduling.ts  queue.ts  service.ts                  ← V2
  coach/       service.ts                                           ← V2
  roadmap/     service.ts                                           ← V2
  audit/       service.ts                                           ← V2
  dashboard/   intelligence.ts                                      ← V2
  recommendations/ engine.ts  service.ts  achievements.ts
  progress/    service.ts
  resume/      extract.ts  service.ts  claims.ts  claim-labels.ts
  job-description/ service.ts
  validation/  auth  profile  assessment  interview  resume  coding  job-description
  api/         errors.ts  response.ts  client.ts
  env.ts  rate-limit.ts  utils.ts

prisma/    schema.prisma  seed.ts  seed-data/
types/     ai  interview  user  job-description  next-auth.d.ts
hooks/     use-assessment.ts  use-interview.ts
tests/     unit/  integration/  helpers/fake-ai.ts  setup.ts
```

---

## Getting started

### Prerequisites

- Node.js 20+
- PostgreSQL 13+ (local, Docker, Neon, Supabase or Railway)

### Setup

```bash
# 1. Install
npm install

# 2. Environment
cp .env.example .env
#    Then edit .env — at minimum set DATABASE_URL and AUTH_SECRET.
npx auth secret          # generates AUTH_SECRET into .env

# 3. Database
npm run db:migrate       # creates tables
npm run db:seed          # loads questions, assessments, problems, achievements

# 4. Run
npm run dev              # http://localhost:3000
```

### Demo logins (created by the seed, development only)

| Email | Password | Role |
|---|---|---|
| `admin@preppilot.local` | `Password123` | ADMIN |
| `student@preppilot.local` | `Password123` | STUDENT |

The seed skips demo users when `NODE_ENV=production` or `SEED_DEMO_USERS=false`.

### Checks before you demo

```bash
npm run verify        # typecheck + lint + the full test suite
npm run build         # catches anything only the production build sees
```

A missing `DATABASE_URL` or `AUTH_SECRET` now stops the server at startup with
the variable named, rather than failing later inside Prisma or Auth.js.

---

## Demo flow

The order below is the one the product was built around — each step leaves
behind data the next one reads, so the loop is visible rather than asserted.
Sign in as `student@preppilot.local`.

| # | Page | What to show |
|---|---|---|
| 1 | `/dashboard` | A new account shows **empty states, not sample charts**. Worth saying out loud — it is the design rule the rest of the demo pays off. |
| 2 | `/profile` | Set a target role. Everything downstream is scoped to it. |
| 3 | `/resume` | Upload a PDF résumé → extracted profile and verifiable **claims**. |
| 4 | `/job-description` | Paste a real job ad → required skills and a readiness breakdown against your profile. |
| 5 | `/interview/new` | Pick **Mock interview** for voice (needs `AI_PROVIDER=gemini`), or **Chat interview** for text. Voice continues to a device check first. |
| 6 | `/interview/[id]/room` | The live interviewer. Answer one question well and one badly — the follow-up changes because the controller read the answer. |
| 7 | `/interview/[id]/result` | The report: scores, **evidence** quoting what was actually asked and answered, and delivery metrics (pace, fillers, pauses). |
| 8 | `/dashboard` | Return here. Readiness, the daily plan and the recommendations have all moved, driven by step 7. |
| 9 | `/skills` → `/practice` | The weak skill from the interview, and the spaced-practice queue it enrolled. |
| 10 | `/coach` | Ask "what should I work on?" — the answer is grounded in the steps above and will not invent a strength you have not shown. |

### If you have ten minutes

Steps 1, 5, 6, 7, 8. That is the whole loop: measure → report → the numbers
move. Everything else is depth.

### What to avoid demoing without setup

- **Coding Run/Submit** needs `CODE_EXECUTION_PROVIDER=judge0` and a
  `JUDGE0_URL`. Without them the editor loads and the buttons are disabled with
  a setup notice.
- **Voice answers in the chat interview** need `VOICE_STT_PROVIDER`. The live
  voice interview does not — it talks to Gemini directly.
- **`/admin`** needs your email in `ADMIN_EMAILS`.

---

## Environment variables

Full documentation is in `.env.example`. Summary:

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | **Yes** | PostgreSQL connection string |
| `AUTH_SECRET` | **Yes** | JWT signing secret (`npx auth secret`) |
| `AUTH_URL` | Production | Canonical origin |
| `NEXT_PUBLIC_APP_URL` | No | Used in metadata |
| `ADMIN_EMAILS` | No | Comma-separated emails auto-promoted to ADMIN at signup |
| `AI_PROVIDER` | No | Defaults to `anthropic` |
| `ANTHROPIC_API_KEY` | For AI features | Interviews, resume analysis, JD matching |
| `AI_MODEL` | No | Defaults to `claude-opus-5` |
| `AI_EFFORT` | No | `low`\|`medium`\|`high`\|`xhigh`\|`max` — latency/cost dial |
| `STORAGE_PROVIDER` | No | `local` (default) or `s3` |
| `STORAGE_LOCAL_DIR` | No | Defaults to `./storage` |
| `S3_BUCKET` / `S3_REGION` / `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` / `S3_ENDPOINT` | For S3 | Any S3-compatible bucket |
| `CODE_EXECUTION_PROVIDER` | No | `judge0` or `disabled` (default) |
| `JUDGE0_URL` / `JUDGE0_API_KEY` / `JUDGE0_API_HOST` | For coding | Sandbox endpoint |
| `VOICE_STT_PROVIDER` | No | `deepgram` \| `whisper` \| `disabled` (default) |
| `VOICE_STT_API_KEY` / `VOICE_STT_BASE_URL` | For voice input | Speech-to-text credentials |
| `VOICE_TTS_PROVIDER` | No | `elevenlabs` \| `disabled` (default) |
| `VOICE_TTS_API_KEY` | For spoken questions | Text-to-speech credentials |
| `RATE_LIMIT_AI_PER_MINUTE` | No | Defaults to 12 |
| `RATE_LIMIT_UPLOAD_PER_HOUR` | No | Defaults to 10 |
| `RATE_LIMIT_AI_PER_DAY` | No | Per-user daily AI ceiling, defaults to 200 |
| `MAX_INTERVIEW_TURNS` | No | Hard ceiling on interview turns, defaults to 20 |
| `MAX_AI_CONTEXT_CHARS` | No | Prompt-context truncation, defaults to 60000 |

**Missing optional keys never break the app.** The affected feature renders a
clear "not configured" notice with the exact variable to set. Nothing is
replaced by fake output.

### What works with no API keys at all

Everything except AI generation itself: registration, login, profile, the
dashboard's readiness/skills/mistakes intelligence, **today's preparation plan**
(rule-based), **spaced-practice review scheduling**, measured job readiness,
assessments from the seeded question bank, coding practice with
submission history, progress charts, achievements, the skill ledger, the admin
question bank, the review queue and the audit trail.

Requires `ANTHROPIC_API_KEY`: mock interviews, resume and JD analysis, resume
claim extraction, AI code review, the AI coach, multi-week roadmaps and AI
question generation. Requires `CODE_EXECUTION_PROVIDER=judge0`: running and
submitting code. Requires `VOICE_*`: microphone answers and spoken questions.

---

## Database setup

### Local PostgreSQL via Docker

```bash
docker run --name preppilot-db \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=ai_interview_prep \
  -p 5432:5432 -d postgres:16
```

```
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/ai_interview_prep?schema=public"
```

### Commands

```bash
npm run db:migrate    # create/apply a migration (development)
npm run db:deploy     # apply migrations (production)
npm run db:push       # push schema without a migration (prototyping)
npm run db:seed       # idempotent — safe to re-run
npm run db:studio     # browse data in Prisma Studio
```

---

## Authentication setup

1. Generate a secret: `npx auth secret`
2. Register at `/register` — the first account is a STUDENT

### Creating an admin

Either set `ADMIN_EMAILS` **before** registering:

```
ADMIN_EMAILS="you@college.edu"
```

…or promote an existing account:

```bash
npm run db:studio     # open User, set role = ADMIN
```

Once one admin exists, further admins can be promoted from `/admin/users`.

**How it works.** Credentials provider → bcrypt (12 rounds) → JWT session with
`id` and `role` in the token. Three enforcement layers: edge middleware
(`middleware.ts`), `requireAdminPage()` in the admin layout, and
`requireAdmin()` in every admin route handler.

---

## AI setup

Two providers are supported. Pick one with `AI_PROVIDER`; only that provider's
key is needed.

### Google Gemini (default)

Gemini has a free tier, which makes it the practical choice for daily use.

1. Create a key at <https://aistudio.google.com/apikey>
2. In `.env`:

```
AI_PROVIDER="gemini"
GEMINI_API_KEY="..."
AI_MODEL=""          # empty → gemini-2.5-flash
```

### Anthropic Claude

```
AI_PROVIDER="anthropic"
ANTHROPIC_API_KEY="sk-ant-..."
AI_MODEL=""          # empty → claude-opus-5
```

### Switching between them

Change `AI_PROVIDER` and restart. **Leave `AI_MODEL` empty** unless you have a
reason to pin a specific model — it is shared between providers, so a value
left over from the other one (`claude-opus-5` on Gemini, say) will be sent to
the wrong API and rejected. Empty means "use the documented default for the
selected provider".

Verify current model names and free-tier limits before pinning one:
<https://ai.google.dev/gemini-api/docs/models> ·
<https://ai.google.dev/gemini-api/docs/rate-limits>

### Architecture

```
lib/ai/
  provider.ts   BaseAIService — prompts, JSON Schema, Zod, telemetry (shared)
  anthropic.ts  Anthropic transport only
  gemini.ts     Gemini transport only
  index.ts      registry: picks a provider from AI_PROVIDER
  client.ts     compatibility re-export of anthropic.ts
```

A provider implements exactly one method — `complete()`, "send these
instructions, return JSON text". Every capability (13 of them) lives once in
`BaseAIService`, so both providers share the same validation boundary and
switching cannot change what the application accepts into its database.

**No automatic fallback between providers.** If Gemini fails, the request
surfaces an AI-unavailable state and logs an error category. It does not retry
against Anthropic — silently doing so could start billing a paid account on
the strength of an unrelated outage. Cross-provider fallback would have to be
an explicit, configured choice.

### Without a key

Assessments, coding, progress, achievements, the skill ledger, spaced review,
today's plan, admin and auth all work normally. AI pages render a
`ServiceNotice` naming the exact variable the selected provider needs. Nothing
is faked — no invented score, transcript or answer.

### Cost control

`AI_EFFORT` defaults to `low` for conversational turns; report, resume, JD,
coach, roadmap and code review use `medium` internally. On Gemini the dial maps
onto the thinking budget: `low` → `0` (thinking disabled, lowest latency),
anything higher → `-1` (the model decides, since valid ranges are
model-dependent). `RATE_LIMIT_AI_PER_MINUTE`, `RATE_LIMIT_AI_PER_DAY`,
`MAX_INTERVIEW_TURNS` and `MAX_AI_CONTEXT_CHARS` apply identically to both
providers — the limiter sits in the route handlers, above the provider layer.

---

## Storage setup

`STORAGE_PROVIDER=local` (default) writes to `./storage`, which is
git-ignored. Zero setup, ideal for development and a viva demo.

For a serverless deployment, use any S3-compatible bucket:

```
STORAGE_PROVIDER="s3"
S3_BUCKET="preppilot-resumes"
S3_REGION="auto"
S3_ACCESS_KEY_ID="..."
S3_SECRET_ACCESS_KEY="..."
S3_ENDPOINT="https://<account>.r2.cloudflarestorage.com"   # R2/MinIO only
```

The interface is identical, so no calling code changes.

**Resume PDFs are never stored in PostgreSQL** — that would bloat the table,
slow every query on it and make backups painful. Only the storage key lives in
the database.

---

## Code execution setup

User code is arbitrary and hostile by assumption, so it **never runs inside the
Next.js process**. `lib/coding/types.ts` defines `CodeExecutionProvider`;
`lib/coding/judge0.ts` implements it.

### Self-hosted Judge0 (recommended)

```bash
wget https://github.com/judge0/judge0/releases/download/v1.13.1/judge0-v1.13.1.zip
unzip judge0-v1.13.1.zip && cd judge0-v1.13.1
docker compose up -d db redis
sleep 10
docker compose up -d
```

```
CODE_EXECUTION_PROVIDER="judge0"
JUDGE0_URL="http://localhost:2358"
```

### RapidAPI-hosted Judge0

```
CODE_EXECUTION_PROVIDER="judge0"
JUDGE0_URL="https://judge0-ce.p.rapidapi.com"
JUDGE0_API_KEY="your-rapidapi-key"
JUDGE0_API_HOST="judge0-ce.p.rapidapi.com"
```

**Without a sandbox:** problems, the editor and submission history all work;
Run/Submit render a setup notice.

---

## Development commands

```bash
npm run dev          # dev server
npm run build        # prisma generate && next build
npm run start        # production server
npm run typecheck    # tsc --noEmit
npm run lint         # eslint . --max-warnings 0
npm test             # vitest run
npm run test:watch   # vitest watch
npm run verify       # typecheck && lint && test
npm run db:*         # see Database setup
```

---

## Testing

**525 tests across 23 files**, all passing. Run with `npm test`.

| File | Covers |
|---|---|
| `unit/scoring.test.ts` (23) | Grading, partial credit, mixed assessments, expiry + grace window |
| `unit/recommendations.test.ts` (16) | Every rule, thresholds, priority ordering, de-duplication |
| `unit/progress.test.ts` (14) | Readiness weighting, evidence scaling, streak edge cases |
| `unit/validation.test.ts` (37) | Every Zod schema incl. question-authoring rules |
| `unit/ai-response.test.ts` (24) | AI output rejected when malformed / out of range / hostile |
| `unit/rate-limit.test.ts` (8) | Windows, per-key isolation, 429 behaviour |
| `unit/adaptive.test.ts` (26) | Interview state machine, difficulty ladder, follow-up termination |
| `unit/skills.test.ts` (26) | Skill graph integrity, recency weighting, confidence, trend |
| `unit/readiness.test.ts` (21) | Readiness V2 evidence discounting, staleness, job readiness |
| `unit/mistakes.test.ts` (23) | Concept normalisation, status transitions, priority |
| `unit/question-quality.test.ts` (25) | Banned patterns, duplicate detection, batch self-duplication |
| `unit/roadmap.test.ts` (13) | AI-free daily plan derived from measured weaknesses |
| `unit/voice.test.ts` (22) | Unconfigured providers, upload validation, honest speech metrics |
| `unit/ai-schemas-v2.test.ts` (33) | V2 AI output rejected when malformed / out of range / oversized |
| `unit/communication.test.ts` (14) | STAR only scored where expected, aggregation, weakest dimension |
| `unit/job-requirements.test.ts` (10) | JD skill de-duplication, unmappable requirements kept as risk |
| `unit/practice-scheduling.test.ts` (29) | SM-2 intervals, ease bounds, lapse handling, priority ordering |
| `unit/practice-queue.test.ts` (18) | Idempotent enrolment, due/upcoming split, worst-forgotten ordering |
| `integration/practice-service.test.ts` (27) | Ownership isolation, enrolment thresholds, grade persistence, retirement |
| `integration/interview-flow.test.ts` (11) | Provider abstraction + adaptive follow-up logic |
| `integration/route-protection.test.ts` (36) | Route matching, bcrypt, error sanitisation, list/middleware drift |
| `integration/service-availability.test.ts` (7) | Every external provider's unconfigured behaviour |
| `integration/api-authorization.test.ts` (60) | **Every** API route authenticates, validates and is uncached |

Notable cases pinned by tests:

- A short-answer question must not drag an MCQ percentage down
- Selecting every option on a multi-select must not score
- One perfect interview must not produce a high readiness score
- **Twenty consecutive weak answers must not produce an unbounded follow-up
  chain** — the test drives exactly that and asserts the interview terminates
- A single lucky answer must yield a high score with *low* confidence
- A yesterday-only streak must not read as broken
- An internal error message containing a connection string must never reach
  the client (asserted explicitly)
- `/admin-guide` must not match the `/admin` prefix
- Adding a page under `app/(dashboard)` without protecting it fails the suite —
  the test reads the route folders and `middleware.ts` and compares them
- Adding an API route without `requireUser()` fails the suite — the test walks
  `app/api` rather than relying on a hand-maintained list, and also asserts
  every `/api/admin/*` route calls `requireAdmin()`, that no route accepts a
  `userId` from the request body, and that mutating handlers validate input
- A short regex token in the mistake detector must be word-bounded (a
  regression guard: unanchored `ttl` once matched inside "a li**ttl**e")
- With no credentials, every provider must throw a typed 503 naming the env var
  — and must never return fabricated content

Tests run with **no database and no API keys** — the AI provider is injected
through the `AIService` seam.

---

## Deployment

### Pre-flight

```bash
npm run verify        # typecheck + lint + tests
npm run build         # production build
```

### Vercel

1. Push to GitHub, import in Vercel
2. Add environment variables (all of the required ones above)
3. Set `AUTH_URL` and `NEXT_PUBLIC_APP_URL` to the deployed origin
4. Set `STORAGE_PROVIDER=s3` — Vercel's filesystem is ephemeral
5. Run migrations against production:
   `DATABASE_URL="<prod-url>" npm run db:deploy`
6. Seed content: `DATABASE_URL="<prod-url>" SEED_DEMO_USERS=false npm run db:seed`

> **Vercel Hobby caps function duration at 10 s**, which is shorter than a
> long AI generation. Use Pro (60 s+), or deploy to Railway/Render/Fly where
> the `maxDuration = 120` set on the AI routes applies.

### Railway / Render / a VPS

```bash
npm ci
npm run build
npm run db:deploy
npm run start
```

`STORAGE_PROVIDER=local` works on a VPS with a persistent disk.

### Deployment checklist

- [ ] `AUTH_SECRET` is a fresh 32-byte random value (not the example)
- [ ] `DATABASE_URL` uses SSL
- [ ] `AUTH_URL` matches the real origin
- [ ] `STORAGE_PROVIDER=s3` on serverless
- [ ] `SEED_DEMO_USERS=false`
- [ ] `ADMIN_EMAILS` set, or an admin promoted manually
- [ ] `.env` is not committed (it is git-ignored)

---

## Security notes

| Control | Implementation |
|---|---|
| Password storage | bcrypt, 12 rounds (`lib/auth/password.ts`) |
| Session | JWT, 30-day expiry, `id` + `role` claims |
| Route protection | Edge middleware + page-level guard + route-handler guard |
| Authorisation | User id always from the session, **never** from the request body |
| Ownership | Every query is scoped `where: { id, userId }` |
| Input validation | Zod on every route handler, re-validated server-side |
| Upload validation | Extension + declared MIME + **PDF magic-number check** |
| Path traversal | Storage keys resolved and confined to the storage root |
| Rate limiting | AI calls, uploads, registration, code execution, password change |
| Error handling | One funnel (`handleRouteError`); unknown errors → generic 500 |
| Secret handling | `lib/env.ts` is `server-only` — importing it client-side is a build error |
| Answer leakage | `isCorrect` is not selected until an attempt is submitted |
| Test-case leakage | Hidden coding test inputs redacted server-side |
| Admin privacy | Interview transcripts are not readable from the admin panel |
| Self-lockout | An admin cannot change their own role or suspend themselves |
| Data deletion | Requires password + typed `DELETE`; removes stored files first |
| Audit trail | Append-only `AuditLog` for role changes, question edits, reviews |
| AI telemetry | `AIUsageLog` stores metadata only — no prompt or completion text |
| Cost control | Per-minute rate limit **and** a per-user daily AI-call ceiling |
| AI content gate | Generated questions are stored `PENDING` + `isActive: false` |
| Audio upload | Size ceiling + MIME allow-list before the bytes reach a provider |
| Coach grounding | The AI can only assert what `buildGrounding` measured |

---

## AI safety

`lib/ai/prompts.ts` and `lib/ai/prompts-v2.ts` each contain a shared
`SAFETY_RULES` block applied to every prompt:

1. **Not a hiring system.** Never states or implies a hiring decision
2. **No fabrication.** Cannot invent candidate experience, employers or metrics.
   The "improved answer" restructures what the candidate actually said
3. **No prompt disclosure.** Refuses to reveal instructions, rubrics or the
   internal `rationale` field, and treats such requests as ordinary answers
4. **Non-discrimination.** No content based on protected attributes
5. **Professional under pressure.** Even the stress persona pressures the
   *answer*, never the person
6. **Evidence-based grading.** Judges only what was actually said

Structural protections:

- Resume and JD text are wrapped in explicit `--- BEGIN … ---` markers with an
  instruction to treat the contents as **data, not instructions**
- Every AI response is Zod-validated before touching the database
- `stop_reason: "refusal"` is handled as a user-facing error, not a crash
- Scores are clamped to their documented ranges
- Sub-scores that carry no meaning for a round type are stored as `null`, not a
  misleading `0`
- The coach receives a **grounding pack of measured facts** and is instructed to
  say "you have not practised this" rather than estimate. The pack is stored
  with the reply so any answer can be audited after the fact
- Code review **never volunteers the optimal solution.** The flag is enforced in
  the provider *and* re-checked in `lib/coding/review.ts`, so a model that
  ignores the instruction still cannot hand over an unrequested answer
- Voice has **no fabrication fallback.** No provider configured means a typed
  503, never an invented transcript; metrics the provider cannot support are
  reported as unavailable
- Speech analysis makes **no psychological claims** — "12 filler words in 90
  seconds" is an observation; "sounds nervous" is not, and is absent by design

The UI reinforces this: the JD match score card explicitly states it is not a
hiring prediction, and the footer states the tool is not affiliated with any
employer.

---

## Known limitations

1. **Rate limiting is in-memory.** Fine for a single instance; a multi-instance
   deployment needs Redis. The call sites do not change — swap the `Map` in
   `lib/rate-limit.ts`.
2. **Scanned/image-only PDFs cannot be analysed.** There is no OCR; the app
   detects this and says so rather than producing an empty profile.
3. **Short-answer questions in assessments are not auto-graded.** They are
   excluded from the score and shown alongside the reference answer for
   self-review. Only the interview module grades free text.
4. **Judge0 is required for code execution.** Without it the editor works but
   Run/Submit are disabled with a setup notice.
5. **Voice is turn-based, not real-time.** You record an answer, it is
   transcribed, and you can edit the text before sending. There is no streaming
   duplex conversation. Pause metrics are only available from providers that
   return word-level timings (Deepgram does; Whisper does not, and the UI says
   so rather than guessing).
6. **Coding problems use stdin/stdout**, not per-language function signatures,
   so one test format works across all four languages.
7. **No email flows.** No verification or password reset; password changes
   require the current password.
8. **`PAUSED` interview status exists in the schema but has no dedicated UI** —
   in practice an unfinished interview simply stays `IN_PROGRESS` and is
   resumable from `/interview`, which covers the same need.
9. **AI cost is metered but not billed.** `AIUsageLog` records per-feature token
   spend and a per-user daily ceiling is enforced, but there is no billing
   integration or per-user budget UI.
10. **Communication analysis is text-derived.** `analyzeCommunication` scores
    clarity, structure and conciseness from the transcript. It makes no claim
    about tone, emotion or confidence from the audio itself — deliberately.
11. **Claim probes match on exact claim text.** Editing a resume claim
    mid-interview breaks the link back to the row, in which case the answer is
    still graded and still feeds skills; only the claim status is left
    unchanged.
12. **Spaced practice grading is self-reported.** The interval schedule is
    driven by the candidate's own judgement of recall, which is real input but
    not a measured score — which is exactly why it is kept out of the skill
    ledger rather than folded into it.
13. **Review enrolment is opportunistic, not scheduled.** `syncReviewItems`
    runs when the queue is read, so a mistake that recurs while the user is
    away enrols on their next visit rather than at the moment it happens.
    There is no cron dependency, which is the trade being made.

---

## Future improvements

- Redis-backed rate limiting and caching
- Real-time streaming voice conversation
- OCR fallback for scanned resumes
- AI-assisted grading for short-answer assessment questions
- Function-signature-based coding problems alongside stdin/stdout
- Peer comparison ("you are in the 70th percentile for DBMS")
- Company-specific interview patterns
- Email verification and password reset
- Export a report as PDF
- E2E tests with Playwright

---

## Content disclaimer

All seeded questions, assessments and coding problems are **original demo
content** written for this project from public computer-science fundamentals.
They are not, and are not presented as, real or confidential questions from any
company's interview process. Seed rows are flagged `isSeed` and labelled as
demo content in the admin panel.

PrepPilot is a **preparation tool**. It does not make hiring decisions, does not
share data with employers, and no score it produces is a prediction about any
real job application.
