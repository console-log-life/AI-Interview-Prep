<div align="center">

# 🚀 PrepPilot

### AI-Powered Mock Interview & Assessment Platform

**Practice smarter. Interview better.**

AI mock interviews, assessments, coding practice and personalised feedback, all in one platform.

<br/>

![Next.js](https://img.shields.io/badge/Next.js_15-000000?style=for-the-badge&logo=nextdotjs&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma_6-2D3748?style=for-the-badge&logo=prisma&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white)

![Gemini](https://img.shields.io/badge/Google_Gemini-8E75B2?style=for-the-badge&logo=googlegemini&logoColor=white)
![Claude](https://img.shields.io/badge/Anthropic_Claude-D97757?style=for-the-badge&logo=anthropic&logoColor=white)
![Auth.js](https://img.shields.io/badge/Auth.js_v5-7C3AED?style=for-the-badge&logo=auth0&logoColor=white)
![Tests](https://img.shields.io/badge/tests-525_passing-22C55E?style=for-the-badge&logo=vitest&logoColor=white)

<br/>

[✨ Features](#-features) •
[🛠 Tech Stack](#-tech-stack) •
[🏗 Architecture](#-architecture) •
[⚡ Getting Started](#-getting-started) •
[🎬 Demo Flow](#-demo-flow) •
[🔒 Security](#-security)

</div>

---

## 📸 Screenshots

> _Add screenshots or a GIF of the dashboard, live interview room and report here._

<!--
| Dashboard | Interview Room | Report |
|---|---|---|
| ![](docs/screenshots/dashboard.png) | ![](docs/screenshots/room.png) | ![](docs/screenshots/report.png) |
-->

---

## 🎯 Why PrepPilot?

Most interview-prep tools give you a score and stop there. **PrepPilot closes the loop.**

```
REGISTER → PROFILE → RESUME → TARGET ROLE → DASHBOARD
    → MOCK INTERVIEW → AI EVALUATION → REPORT
        → WEAKNESS DETECTION → RECOMMENDATIONS
            → ASSESSMENT / CODING → MEASURED IMPROVEMENT ↺
```

Every module feeds the next. A weak SQL answer in a mock interview lowers your SQL topic average → triggers a recommendation → points you to a SQL assessment → whose result updates the same average → and the progress chart shows whether it actually moved.

**V2 adds memory** — the platform remembers how you answer, what you get wrong, and adapts:

```
ANSWER → SKILL OBSERVATION → RECENCY-WEIGHTED SCORE + CONFIDENCE
    → MISTAKE CONCEPT (deduplicated, counted)
        → ADAPTIVE NEXT QUESTION  ↺
        → READINESS (discounted by evidence, penalised by repetition)
            → GROUNDED COACH / ROADMAP / TODAY'S PLAN ↺
```

<table>
<tr>
<td width="50%">

### 🚫 No fake data
A new account shows **empty states, not sample charts**. Every score, streak, achievement and trend line comes from something you actually did.

</td>
<td width="50%">

### 🎚 No fake confidence
A high score from thin evidence is shown as exactly that — the score, the confidence, and the reasons — never rounded up into _"you're ready"_.

</td>
</tr>
</table>

---

## ✨ Features

### 🎙 AI Mock Interview
- **6 round types** — HR, Technical, Behavioural, Coding, Mixed, System Design
- **4 interviewer personalities** — Friendly, Professional, Strict, Stress
- **Dynamic questions** — no fixed script; each question is chosen from the transcript, your resume, target role and the evaluation of your previous answer
- **Adaptive follow-ups** — a partially correct answer triggers a follow-up on the same topic
- **Full state persistence** — refresh, close the tab or switch device, and the interview resumes exactly where it was
- Per-answer evaluation with sub-scores, missing points and a restructured version of **your own** answer
- End-of-interview report across five categories with a radar chart

### 📝 Assessments
- **13 categories** — DSA, DBMS, OOP, OS, Networks, Java, Python, JavaScript, Aptitude, Logical Reasoning, HR, Behavioural, System Design
- MCQ, multi-select, true/false and short answer
- **Server-enforced timer** — the browser countdown is display-only
- Autosave, mark-for-review, question navigator, auto-submit
- Results broken down by topic and difficulty, with explanations

### 💻 Coding Practice
- **Monaco editor** with Python, Java, C++ and JavaScript
- Sample + hidden test cases (hidden inputs redacted server-side)
- Run against custom input or submit against the full suite
- Submission history with verdict, runtime and memory
- **Code never runs inside the Next.js process** — it goes to an external Judge0 sandbox

### 📄 Resume Intelligence
- PDF upload → text extraction → AI analysis → **editable** profile
- Every extracted field can be corrected; saving marks it `userVerified`
- **Claim verification** — claims like _"Built a REST API in Node.js"_ become interview probe targets and get marked VERIFIED / PARTIAL / UNCLEAR / WEAK

### 🎯 Job Description Matching
- Paste a job posting → skill-by-skill match (Strong / Medium / Weak / Missing) with evidence
- Overall match score, missing skills and a dated study roadmap
- **Job-specific readiness** shown next to the resume match — if your resume reads 15+ points stronger than your measured results, the page says so plainly

### 🧠 Skill Intelligence & Mistake Memory
- ~50-node **skill graph** — every graded answer writes a skill observation
- **Recency-weighted** scores with a 30-day half-life
- **Confidence reported separately from score** — one lucky answer = high score, low confidence
- Mistakes are normalised into concepts, counted, and move ACTIVE → IMPROVING → RESOLVED

### 🤖 Adaptive Interview Engine
- The interview is a **state machine**, not a fixed list
- The engine — not the model — decides `FOLLOW_UP` / `PROBE_FUNDAMENTALS` / `DEEPEN` / `PROBE_CLAIM` / `NEW_TOPIC` / `FINISH`
- Follow-up depth is hard-capped (a test drives 20 weak answers in a row to prove it terminates)

### 🧭 AI Coach, Roadmap & Spaced Practice
- Every coach reply is **grounded in measured facts** — it cannot invent a strength you haven't shown
- 7 / 14 / 30 / 60 / 90-day roadmaps
- **Today's plan is rule-based** and works with no API key at all
- **SM-2 spaced repetition** — weak skills and repeated mistakes join the review queue automatically

### 🗣 Communication Coaching & Voice
- Scores _delivery_ — clarity, structure, conciseness — separately from correctness
- **STAR is only scored where STAR is expected**
- Live voice interviews via Gemini Live; optional STT (Deepgram, Whisper) and TTS (ElevenLabs)
- **No fabricated transcripts** — unconfigured means the control is hidden

### 📊 Progress & Gamification
- Readiness score weighted **45 / 30 / 25** across interviews, assessments and coding, scaled by evidence
- Real dated history, rolling topic averages, weak-area detection
- **12 achievements**, unlocked only by measured activity

<details>
<summary><b>🛡 Admin panel</b></summary>

- Platform stats, signup trend, popular categories and roles
- Full question-bank CRUD with type-aware validation
- Assessment publish / unpublish (refuses to delete anything with attempts)
- User role & status management (an admin cannot demote themselves)
- **Interview activity is metadata-only** — admins never see transcripts
- **Content studio** — AI question generation behind a quality gate; generated questions land PENDING until approved
- **AI observability** — call counts, latency, token spend, failure categories (metadata only, never prompt text)
- **Audit trail** — append-only log of role changes, question edits and review decisions

</details>

---

## 🛠 Tech Stack

| Layer | Choice | Why |
|---|---|---|
| ⚛️ Framework | **Next.js 15** (App Router) | Server Components, route handlers, one deployable |
| 🔷 Language | **TypeScript** (strict) | Zero `any` in application code |
| 🎨 Styling | **Tailwind CSS 3 + shadcn/ui** | Owned components, no runtime UI dependency |
| 🐘 Database | **PostgreSQL + Prisma 6** | Relational data, typed client, migrations |
| 🔐 Auth | **Auth.js v5** + Prisma adapter | Credentials, JWT sessions, role-based access |
| 🤖 AI | **Google Gemini / Anthropic Claude** | Structured JSON output, switchable provider |
| ✅ Validation | **Zod** | One schema validates client, server and AI output |
| 📈 Charts | **Recharts** | |
| ⌨️ Editor | **Monaco** | Lazy-loaded client-side |
| 📄 PDF | **unpdf** | Serverless-friendly pdf.js build |
| 🧪 Testing | **Vitest** | 525 tests, no DB or API keys needed |

<details>
<summary><b>Why Auth.js instead of Clerk?</b></summary>

1. **The app must run with zero third-party keys.** Clerk fails every route without live keys. Auth.js needs only `DATABASE_URL` and `AUTH_SECRET`.
2. **`/login` and `/register` are first-party pages** — the credentials pattern, not a hosted flow.
3. **Explainability.** bcrypt hashing, JWT sessions and middleware authorisation are all visible in this repository.

Auth lives behind `lib/auth/`, so swapping providers touches only `auth.ts`, `lib/auth/config.ts` and `middleware.ts`.

</details>

---

## 🏗 Architecture

```mermaid
flowchart TB
    subgraph browser["Browser"]
        UI["React components<br/>app/, components/"]
        LIVE["Live voice client<br/>lib/ai/live/client.ts"]
    end

    subgraph server["Next.js server (Node runtime)"]
        RH["Route handlers + server components<br/>app/api/**, app/**/page.tsx"]
        GUARD["requireUser - Zod parse"]
        SVC["Services<br/>lib/interviews, lib/resume, lib/coding, lib/skills"]
        QP["Queries + providers<br/>lib/db/queries/**, lib/ai, lib/storage"]
        GRANT["Ephemeral token mint<br/>lib/ai/live/grant.ts"]
    end

    subgraph external["External"]
        DB[("PostgreSQL<br/>Prisma")]
        LLM["LLM provider<br/>Gemini or Claude"]
        GLIVE["Gemini Live API<br/>realtime audio"]
        OBJ["S3 or local disk"]
        J0["Judge0"]
    end

    UI -->|"fetch"| RH
    RH --> GUARD --> SVC --> QP
    QP --> DB
    QP --> LLM
    QP --> OBJ
    QP --> J0

    LIVE -->|"POST /live - asks for a session"| RH
    RH --> GRANT
    GRANT -->|"single-use token, expires in minutes"| LLM
    GRANT -.->|"token only, never the API key"| LIVE
    LIVE <==>|"WebSocket: audio in, audio + transcript out"| GLIVE
    LIVE -->|"transcript flush every 15s"| RH

    classDef never fill:#fff,stroke:#c00,stroke-width:2px,color:#c00
    class UI never
```

> 🔴 **The one rule the whole structure enforces:** a component never imports Prisma and never imports an AI SDK.
> Every mutation goes **route handler → auth guard → Zod validation → service → query/provider**.

**🎧 Live voice, safely:** the browser needs its own socket to Gemini, which would normally mean shipping an API key to the client. Instead, the server mints a **single-use ephemeral token** that expires in minutes — the only credential the browser ever sees. Audio streams directly between the browser and Google and is never stored.

<details>
<summary><b>🧩 The AI abstraction</b></summary>

`types/ai.ts` declares one `AIService` interface with 13 capabilities:

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

- Every prompt lives in `lib/ai/prompts.ts` and `lib/ai/prompts-v2.ts` — one place to audit AI-safety rules
- Each call has **two layers**: a JSON Schema that constrains generation, and a Zod schema that validates the response. **Zod is the trust boundary**
- `lib/ai/index.ts` is a provider registry — adding a provider is one class and one switch case
- `lib/ai/observability.ts` records metadata only — never prompt or completion text

The same registry pattern is used for `AIService`, `CodeExecutionProvider`, `StorageProvider` and the voice providers. An unconfigured provider throws a **typed 503 naming the env variable** — it never fakes output.

</details>

<details>
<summary><b>📐 Readiness V2</b></summary>

```
score      — how well you are performing
evidence   — how much we actually know (breadth + volume + recency)
penalties  — active repeated mistakes and stale practice

readiness = rawPerformance × evidenceFactor − mistakePenalty
```

A 100% raw performance from one interview surfaces as a headline **well under 60 with LOW confidence**, plus plain-English explanations. Pillars with no data are renormalised out, so never having coded doesn't silently cost you a third of the score.

</details>

<details>
<summary><b>🗄 Database design (44 models)</b></summary>

Everything queried, filtered or joined is relational. JSON is used only for genuinely open-ended shapes (AI evaluation breakdowns, resume sections), and even then it's Zod-validated before writing.

- `InterviewMessage.order` — explicit sequence column, because `createdAt` can collide within a millisecond
- `AssessmentAttempt.expiresAt` — the server-side deadline; the client timer has no authority
- `TopicPerformance` — rolling incremental mean, O(1) updates
- `ProgressSnapshot` — real dated history instead of a recomputed guess
- `PracticeActivity` — unique on `(userId, kind, day)`, making streaks a simple scan
- `Achievement` — badges are **rows**, not code

</details>

<details>
<summary><b>📁 Folder structure</b></summary>

```
app/
  (auth)/               login, register
  (dashboard)/          all authenticated student routes
    dashboard/  interview/  assessments/  coding/
    resume/  job-description/  progress/  profile/  settings/
    coach/  roadmap/  skills/  practice/               ← V2
  admin/                admin-only routes
    content-studio/  observability/                    ← V2
  api/                  route handlers

components/
  ui/  layout/  shared/
  dashboard/  interview/  assessment/  coding/  resume/
  job-description/  progress/  profile/  settings/  admin/  auth/
  coach/  roadmap/  skills/                            ← V2

lib/
  ai/  auth/  db/  storage/  coding/  voice/
  assessments/  interview/  interviews/  skills/  mistakes/
  analytics/  communication/  practice/  coach/  roadmap/
  audit/  dashboard/  recommendations/  progress/  resume/
  job-description/  validation/  api/
  env.ts  rate-limit.ts  utils.ts

prisma/    schema.prisma  seed.ts  seed-data/
types/     ai  interview  user  job-description  next-auth.d.ts
hooks/     use-assessment.ts  use-interview.ts
tests/     unit/  integration/  helpers/fake-ai.ts  setup.ts
```

</details>

---

## ⚡ Getting Started

### Prerequisites
- **Node.js 20+**
- **PostgreSQL 13+** (local, Docker, Neon, Supabase or Railway)

### Setup

```bash
# 1️⃣ Install dependencies
npm install

# 2️⃣ Environment
cp .env.example .env
npx auth secret          # generates AUTH_SECRET into .env
# then set DATABASE_URL in .env

# 3️⃣ Database
npm run db:migrate       # creates tables
npm run db:seed          # loads questions, assessments, problems, achievements

# 4️⃣ Run
npm run dev              # → http://localhost:3000
```

### 🔑 Demo logins _(development only)_

| Email | Password | Role |
|---|---|---|
| `admin@preppilot.local` | `Password123` | 🛡 ADMIN |
| `student@preppilot.local` | `Password123` | 🎓 STUDENT |

> Demo users are skipped when `NODE_ENV=production` or `SEED_DEMO_USERS=false`.

<details>
<summary><b>🐳 Local PostgreSQL via Docker</b></summary>

```bash
docker run --name preppilot-db \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=ai_interview_prep \
  -p 5432:5432 -d postgres:16
```

```
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/ai_interview_prep?schema=public"
```

</details>

---

## 🎬 Demo Flow

Sign in as `student@preppilot.local`. Each step leaves data the next one reads, so the loop is visible.

| # | Page | What to show |
|---|---|---|
| 1 | `/dashboard` | New account shows **empty states, not sample charts** |
| 2 | `/profile` | Set a target role — everything downstream is scoped to it |
| 3 | `/resume` | Upload a PDF → extracted profile and verifiable **claims** |
| 4 | `/job-description` | Paste a real job ad → required skills + readiness breakdown |
| 5 | `/interview/new` | **Mock interview** (voice, needs `AI_PROVIDER=gemini`) or **Chat interview** (text) |
| 6 | `/interview/[id]/room` | Answer one question well and one badly — watch the follow-up change |
| 7 | `/interview/[id]/result` | Scores, **evidence** and delivery metrics (pace, fillers, pauses) |
| 8 | `/dashboard` | Readiness, daily plan and recommendations have all moved |
| 9 | `/skills` → `/practice` | The weak skill and the spaced-practice queue it enrolled |
| 10 | `/coach` | Ask _"what should I work on?"_ — grounded, never invented |

> ⏱ **Only 10 minutes?** Do steps 1, 5, 6, 7, 8. That's the whole loop: **measure → report → the numbers move.**

---

## 🤖 AI Setup

Pick a provider with `AI_PROVIDER` — only that provider's key is needed.

<table>
<tr>
<td width="50%">

**Google Gemini** _(free tier)_

```env
AI_PROVIDER="gemini"
GEMINI_API_KEY="..."
AI_MODEL=""   # → gemini-2.5-flash
```
Get a key at [aistudio.google.com](https://aistudio.google.com/apikey)

</td>
<td width="50%">

**Anthropic Claude**

```env
AI_PROVIDER="anthropic"
ANTHROPIC_API_KEY="sk-ant-..."
AI_MODEL=""   # → claude-opus-5
```

</td>
</tr>
</table>

> 💡 **Leave `AI_MODEL` empty** when switching providers — a model name left over from the other provider will be rejected.

**No automatic fallback between providers.** If Gemini fails, the request shows an AI-unavailable state — it never silently starts billing a different paid account.

### ✅ What works with no API keys at all
Registration, login, profile, dashboard intelligence, **today's plan**, **spaced practice**, job readiness, seeded assessments, coding practice with history, progress charts, achievements, the skill ledger and the full admin panel.

---

<details>
<summary><b>⚙️ Environment variables</b></summary>

Full documentation is in `.env.example`.

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | **Yes** | PostgreSQL connection string |
| `AUTH_SECRET` | **Yes** | JWT signing secret (`npx auth secret`) |
| `AUTH_URL` | Production | Canonical origin |
| `NEXT_PUBLIC_APP_URL` | No | Used in metadata |
| `ADMIN_EMAILS` | No | Emails auto-promoted to ADMIN at signup |
| `AI_PROVIDER` | No | `gemini` or `anthropic` |
| `GEMINI_API_KEY` / `ANTHROPIC_API_KEY` | For AI | Key for the selected provider |
| `AI_MODEL` | No | Leave empty for the provider default |
| `AI_EFFORT` | No | `low` \| `medium` \| `high` \| `xhigh` \| `max` |
| `STORAGE_PROVIDER` | No | `local` (default) or `s3` |
| `STORAGE_LOCAL_DIR` | No | Defaults to `./storage` |
| `S3_BUCKET` / `S3_REGION` / `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` / `S3_ENDPOINT` | For S3 | Any S3-compatible bucket |
| `CODE_EXECUTION_PROVIDER` | No | `judge0` or `disabled` (default) |
| `JUDGE0_URL` / `JUDGE0_API_KEY` / `JUDGE0_API_HOST` | For coding | Sandbox endpoint |
| `VOICE_STT_PROVIDER` | No | `deepgram` \| `whisper` \| `disabled` |
| `VOICE_STT_API_KEY` / `VOICE_STT_BASE_URL` | For voice input | Speech-to-text credentials |
| `VOICE_TTS_PROVIDER` | No | `elevenlabs` \| `disabled` |
| `VOICE_TTS_API_KEY` | For spoken questions | Text-to-speech credentials |
| `RATE_LIMIT_AI_PER_MINUTE` | No | Defaults to 12 |
| `RATE_LIMIT_UPLOAD_PER_HOUR` | No | Defaults to 10 |
| `RATE_LIMIT_AI_PER_DAY` | No | Per-user daily AI ceiling, defaults to 200 |
| `MAX_INTERVIEW_TURNS` | No | Defaults to 20 |
| `MAX_AI_CONTEXT_CHARS` | No | Defaults to 60000 |

**Missing optional keys never break the app** — the feature shows a clear "not configured" notice naming the exact variable.

</details>

<details>
<summary><b>🔐 Authentication & admin setup</b></summary>

1. Generate a secret: `npx auth secret`
2. Register at `/register` — new accounts are STUDENT

**To create an admin**, set `ADMIN_EMAILS` before registering, or promote an existing account via `npm run db:studio`.

**How it works:** Credentials → bcrypt (12 rounds) → JWT session with `id` and `role`. Enforced at three layers: edge middleware, `requireAdminPage()` in the admin layout, and `requireAdmin()` in every admin route.

</details>

<details>
<summary><b>☁️ Storage setup</b></summary>

`STORAGE_PROVIDER=local` (default) writes to `./storage` — zero setup.

For serverless, use any S3-compatible bucket:

```env
STORAGE_PROVIDER="s3"
S3_BUCKET="preppilot-resumes"
S3_REGION="auto"
S3_ACCESS_KEY_ID="..."
S3_SECRET_ACCESS_KEY="..."
S3_ENDPOINT="https://<account>.r2.cloudflarestorage.com"   # R2/MinIO only
```

Resume PDFs are **never stored in PostgreSQL** — only the storage key is.

</details>

<details>
<summary><b>🧑‍💻 Code execution (Judge0)</b></summary>

User code is treated as hostile, so it **never runs inside the Next.js process**.

**Self-hosted (recommended):**
```bash
wget https://github.com/judge0/judge0/releases/download/v1.13.1/judge0-v1.13.1.zip
unzip judge0-v1.13.1.zip && cd judge0-v1.13.1
docker compose up -d db redis
sleep 10
docker compose up -d
```
```env
CODE_EXECUTION_PROVIDER="judge0"
JUDGE0_URL="http://localhost:2358"
```

**RapidAPI-hosted:**
```env
CODE_EXECUTION_PROVIDER="judge0"
JUDGE0_URL="https://judge0-ce.p.rapidapi.com"
JUDGE0_API_KEY="your-rapidapi-key"
JUDGE0_API_HOST="judge0-ce.p.rapidapi.com"
```

Without a sandbox, problems, the editor and submission history still work; Run/Submit show a setup notice.

</details>

---

## 📜 Commands

```bash
npm run dev          # dev server
npm run build        # prisma generate && next build
npm run start        # production server
npm run typecheck    # tsc --noEmit
npm run lint         # eslint . --max-warnings 0
npm test             # vitest run
npm run verify       # typecheck && lint && test

npm run db:migrate   # create/apply a migration (dev)
npm run db:deploy    # apply migrations (production)
npm run db:seed      # idempotent — safe to re-run
npm run db:studio    # browse data in Prisma Studio
```

---

## 🧪 Testing

<div align="center">

### **525 tests · 23 files · all passing**
_No database. No API keys. The AI provider is injected through the `AIService` seam._

</div>

**Some of the cases pinned by tests:**

- ✅ One perfect interview must **not** produce a high readiness score
- ✅ **20 consecutive weak answers** must not create an unbounded follow-up chain
- ✅ A single lucky answer yields a high score with **low confidence**
- ✅ Selecting every option on a multi-select must not score
- ✅ An internal error containing a connection string must **never** reach the client
- ✅ Adding a dashboard page or API route without auth protection **fails the suite**
- ✅ With no credentials, every provider throws a typed 503 — never fabricated content

<details>
<summary><b>Full test breakdown</b></summary>

| File | Covers |
|---|---|
| `unit/scoring.test.ts` (23) | Grading, partial credit, expiry + grace window |
| `unit/recommendations.test.ts` (16) | Every rule, thresholds, priority, de-duplication |
| `unit/progress.test.ts` (14) | Readiness weighting, evidence scaling, streaks |
| `unit/validation.test.ts` (37) | Every Zod schema |
| `unit/ai-response.test.ts` (24) | Malformed / out-of-range / hostile AI output rejected |
| `unit/rate-limit.test.ts` (8) | Windows, per-key isolation, 429 behaviour |
| `unit/adaptive.test.ts` (26) | Interview state machine, follow-up termination |
| `unit/skills.test.ts` (26) | Skill graph, recency weighting, confidence |
| `unit/readiness.test.ts` (21) | Evidence discounting, staleness, job readiness |
| `unit/mistakes.test.ts` (23) | Concept normalisation, status transitions |
| `unit/question-quality.test.ts` (25) | Banned patterns, duplicate detection |
| `unit/roadmap.test.ts` (13) | AI-free daily plan |
| `unit/voice.test.ts` (22) | Unconfigured providers, honest speech metrics |
| `unit/ai-schemas-v2.test.ts` (33) | V2 AI output validation |
| `unit/communication.test.ts` (14) | STAR only where expected |
| `unit/job-requirements.test.ts` (10) | JD skill de-duplication |
| `unit/practice-scheduling.test.ts` (29) | SM-2 intervals, ease bounds, lapses |
| `unit/practice-queue.test.ts` (18) | Idempotent enrolment, due/upcoming split |
| `integration/practice-service.test.ts` (27) | Ownership isolation, grade persistence |
| `integration/interview-flow.test.ts` (11) | Provider abstraction + adaptive follow-ups |
| `integration/route-protection.test.ts` (36) | Route matching, bcrypt, error sanitisation |
| `integration/service-availability.test.ts` (7) | Unconfigured provider behaviour |
| `integration/api-authorization.test.ts` (60) | **Every** API route authenticates and validates |

</details>

---

## 🚢 Deployment

```bash
npm run verify        # typecheck + lint + tests
npm run build         # production build
```

**Vercel**
1. Push to GitHub and import in Vercel
2. Add the required environment variables
3. Set `AUTH_URL` and `NEXT_PUBLIC_APP_URL` to the deployed origin
4. Set `STORAGE_PROVIDER=s3` (Vercel's filesystem is ephemeral)
5. `DATABASE_URL="<prod-url>" npm run db:deploy`
6. `DATABASE_URL="<prod-url>" SEED_DEMO_USERS=false npm run db:seed`

> ⚠️ **Vercel Hobby caps functions at 10 s**, shorter than a long AI generation. Use Pro, or deploy to Railway / Render / Fly where `maxDuration = 120` applies.

**Railway / Render / VPS**
```bash
npm ci && npm run build && npm run db:deploy && npm run start
```

<details>
<summary><b>✔️ Deployment checklist</b></summary>

- [ ] `AUTH_SECRET` is a fresh 32-byte random value
- [ ] `DATABASE_URL` uses SSL
- [ ] `AUTH_URL` matches the real origin
- [ ] `STORAGE_PROVIDER=s3` on serverless
- [ ] `SEED_DEMO_USERS=false`
- [ ] `ADMIN_EMAILS` set, or an admin promoted manually
- [ ] `.env` is not committed

</details>

---

## 🔒 Security

| Control | Implementation |
|---|---|
| 🔑 Passwords | bcrypt, 12 rounds |
| 🎫 Session | JWT, 30-day expiry, `id` + `role` claims |
| 🚧 Route protection | Edge middleware + page guard + route-handler guard |
| 👤 Authorisation | User id always from the session, **never** from the request body |
| 📦 Ownership | Every query scoped `where: { id, userId }` |
| ✅ Validation | Zod on every route handler, re-validated server-side |
| 📄 Uploads | Extension + MIME + **PDF magic-number check** |
| 📂 Path traversal | Storage keys confined to the storage root |
| ⏱ Rate limiting | AI calls, uploads, registration, code execution, password change |
| 🙈 Secrets | `lib/env.ts` is `server-only` — client import is a build error |
| 🧾 Answer leakage | `isCorrect` hidden until an attempt is submitted |
| 🕵️ Admin privacy | Interview transcripts are not readable by admins |
| 🗑 Data deletion | Requires password + typed `DELETE` |
| 📜 Audit trail | Append-only log for role changes, question edits, reviews |
| 📊 AI telemetry | Metadata only — no prompt or completion text |

---

## 🛡 AI Safety

Every prompt includes a shared `SAFETY_RULES` block:

1. 🚫 **Not a hiring system** — never states or implies a hiring decision
2. 🚫 **No fabrication** — cannot invent experience, employers or metrics
3. 🔒 **No prompt disclosure** — refuses to reveal instructions or rubrics
4. ⚖️ **Non-discrimination** — no content based on protected attributes
5. 🤝 **Professional under pressure** — the stress persona pressures the _answer_, never the person
6. 📏 **Evidence-based grading** — judges only what was actually said

Plus structural protections: resume and JD text are wrapped as **data, not instructions**; every AI response is Zod-validated; scores are clamped; the coach is **grounded in measured facts**; code review **never volunteers the optimal solution**; and speech analysis makes **no psychological claims**.

---

<details>
<summary><b>⚠️ Known limitations</b></summary>

1. **Rate limiting is in-memory** — a multi-instance deployment needs Redis.
2. **Scanned/image-only PDFs can't be analysed** — no OCR; the app detects and says so.
3. **Short-answer assessment questions aren't auto-graded** — shown with the reference answer for self-review.
4. **Judge0 is required for code execution.**
5. **Chat-interview voice answers are turn-based** — record, transcribe, edit, send. Pause metrics need a provider with word timings (Deepgram yes, Whisper no).
6. **Coding problems use stdin/stdout**, not function signatures.
7. **No email flows** — no verification or password reset.
8. **`PAUSED` status has no dedicated UI** — unfinished interviews stay `IN_PROGRESS` and are resumable.
9. **AI cost is metered but not billed.**
10. **Communication analysis is text-derived** — no claims about tone or emotion from audio.
11. **Claim probes match on exact claim text.**
12. **Spaced-practice grading is self-reported** — which is why it's kept out of skill scores.
13. **Review enrolment is opportunistic** — runs when the queue is read, no cron.

</details>

## 🔮 Roadmap

- [ ] Redis-backed rate limiting and caching
- [ ] OCR fallback for scanned resumes
- [ ] AI-assisted grading for short-answer questions
- [ ] Function-signature coding problems
- [ ] Peer comparison (_"you're in the 70th percentile for DBMS"_)
- [ ] Company-specific interview patterns
- [ ] Email verification and password reset
- [ ] Export report as PDF
- [ ] E2E tests with Playwright

---

<div align="center">

### 📌 Disclaimer

All seeded questions, assessments and coding problems are **original demo content** written from public computer-science fundamentals — not real or confidential questions from any company.

PrepPilot is a **preparation tool**. It does not make hiring decisions, does not share data with employers, and no score it produces is a prediction about any real job application.

<br/>

**Built with ❤️ as a B.Tech major project**

⭐ _If you found this useful, consider giving it a star!_

</div>
