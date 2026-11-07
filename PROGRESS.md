# PROGRESS — Final delivery session

**Baseline commit:** `c475390` (repository initialized at pre-delivery state)
**Session start:** 2026-10-19
**Rule reminder:** no rewrites, no new deps, no Phase 3/4 (camera / eye-tracking /
external-device detection untouched), never weaken a test.

> If context is reset: re-read this file and resume at the first item that is not
> `done` or `blocked`. Do not restart from scratch.

---

## Work queue

| # | Item | Status | Files touched | Result |
|---|------|--------|---------------|--------|
| — | Repo init + baseline commit | done | `.git`, PROGRESS.md | `c475390`; .env confirmed excluded, 401 files committed |
| A1 | Interview evidence end-to-end + parseEvidence tests | done | `lib/ai/live/understanding.ts`, `lib/interviews/delivery-service.ts`, `tests/unit/delivery-evidence.test.ts` | Chain verified client→API→DB→report; parseEvidence exported + intent validated; 22 new tests pass |
| A2 | Clean baseline: suite + typecheck + lint + build | done (build deferred) | — | Suite 45 files/1154 tests PASS · tsc PASS · lint PASS (0 warn) · **build blocked: host OOM**, retry at E1 |
| B1 | Stale events gated by session generation + turn id | done | `lib/ai/live/client.ts` (audit) | Audited: all 4 socket callbacks already generation-gated; detectTurn guards closedByUser; reducer phase guards absorb late playback. New watchdogs carry the same generation+turnId guard. No change needed |
| B2 | Duplicate turns / idempotent finals / safe completeInterview | done | `lib/interviews/service.ts` | Audited idempotency (turnId, rememberedTurns, mergeTranscript, endedRef, deliverySentRef correct). Fixed: concurrent completeInterview raced on a unique insert and reported failure on success |
| B3 | Barge-in path correctness | done | — (audit) | Audited: selfInterruptExpected separates our own hold from a real barge-in; flushPlayback + turnId bump + answer reset on a genuine one; 3 existing tests cover it. Added watchdog disarm on barge-in |
| B4 | Reconnect teardown, no double handlers, honest ERROR state | done | `hooks/use-live-interview.ts`, `components/interview/live/interview-room.tsx`, `lib/ai/live/session.ts`, `lib/ai/live/types.ts` | Fixed dead retry (clientRef poisoned the start guard); added RETRY event + working "Try again". Socket teardown itself was already correct |
| B5 | Cleanup on end + unmount, no post-unmount setState | done | — (audit) | Audited: stop() clears timers, closes socket, disposes audio, stops tracks; unmount effect does the same. Watchdog wired into the same teardown paths |
| B6 | Stuck-state watchdogs (SPEAKING/THINKING/CONNECTING) | done | `lib/ai/live/client.ts`, `lib/ai/live/config.ts`, `tests/integration/live-client-safety.test.ts` | Fixed: CONNECT_TIMEOUT_MS (20s) + RESPONSE_TIMEOUT_MS (45s) watchdogs; 8 tests |
| C1 | Graceful failures with human messages + a way forward | done | (see B4) | Retry was the missing way forward; failure messages were already human and classified, no stack traces in the UI |
| C2 | State indicator driven by the real state machine | done | — (audit) | Already correct: one `phase` field drives the indicator, no competing booleans. RETRY reports connection as offline, never fake-connected |
| C3 | devTrace coverage across the session lifecycle | done | `lib/ai/live/client.ts`, `hooks/use-live-interview.ts`, `tests/integration/live-client-safety.test.ts` | Added session-started / connected / mic-muted / mic-unmuted / session-ended; exposed devTrace() from the hook (nothing consumed it before); 10 tests |
| C4 | Latency: clear low-risk wins only | done | `lib/ai/live/client.ts`, `lib/ai/live/audio.ts`, `hooks/use-live-interview.ts` | 3 safe wins: playback+capture worklet fetches in parallel, resume() in parallel, closing flush+delivery POSTs in parallel. Declined overlapping connect() with audio setup (first audio could arrive before the graph exists) |
| D1 | Report page: 0 turns / partial / missing scores | done | — (audit) | Verified: 0 answers → EmptyState (no invented scores); no report → ReportRetry + transcript link; delivery renders outside that branch so a voice run with 0 graded turns still shows real measurements; all score/text columns non-nullable so "missing scores" degrades to the no-report path; no falsy-zero bugs (only `?? 0`) |
| D2 | Text-mode interview path still works | done | — (verified) | Text path shares only completeInterview + parseEvidence with the changed code; 97 tests across interview-flow, adaptive, intelligence, evidence-report and delivery-evidence all pass |
| D3 | Env check: clear message + complete .env.example | done | `lib/env.ts`, `instrumentation.ts`, `tests/unit/env-required.test.ts` | .env.example verified complete (every var the code reads is listed; only NODE_ENV absent, correctly). Added startup assertion for DATABASE_URL + AUTH_SECRET — previously surfaced as a Prisma/Auth.js error mid-page; 11 tests |
| D4 | README "Run locally" + "Demo flow" | done | `README.md`, `.env.example` | Added Demo flow (10 steps + a 10-minute cut + what needs setup first), pre-demo checks, TOC entry. "Run locally" already existed and is accurate. Added missing SEED_DEMO_USERS |
| D5 | Sweep: console.log noise, TODOs, dead buttons, broken links | done | — (audit, no changes needed) | Clean: 0 console.log (all 20 console.* are prefixed console.error in real error paths); 0 TODO/FIXME; 0 dead buttons or href="#"; every static, dynamic and nav link resolves to a real route |
| E1 | Final validation: suite + typecheck + lint + build | done (build blocked) | — | **46 files / 1192 tests PASS** (baseline 1132) with per-file process isolation · `tsc --noEmit` PASS · `eslint . --max-warnings 0` PASS · **`next build` BLOCKED — host OOM, 5 attempts** |
| E2 | Re-read whole-session diff for regressions | done | — | Reviewed all 19 files / 1271+ / 43- . AnswerIntent union member-identical (type-safe refactor); completeInterview return type unchanged; connect() wrapping verified; Promise.all failure path cleaned up by the stop() added in B4. No regressions found |

---

## Findings (risks discovered, deferred)

### Config gaps — not code bugs, but they disable demo surfaces
- `CODE_EXECUTION_PROVIDER=disabled` in `.env` → coding Run/Submit inert.
- `VOICE_STT_PROVIDER` / `VOICE_TTS_PROVIDER` absent from `.env` → turn-based
  voice answer + speak-question disabled. (Live interview uses Gemini Live
  directly and does not depend on these.)
- `ADMIN_EMAILS=""` → **corrected after checking the code.** This does *not*
  lock you out of `/admin`. The panel is gated on `user.role === "ADMIN"`
  (`lib/auth/session.ts:41`), and the seed creates `admin@preppilot.local`
  with that role, so admin access works out of the box. `ADMIN_EMAILS` only
  decides the role assigned at registration
  (`lib/db/queries/users.ts:34`) — set it only if you want a newly registered
  account to come out as ADMIN.

### Cannot be done in this session
- Real browser, camera and microphone testing. Every realtime claim below is
  **verified by unit tests and code inspection only**.

---

## Decision log
- Repo did not exist; `git init` + baseline commit was required before any
  change so that per-item commits and the E2 session diff are possible.
- Commits carry no AI attribution lines, per session instruction.

### Host memory limit (discovered at A2)
This machine has 7.9 GB total with ~0.8 GB free and an exhausted commit limit.
Consequences, with workarounds:

- **`next build` cannot run.** Two attempts: default heap → `RangeError: Failed
  to allocate memory` loading `next.config.ts`; `--max-old-space-size=1024` →
  `VirtualAlloc failed`. `prisma generate` alone succeeds. This is the host
  refusing to commit memory, not a code fault. Retried at E1.
- **Vitest must run one worker at a time.** The default one-worker-per-core
  OOMs even on a known-good file. Use:
  `npx vitest run --pool=forks --poolOptions.forks.maxForks=1 --poolOptions.forks.minForks=1`
  **Do not use `--poolOptions.forks.singleFork=true`** — see the isolation note
  below. `vitest.config.ts` is deliberately unchanged so CI keeps its
  parallelism.
- PowerShell itself intermittently fails to start under this pressure.

#### `next build` — blocked after 5 attempts (final status)
| # | Strategy | Result |
|---|---|---|
| 1 | default heap | `RangeError: Failed to allocate memory` loading `next.config.ts` |
| 2 | `--max-old-space-size=1024` | `VirtualAlloc failed` |
| 3 | `--max-semi-space-size=2 --max-old-space-size=900` | reached the compile, ran 60s, died at a 392 MB heap: `AlignedAlloc Allocation failed` |
| 4 | same, cap 1600, clean `.next` | worker crash, exit `0xC0000005` (access violation under pressure) |
| 5 | same + `experimental.cpus: 1, workerThreads: false` | worker crash, exit `0xC0000005` |

Attempt 3 proves the toolchain starts and compiles — it died on host memory,
not on a code error. `next.config.ts` was patched for attempt 5 and **reverted**
(verified identical to the committed version).

`tsc --noEmit` passing over the whole project is the strongest available
evidence that the TypeScript is sound; what remains unverified is specifically
the bundling and prerender stage.

**To verify on a machine with free RAM:** `npm run build`. Nothing in the code
needs to change for it.

#### What the dev server did confirm
`next dev` was started twice to get past code inspection, and it did boot:

```
[OK] Compiled /instrumentation in 3.1s (26 modules)
[OK] Ready in 7.9s
[OK] Compiled /middleware in 2.3s (235 modules)
[OK] GET / 200 in 14008ms
```

So: the server boots, the new `instrumentation.ts` compiles and its env
assertion passes against the real `.env`, middleware compiles, and the landing
page renders 200. Compiling any *further* page then failed with
`RangeError: Failed to allocate memory` inside the dev server itself — which
confirms the wall is host memory and webpack, not `next build` specifically.
The server was stopped afterwards; no node process is left running.

This is HTTP-level verification. **No browser, camera or microphone was used at
any point in this session.**

**Host commands that work here** (use these, not the bare npm scripts):
```bash
npx vitest run --pool=forks --poolOptions.forks.maxForks=1 --poolOptions.forks.minForks=1
NODE_OPTIONS="--max-semi-space-size=2 --max-old-space-size=900" npx tsc --noEmit
NODE_OPTIONS="--max-semi-space-size=2 --max-old-space-size=900" npx eslint . --max-warnings 0
```

### Pre-existing: 5 files are not isolated when they share one process
Found while validating, and **not caused by anything in this session** — every
file passes under the project's own `npm test` and under `maxForks=1`.

**Verified symptom.** With `singleFork=true` (all 46 files in one process), 5
files fail while **0 assertions fail**: the "with no credentials configured"
tests in `service-availability.test.ts` and `interview-flow.test.ts` behave as
though an AI provider were configured, and the run logs a real
`[ai] gemini request failed`. `service-availability.test.ts` passes 7/7 on its
own. It is order-dependent: two earlier single-fork runs in this session
happened to pass.

**Cause not established.** An earlier note in this file blamed
`process.env` not being restored in `tests/unit/ai-registry.test.ts`. That was
checked and is **wrong** — that file already restores `process.env` in an
`afterEach` (line 55). The only other env mutations in the suite are one
`vi.stubEnv` in `interview-flow.test.ts` and the save/restore in
`env-required.test.ts`. The more likely candidate is module-mock leakage across
files (`ai-registry.test.ts` mocks `@google/genai` and calls
`vi.resetModules()`), but that was **not** confirmed, so it is recorded as a
hypothesis rather than a diagnosis.

**Deliberately not "fixed".** The suite is green under its supported
configuration, the implicated test file is already correct, and changing
working test infrastructure on an unverified theory risks weakening the very
tests that caught this. Diagnose before changing.

Low priority: `npm test` gives each file its own worker, so this is invisible
in CI and on a normal machine.

---

# Upgrade audit

Session 2026-10-19 (upgrade). Restore point: tag `demo-stable` = `293c9ee`.
Every line below was checked **against the code**, not against the README or
earlier notes in this file. Verdicts cite the file that decides them.

**Totals: 13 DONE · 5 PARTIAL · 0 MISSING · 1 not verifiable here.**

> **Audit correction (made during implementation).** Line 8 was first recorded
> as PARTIAL on the claim that contradiction detection was within-answer only.
> That was wrong: I had found `CONTRADICTION_PAIRS` (a *second*, intra-answer
> signal) and stopped looking. `findContradiction` in `memory.ts` does the
> cross-turn comparison, is wired into `turn-decision.ts`, and is tested. The
> line is DONE and was struck from the queue before any code was written —
> implementing it would have duplicated a working feature, which is exactly
> what this session is not for. Totals above are the corrected ones.

## Candidate context

| # | Spec line | Verdict | Evidence / what is missing |
|---|---|---|---|
| 1 | Resume claims extracted, traceable to source text | **PARTIAL** | `lib/resume/claims.ts`, `ResumeClaim` model (text, technologies, probes, status, evidence). `claimsSystemPrompt` says "Extract only what the resume states. Do not infer, upgrade or embellish." **Missing:** nothing *verifies* the claim text occurs in the résumé — traceability is instructed, not enforced, so a paraphrased or invented claim would be stored and then probed as fact. |
| 2 | JD → required skills, seniority, responsibilities | **PARTIAL** | `JobDescription` has requiredSkills, preferredSkills, technologies, responsibilities, keywords, skillMatch, missingSkills, matchScore, roadmap. **Missing:** seniority exists only as free text `experienceReq` ("Experience requirement as written"). It is never normalised to the app's own `FRESHER\|JUNIOR\|MID\|SENIOR` scale (`lib/validation/common.ts:44`), so nothing can compare JD seniority to the candidate's level. |
| 3 | Gap analysis with readiness score + reasons | **DONE** | `lib/analytics/readiness.ts` (score x evidenceFactor, `confidence`, `confidenceScore`, "plain-English reasons, shown verbatim in the UI"), `lib/analytics/job-readiness.ts`, `lib/analytics/job-requirements.ts`. |

## Interview engine

| # | Spec line | Verdict | Evidence / what is missing |
|---|---|---|---|
| 4 | Plan from resume + JD + gaps (topics, difficulty, count, type) | **DONE** | `InterviewPlanInput` in `lib/ai/live/orchestrator-types.ts`: resumeClaims, jdSkills, weakSkills, candidateSkills, difficulty, plannedQuestions, interviewType. |
| 5 | Types: technical / behavioral / system design / HR | **DONE** | `enum InterviewType` — HR, TECHNICAL, BEHAVIORAL, CODING, MIXED, SYSTEM_DESIGN. |
| 6 | Personas change tone **and follow-up pressure** | **PARTIAL** | Tone: `PERSONA_INSTRUCTIONS` (`lib/ai/prompts.ts:39`), `LIVE_PERSONA` (`lib/ai/live/prompts.ts:17`). Timing pressure: `PERSONA_TUNING` (silenceDurationMs 3000→2200, `interruptsCandidate`). **Missing:** `grep persona` over `orchestrator.ts`, `turn-decision.ts`, `adaptive.ts` returns **zero hits**. The controller takes identical decisions for every persona, so follow-up *pressure* is prompt decoration rather than behaviour — a tough persona does not probe more times before moving on. |
| 7 | Rubric per answer, each dimension with a written justification | **PARTIAL** | Six dimensions scored 0-10 on `InterviewEvaluation`: correctness, relevance, clarity, technicalDepth, completeness, structure. **Missing:** one `feedback` string covers the whole answer. No per-dimension justification, so a 4/10 on clarity is unexplained. |
| 8 | Adaptive moves (6 of them) | **DONE** (corrected) | `deriveIntent` in `lib/ai/live/understanding.ts` + `turn-decision.ts`: vague → `ASK_FOR_EXAMPLE` ✓; unsupported claim → `CHALLENGE_UNSUPPORTED_CLAIM` ✓; strong → `SUFFICIENT` + difficulty move ✓; weak → `SIMPLIFY` + mistake recorded ✓; repeat/clarify → `REPEAT_QUESTION`/`CLARIFY_QUESTION`, deliberately unscored ✓; **cross-turn contradiction ✓** — `findContradiction` (`memory.ts:156`) groups statements by subject, requires `used.turn !== notUsed.turn`, and `clarificationFor` quotes both verbatim; `turn-decision.ts:164` acts on it with `RESOLVE_CONTRADICTION` and dedupes via `clarifiedSubjects`. Covered by `turn-decision-flow.test.ts:137` (turn 1 "never used Redis" → turn 3 "implemented Redis caching" → `reason: CONTRADICTION`). |

## Voice

| # | Spec line | Verdict | Evidence |
|---|---|---|---|
| 9 | Device check, barge-in, noise rejection, hesitation, stale-event safety, reconnect, watchdogs, retry, text fallback, periodic flush | **DONE** | `components/interview/live/device-check.tsx`; `lib/ai/live/turn-taking.ts` (`BARGE_IN_MIN_SPEECH_MS` rejects coughs); `HESITATION_GRACE_MS`; generation + turnId gating in `client.ts`; `handleDrop` teardown; `CONNECT_TIMEOUT_MS` + `RESPONSE_TIMEOUT_MS`; `retry()` in `use-live-interview.ts`; "Continue in chat"; 15s flush. Hardened in the previous session; 32 tests in `live-client-safety.test.ts`. |
| 10 | Delivery metrics: wpm, fillers, long pauses, interruptions | **DONE** | `lib/interviews/speech-metrics.ts` → `InterviewDelivery` (wordsPerMinute, fillers, fillersPerHundred, longPauses, interruptions, paceShift). |

## Report

| # | Spec line | Verdict | Evidence / what is missing |
|---|---|---|---|
| 11 | Scores only from real turns; zero answers → honest empty state | **DONE** | `completeInterview` returns null at `turns.length === 0`; result page renders `EmptyState` ("Nothing has been invented to fill the gap"). |
| 12 | Every strength/weakness quotes its question + answer as evidence | **PARTIAL** | Voice interviews get the full `EvidenceList` (verbatim question + answer + observations per graded turn). **Missing:** the report's own `strengths String[]` / `weaknesses String[]` are bare strings with no citation. `reportPrompt` says "Ground every strength and weakness in something the candidate actually said" — instructed, but the data carries no link, so a reader cannot trace a weakness back to the answer that produced it. This is the headline of the report and the most visible gap. |
| 13 | Per-question breakdown with an improved model answer | **DONE** | `InterviewEvaluation.improvedAnswer` + per-turn strengths/missingPoints, rendered by `interview-report.tsx`. |
| 14 | Idempotent generation | **DONE** | `createReportOnce` in `lib/interviews/service.ts` — P2002 loser returns the winner's row and skips the follow-on writes. Fixed in the previous session. |

## Progress loop

| # | Spec line | Verdict | Evidence |
|---|---|---|---|
| 15 | Skill scores update per interview; trend; recommended next; spaced repetition | **DONE** | `lib/skills/service.ts` (recordSkillObservations, recomputeSkillProfiles, getWeakSkills), `lib/recommendations/engine.ts`, `lib/practice/scheduling.ts` + `queue.ts`, `ProgressSnapshot`. |

## Quality

| # | Spec line | Verdict | Evidence |
|---|---|---|---|
| 16 | Loading / error / empty states | **DONE** | `app/(dashboard)/loading.tsx`, `app/(dashboard)/error.tsx`, `app/error.tsx`, `app/global-error.tsx`, `app/not-found.tsx`, shared `components/shared/empty-state.tsx`. |
| 17 | Mobile responsive | **NOT VERIFIABLE HERE** | 52 of 148 `.tsx` files use `sm:`/`md:`/`lg:` breakpoints. Correctness needs a browser, which this session does not have. Not counted as DONE or PARTIAL. |
| 18 | Rate limiting on AI endpoints | **DONE** | 21 routes guard with `rateLimit`, covering every AI path: interviews/message, interviews/live(+probe), job-description/analyze, resume/analyze + claims, roadmap/generate, coach/message, coding run/submit/review, admin questions generate, assessments/practice, communication, voice speak/transcribe. |
| 19 | README architecture diagram (mermaid) | **DONE** | Added at `293c9ee`; covers the layered request path and the ephemeral-token live voice path. |

---

# Upgrade queue (ranked)

Ranked by demo visibility first, then by risk to existing code.

**Boundary I am holding:** `lib/ai/live/client.ts`, `hooks/use-live-interview.ts`
and `components/interview/live/**` are the live voice client and were hardened
last session — **they are not touched by any item below.** Items 2 and 4 modify
pure modules the client *imports* (`understanding.ts`, `memory.ts`,
`orchestrator.ts`), which are reducers and pure functions covered by existing
unit tests, so they are verifiable without a socket. Noted because that is the
closest any item comes to the voice path.

| Rank | Item | Spec # | Why here | Risk |
|---|---|---|---|---|
| 1 | Evidence citations for report strengths/weaknesses | 12 | The report is the demo payoff; a weakness you can trace to your own words is the single most convincing screen | Low — additive JSON column + prompt field + UI; index validated against real turn count, dropped if out of range |
| ~~2~~ | ~~Cross-turn contradiction detection~~ | 8 | **Struck after re-inspection — already works.** `findContradiction` + `turn-decision.ts:164`, tested in `turn-decision-flow.test.ts:137` | n/a |
| 3 | Per-dimension rubric justification | 7 | Visible in the per-question breakdown; turns six bare numbers into six explained ones | Low — additive JSON column + prompt field |
| 4 | Persona-driven follow-up pressure | 6 | Makes persona a real choice rather than a label; needs two interviews to notice, so below the above | Moderate — controller behaviour; gated so default persona is unchanged |
| 5 | JD seniority normalised to the app scale | 2 | Small but unlocks an honest "JD wants SENIOR, you are MID" line | Low — one derived field |
| 6 | Résumé claim grounding check | 1 | Mostly invisible, but it is the difference between an honesty *instruction* and an honesty *guarantee* | Low — pure function at the extraction boundary |

Stop rule per item: 3 failed attempts → mark blocked, revert, move on.

## Queue progress

| Rank | Item | Status | Result |
|---|---|---|---|
| 1 | Report evidence citations | **done** | New `lib/interviews/report-evidence.ts` resolver + JSONB column + migration `20261019120000_report_evidence`; AI emits `questionIndex` per point, validated against real turns and dropped if untrustworthy; UI falls back to the plain list for older reports. 31 tests. Suite 1223 PASS |
| 2 | Cross-turn contradiction | **struck** | Not a gap — already implemented and tested. See the audit correction above. No code written. |
| 3 | Per-dimension rubric justification | **done** | New `lib/interviews/rubric.ts` + JSONB column + migration `20261019130000_rubric_notes`. **Also found during implementation: the six dimension scores were stored but never rendered at all** — `EvaluationRow` carried only the overall score. Report now shows each dimension, its bar, and its reason; unassessed dimensions omitted rather than shown as 0/10. 25 tests. Suite 1248 PASS |
| 4 | Persona follow-up pressure | **done** | `PersonaTuning.followUpBudget` (1/2/3/3) + `followUpBudgetFor`; `OrchestratorState.persona` added; orchestrator spends the budget instead of the global constant. PROFESSIONAL unchanged at 2 and pinned by a test. 7 tests. Suite 1255 PASS |
| 5 | JD seniority normalisation | **done** | New `lib/analytics/seniority.ts` — pure derivation from `experienceReq` + title, so it works on existing rows with no schema or AI change; returns null rather than guessing; compared against `Profile.experienceLevel` and surfaced on the JD page. 38 tests (one caught a real `2024`→24-years mis-parse). Suite 1293 PASS |
| 6 | Résumé claim grounding check | todo | |
