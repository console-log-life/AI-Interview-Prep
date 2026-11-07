# Mock interview — manual test plan

Automated tests cover the pure logic: device verdicts, turn detection, answer
understanding, intent selection, orchestrator state, visual aggregation, speech
metrics. **None of it proves the interview feels right, and none of it has
touched a real camera.** That requires a browser, a microphone, and you talking
to it.

This is the checklist. Run it with the dev trace open.

## Setup

```bash
npm run dev
```

1. Sign in, go to **/interview**. You should see two cards, not one.
2. **New interview** → choose **Mock interview** → configure → **Continue to
   device check**.
3. Open DevTools console. The live client exposes a diagnostic trace; from a
   React DevTools inspection of the room, or by temporarily logging it, read
   `client.devTrace`. Columns: `atMs`, `event`, `speaker`, `currentQuestion`,
   `currentTopic`, `phase`, `difficulty`, `note`.

**What must never appear:** any text containing `[INTERVIEW CONTROLLER` spoken
aloud or rendered in the transcript panel. If it does, stop — that is a leak of
controller internals to the candidate.

### Expected trace shape for one healthy exchange

```
question-asked     AI         currentQuestion=<the question>
speech-start       CANDIDATE
speech-end         CANDIDATE  note=SILENCE
answer-finalized   CANDIDATE  note=intent=ASK_FOR_REASONING words=34
decision           AI         note=intent:ASK_FOR_REASONING
turn-released      AI
question-asked     AI         <follow-up referencing your answer>
```

The order matters. `decision` **must** appear before `turn-released`, and
`turn-released` before the next `question-asked`. If a `question-asked` appears
between `speech-end` and `decision`, the model is running ahead of the
controller and the architecture is not working.

---

## Part A — the two experiences are actually separate

### A1. Chat interview is text-only
`/interview` → **Chat interview** → set up → start.

**Expect:** a message thread. No camera permission prompt, no microphone
prompt, no device check. It should be usable with the laptop lid half shut.

### A2. Mock interview is not a chat page
`/interview` → **Mock interview**.

**Expect:** you land on the device check, not on a thread with a microphone
button bolted to it. You cannot reach the room without passing the check.

### A3. Old links still work
Visit `/interview/<id>?mode=lobby` and `/interview/<id>?mode=live` directly.

**Expect:** redirects to `/check` and `/room`. No 404, no silently losing voice.

---

## Part B — device & environment check

### B1. Camera permission granted
Press **Start device check** and allow.

**Expect:** you appear in the preview, and Camera reads **Ready** with a frame
count. The count is the point — a tick without frames is the bug this row
exists to catch.

### B2. Camera permission denied
Deny, or block the site in the padlock menu, then re-check.

**Expect:** Camera **Not working**, with recovery text naming the padlock. Join
is still possible — the interview runs audio-only and says so.

### B3. Camera busy
Open the camera in Zoom/Teams/Meet first, then run the check.

**Expect:** either "in use by another application", or "opened but sent no
picture". **Not** Ready. This is the most important false-positive to catch.

### B4. Microphone level
Say something.

**Expect:** the bar moves and Microphone flips from "say something so we can
confirm we hear you" to **Ready**. Silence must never produce Ready.

### B5. Microphone denied
**Expect:** Not working, recovery pointing at the chat interview, and **Join
disabled**. This is the one hard gate.

### B6. Speaker test
Press **Test speaker**.

**Expect:** you hear two rising tones. The row then asks whether you heard it —
it must **not** go green on playback alone. Answer "I heard nothing" and check
the recovery text changes depending on whether your browser supports output
selection.

### B7. Multiple devices
With two cameras and/or two microphones attached, check the dropdowns appear
and that switching re-opens the stream on the chosen device.

Note which labels are blank before permission is granted — they should be
numbered ("Camera 2"), never described as built-in or external.

### B8. Connection check
**Expect:** "Interview service reachable (N ms)" — a real round trip. Then try
it with `GEMINI_API_KEY` unset: expect "not available on this deployment" and a
link to the chat interview, not a spinner.

### B9. Displays
On Chromium, press **Check displays** and allow.

**Expect:** the screen count, and a warning if it is more than one. On Firefox
or Safari, expect "Display verification is limited by browser privacy
restrictions". **It must never say no external display exists.**

### B10. Device unplugged during the check
Unplug a USB webcam while on this screen.

**Expect:** the device list updates.

---

## Part C — the interview itself

### C1. Normal strong answer
Give a full answer with reasoning, a concrete number, and a trade-off.

**Expect:** no praise. A follow-up that pushes *further* — scale, edge case, or
implementation detail. It must reference something you actually said. It must
**not** be "can you tell me more about X?".

### C2. Normal weak answer
Answer with one vague sentence.

**Expect:** stays on the same topic. Asks for the specific missing piece.
No sympathy speech, no "that's okay!", no jump to an unrelated area.

### C3. Candidate pauses before answering
After the question, stay silent 4–5 seconds, then answer.

**Expect:** the interviewer says nothing during the pause. No `speech-end`
fires before you actually speak. This is the one most likely to feel wrong —
note how long the silence felt.

### C4. Candidate speaks for a long time
Talk continuously for 60–90 seconds, including 1–2 second pauses mid-sentence.

**Expect:** **not** interrupted at any pause. Trace shows `speech-start` once,
no `speech-end` until you genuinely stop. Watch the transcript keep up.

### C5. Candidate interrupts the interviewer
While it is speaking, start talking over it.

**Expect:** audio stops within ~200ms, mid-word. Trace shows `interruption`
with `partial answer discarded`. Your interrupting words must **not** be scored
as an answer to the previous question.

### C6. Candidate asks to repeat
Say *"Sorry, can you repeat that?"*

**Expect:** the **same** question, reworded more simply. No new question
appended. No topic change. Trace: `intent=REPEAT_QUESTION`, counters unchanged.

### C7. Candidate asks for clarification
Say *"I don't understand what you mean."*

**Expect:** it explains what the question is getting at, then re-asks more
concretely. It must **not** answer the question for you.

### C8. Candidate says "I don't know"
Say exactly that, nothing more.

**Expect:** `intent=SIMPLIFY`. A simpler, more foundational question on the
**same** topic. Not a new topic. Not reassurance.

### C9. Candidate changes answer mid-sentence
Start one answer, break off, say *"actually, no —"* and give a different one.

**Expect:** treated as one turn. Not cut off at the break. The follow-up should
engage with what you ended on. (Known weak spot — the transcript contains both
halves and understanding is naive about self-correction.)

### C10. Answer containing the word "repeat"
Say *"I had to repeat the request on failure, so I added exponential backoff
because a thundering herd was taking down the upstream service."*

**Expect:** treated as a real answer, **not** a repeat request.

### C11. Candidate mentions an unexpected technology
Work in a technology the plan never mentioned — *"we put Kafka in front of it"*.

**Expect:** at some point it asks about Kafka specifically. If the technology is
outside the lexicon (`lib/ai/live/understanding.ts`) it will be missed — note
which ones get ignored.

### C12. Vague resume claim
When asked about a resume project, say *"I built a scalable API"* and stop.

**Expect:** challenged. Asked what made it scalable, or what you personally
implemented. Not accepted at face value.

### C13. Strong resume/project answer
Give a full account of a real project with your specific contribution.

**Expect:** it probes a detail *inside* your account rather than moving straight
on. Should not re-ask about that claim later.

### C14. Candidate asks an unrelated question
Ask *"How long is this interview?"*

**Expect:** answered briefly, then back to the interview. Not counted as your
answer.

### C15. Near the end
Run a 5-minute interview to ~4:40.

**Expect:** no new large topic opened. Current exchange finishes. Then a natural
close — thanks, interview complete. **No scores or verdict spoken aloud.** You
must not be cut off mid-sentence by the clock.

### C16. Model ignores a steering instruction
Hard to force deliberately. Watch the trace for `directive-unfollowed`.

**Expect:** when it appears, the controller does **not** mark that topic
covered.

### C17. Timer survives a refresh
Note the elapsed time, refresh the room page.

**Expect:** the clock resumes where it was, not at 00:00. (The realtime session
does restart — that is expected and separate.)

### C18. Camera unplugged mid-interview
Pull the webcam out while answering.

**Expect:** a "Device disconnected" notice, **not** an error and **not** a
terminated session. The interview keeps going in audio.

### C19. Sound off
Press **Sound on/off** while the interviewer is speaking.

**Expect:** the voice goes silent immediately, the transcript keeps updating,
and unmuting does not replay a backlog of stale audio.

### C20. Camera off mid-interview
Toggle the camera off for a minute, then back on.

**Expect:** placeholder panel, interview continues. Afterwards, check the report
does not treat the off period as you being out of frame.

---

## Part D — the report

### D1. Delivery section appears
Finish a mock interview with camera on.

**Expect:** a **Delivery** section with Speaking behaviour and Visual
presentation.

### D2. Visual analysis is honest about the browser
Most browsers have no `FaceDetector`. On Firefox/Safari, and on Chrome without
the Shape Detection API:

**Expect:** lighting and stability reported; camera engagement and framing show
**Not measured**, with a limitation saying face detection is unavailable. It
must **not** show a low score. If it does, that is the failure mode this whole
section was written to prevent.

On a browser that *does* have it, expect engagement and framing populated, with
the "not eye tracking" limitation still present.

### D3. Too little camera time
Turn the camera on for ten seconds, then off for the rest.

**Expect:** "too few camera frames to report on camera engagement" — not a
confident bad rating from a handful of frames.

### D4. Audio-only interview
Join with the camera denied.

**Expect:** speaking behaviour present; visual section says it was not measured
and why. No fabricated framing or lighting.

### D5. Speech figures are plausible
Compare the reported words-per-minute against your own sense of it. Check the
filler list against what you actually said — expect it to **undercount**, and
expect the report to say so.

### D6. Nothing interpretive
Read every line of the Delivery section.

**Expect:** no claim about nerves, confidence, honesty or stress. Observations
only.

### D7. Devices released
After **End interview**, check the browser's camera/microphone indicator.

**Expect:** off immediately.

### D8. Chat interview still works end to end
Run a full chat interview and open its report.

**Expect:** unchanged behaviour, and **no** Delivery section — there is nothing
to measure.

---

## Things to judge that no test can

Answer these in prose after a full run:

- Did it feel like it was **listening**, or pattern-matching?
- How many times did it praise you? (Target: near zero.)
- Did any question feel like a form being read aloud?
- Did it ever ask something you had effectively already answered?
- Was the silence before it responded too long, too short, or about right?
- Did the 1.8s silence threshold cut you off? Did it feel sluggish?
- Did the interviewer's voice and manner match the persona you chose?
- Did the device check feel like a professional pre-flight, or a formality?

## Tuning knobs

| Symptom | Knob | File |
|---|---|---|
| Cut off mid-thought | raise `silenceMs` / persona `silenceDurationMs` | `turn-taking.ts`, `config.ts` |
| Long dead air after you finish | lower the same | as above |
| Ignores your first syllable | lower `energyThreshold` | `turn-taking.ts` |
| Triggers on background noise | raise `energyThreshold`, raise `minSpeechMs` | `turn-taking.ts` |
| Too many follow-ups on one topic | lower `MAX_FOLLOW_UPS_PER_TOPIC` | `orchestrator.ts` |
| Moves on too fast | raise `EXCHANGES_TO_COVER` | `orchestrator.ts` |
| Microphone check never passes | lower `MIC_AUDIBLE_LEVEL` | `devices/checks.ts` |
| Engagement reads low while facing camera | raise `YAW_TOWARD_CAMERA` | `interviews/visual.ts` |
| Visual bands appear on too little data | raise `MIN_SAMPLES` | `interviews/visual.ts` |
