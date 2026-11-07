/**
 * Real-speech harness for the live interview turn pipeline.
 *
 * The previous smoke test proved the *mechanism* — that the model holds its
 * turn until the client releases it — using synthetic tones. Tones contain no
 * words, so it proved nothing about whether a real answer survives the trip
 * intact. This does the rest of it:
 *
 *   text → Gemini TTS → 16 kHz PCM → the REAL turn detector →
 *   Gemini Live → transcription → complete answer
 *
 * Crucially it drives `advanceTurn` from `lib/ai/live/turn-taking.ts`, the same
 * function the browser client uses, frame by frame at the same 128 ms cadence.
 * So a pause that splits an answer here would split it in the browser too.
 *
 * What it cannot do: prove a real microphone, a real room, or a real accent
 * behave the same way. TTS speech is clean, evenly paced and free of background
 * noise, which makes it a *generous* test of voice activity detection. Read a
 * pass here as "the pipeline is sound", not "it works for everyone".
 *
 *   npm run harness:speech
 *
 * Costs real quota. Never prints the API key.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";

import { config as loadEnv } from "dotenv";
import { GoogleGenAI, Modality, type LiveServerMessage } from "@google/genai";

import {
  AUDIO_CHUNK_SAMPLES,
  DEFAULT_LIVE_MODEL,
  INPUT_SAMPLE_RATE,
  TRANSCRIPT_MAX_WAIT_MS,
  TRANSCRIPT_POLL_MS,
  TRANSCRIPT_POST_FLUSH_GRACE_MS,
  TRANSCRIPT_STABLE_MS,
} from "../lib/ai/live/config";
import {
  appendFragment,
  assembled,
  resetBuffer,
  transcriptOutcome,
  type TranscriptBuffer,
} from "../lib/ai/live/transcript-buffer";
import {
  DEFAULT_TURN_CONFIG,
  advanceTurn,
  frameEnergy,
  resetTurn,
  type TurnDetectorState,
} from "../lib/ai/live/turn-taking";
import { deriveIntent, understandAnswer } from "../lib/ai/live/understanding";

loadEnv();

const TTS_MODEL = "gemini-2.5-flash-preview-tts";
/** Gemini TTS emits 24 kHz PCM; the Live API input wants 16 kHz. */
const TTS_SAMPLE_RATE = 24_000;
const FRAME_MS = (AUDIO_CHUNK_SAMPLES / INPUT_SAMPLE_RATE) * 1000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// ---------------------------------------------------------------------------
// Speech synthesis
// ---------------------------------------------------------------------------

const ttsCache = new Map<string, Int16Array>();

/**
 * On-disk cache for synthesized speech.
 *
 * The TTS model is on a free tier capped at 10 requests a day, and that cap was
 * reached partway through a scenario sweep — leaving the remaining scenarios
 * unrunnable for the rest of the day. The clips are deterministic for a given
 * line, so caching them makes the harness repeatable without spending quota on
 * audio that has not changed.
 */
const CACHE_DIR = path.join(__dirname, ".tts-cache");

function cachePath(text: string): string {
  const hash = crypto.createHash("sha1").update(text).digest("hex").slice(0, 16);
  return path.join(CACHE_DIR, `${hash}.pcm16`);
}

async function synthesize(ai: GoogleGenAI, text: string): Promise<Int16Array> {
  const cached = ttsCache.get(text);
  if (cached) return cached;

  const file = cachePath(text);
  if (fs.existsSync(file)) {
    const raw = fs.readFileSync(file);
    const samples = new Int16Array(
      raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength),
    );
    ttsCache.set(text, samples);
    return samples;
  }

  const response = await ai.models.generateContent({
    model: TTS_MODEL,
    contents: [{ role: "user", parts: [{ text }] }],
    config: {
      responseModalities: ["AUDIO" as never],
      speechConfig: {
        voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } },
      },
    },
  });

  const data =
    response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data ?? null;
  if (!data) throw new Error(`TTS returned no audio for: ${text.slice(0, 40)}`);

  const raw = Buffer.from(data, "base64");
  const samples24 = new Int16Array(
    raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength),
  );
  const resampled = trimSilence(resample(samples24));
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(
    file,
    Buffer.from(resampled.buffer, resampled.byteOffset, resampled.byteLength),
  );
  ttsCache.set(text, resampled);
  return resampled;
}

/** 24 kHz → 16 kHz, linear interpolation. Adequate for speech recognition. */
function resample(input: Int16Array): Int16Array {
  const ratio = TTS_SAMPLE_RATE / INPUT_SAMPLE_RATE;
  const output = new Int16Array(Math.floor(input.length / ratio));
  for (let i = 0; i < output.length; i += 1) {
    const position = i * ratio;
    const index = Math.floor(position);
    const fraction = position - index;
    const a = input[index] ?? 0;
    const b = input[index + 1] ?? a;
    output[i] = a + (b - a) * fraction;
  }
  return output;
}

/**
 * Removes leading and trailing silence.
 *
 * TTS pads its output, and that padding would be added to whatever gap the
 * scenario is trying to measure — turning a deliberate 1.0s pause into an
 * uncontrolled 1.4s one and making every pause result meaningless.
 */
function trimSilence(samples: Int16Array): Int16Array {
  const threshold = 0.005 * 0x8000;
  let start = 0;
  let end = samples.length - 1;
  while (start < samples.length && Math.abs(samples[start]) < threshold) start += 1;
  while (end > start && Math.abs(samples[end]) < threshold) end -= 1;
  return samples.slice(start, end + 1);
}

function silence(ms: number): Int16Array {
  return new Int16Array(Math.round((INPUT_SAMPLE_RATE * ms) / 1000));
}

function concat(parts: Int16Array[]): Int16Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Int16Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

// ---------------------------------------------------------------------------
// One scenario against a real Live session
// ---------------------------------------------------------------------------

type ScenarioResult = {
  /** Distinct candidate turns the detector produced. */
  turns: number;
  /** Finalized transcript of each turn, in order. */
  transcripts: string[];
  /** Model replies observed. */
  modelReplies: number;
  latency: {
    /** Local speech end → the transcript stopped growing. */
    speechEndToStableMs: number[];
    /** Flush → the last late fragment. */
    flushToTailMs: number[];
    /** Release → the model's first output. */
    releaseToReplyMs: number[];
    /** Whole finalization: speech end → turn released. */
    speechEndToReleaseMs: number[];
  };
  outcomes: string[];
  /** Lifecycle stages seen, in order, for ordering assertions. */
  stages: string[];
};

async function runScenario(args: {
  apiKey: string;
  model: string;
  audio: Int16Array;
  /** Extra quiet time after the audio, so a final turn can close. */
  tailMs: number;
  turnConfig?: Partial<typeof DEFAULT_TURN_CONFIG>;
}): Promise<ScenarioResult> {
  const client = new GoogleGenAI({
    apiKey: args.apiKey,
    httpOptions: { apiVersion: "v1alpha" },
  });

  const result: ScenarioResult = {
    turns: 0,
    transcripts: [],
    modelReplies: 0,
    latency: {
      speechEndToStableMs: [],
      flushToTailMs: [],
      releaseToReplyMs: [],
      speechEndToReleaseMs: [],
    },
    outcomes: [],
    stages: [],
  };

  let setupComplete = false;
  // Same pure buffer the production client uses.
  let answer: TranscriptBuffer = resetBuffer();
  let modelRepliedAtMs = 0;
  let awaitingReply = false;
  /** Set when the server closes the turn — candidate transcription included. */
  let turnCompleteAtMs = 0;
  const t0 = Date.now();
  const stamp = () => String(Date.now() - t0).padStart(6);
  const stage = (name: string, extra = "") => {
    result.stages.push(name);
    console.log(`      +${stamp()}ms  ${name}${extra ? `  ${extra}` : ""}`);
  };

  const session = await client.live.connect({
    model: args.model,
    callbacks: {
      onopen: () => undefined,
      onmessage: (message: LiveServerMessage) => {
        if (message.setupComplete) {
          setupComplete = true;
          return;
        }
        const content = message.serverContent;
        if (!content) return;

        if (content.inputTranscription?.text) {
          // Deltas, appended — never assigned over.
          answer = appendFragment(answer, content.inputTranscription.text, Date.now());
          console.log(
            `      +${stamp()}ms     frag ${JSON.stringify(content.inputTranscription.text)}`,
          );
        }
        if (content.turnComplete) {
          turnCompleteAtMs = Date.now();
          console.log(`      +${stamp()}ms     turnComplete`);
        }
        const producing =
          Boolean(content.modelTurn?.parts?.length) ||
          Boolean(content.outputTranscription?.text);
        if (producing && awaitingReply) {
          modelRepliedAtMs = Date.now();
          awaitingReply = false;
          result.modelReplies += 1;
        }
      },
      onerror: (error: unknown) => {
        console.log(
          `      [socket error] ${error instanceof Error ? error.message : String(error)}`,
        );
      },
      onclose: (event: unknown) => {
        const reason = (event as { reason?: string } | undefined)?.reason;
        if (reason) console.log(`      [socket closed] ${reason}`);
      },
    },
    config: {
      responseModalities: [Modality.AUDIO],
      systemInstruction:
        "You are a technical interviewer. Ask exactly one short follow-up question about what the candidate just said. Never speak until they have finished.",
      inputAudioTranscription: {},
      outputAudioTranscription: {},
      realtimeInputConfig: { automaticActivityDetection: { disabled: true } },
    },
  });

  for (let i = 0; i < 60 && !setupComplete; i += 1) await sleep(100);
  if (!setupComplete) {
    session.close();
    throw new Error("setup never completed");
  }

  // Let the interviewer's opening land and discount it.
  await sleep(3500);
  result.modelReplies = 0;

  const turnConfig = { ...DEFAULT_TURN_CONFIG, ...args.turnConfig };
  let detector: TurnDetectorState = resetTurn();

  /**
   * Audio is only sent while an activity window is open.
   *
   * With automatic activity detection disabled, audio outside a window is not
   * part of any turn. The detector needs `minSpeechMs` of sound before it will
   * open one, so those first frames — the start of the candidate's first word
   * — have to be held and replayed once the window opens, or every answer
   * loses its opening syllable.
   */
  const PRE_ROLL_FRAMES = Math.ceil(320 / FRAME_MS);
  let activityOpen = false;
  const preRoll: Int16Array[] = [];

  const sendAudio = (chunk: Int16Array) => {
    session.sendRealtimeInput({
      audio: {
        data: Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength).toString(
          "base64",
        ),
        mimeType: `audio/pcm;rate=${INPUT_SAMPLE_RATE}`,
      },
    });
  };

  const withTail = concat([args.audio, silence(args.tailMs)]);
  const totalFrames = Math.floor(withTail.length / AUDIO_CHUNK_SAMPLES);

  for (let f = 0; f < totalFrames; f += 1) {
    const slice = withTail.subarray(
      f * AUDIO_CHUNK_SAMPLES,
      (f + 1) * AUDIO_CHUNK_SAMPLES,
    );

    // Exactly what the browser client does per frame.
    const floats = new Float32Array(slice.length);
    for (let i = 0; i < slice.length; i += 1) floats[i] = slice[i] / 0x8000;

    const { state, signal } = advanceTurn(
      detector,
      { energy: frameEnergy(floats), frameMs: FRAME_MS, nowMs: Date.now() },
      turnConfig,
    );
    detector = state;

    if (signal.type === "SPEECH_START") {
      stage("1. speech-start");
      session.sendRealtimeInput({ activityStart: {} });
      activityOpen = true;
      answer = resetBuffer();
      for (const held of preRoll) sendAudio(held);
      stage("2. activityStart + pre-roll", `${preRoll.length} frames replayed`);
      preRoll.length = 0;
    }

    if (activityOpen) {
      sendAudio(slice);
    } else {
      preRoll.push(slice.slice());
      if (preRoll.length > PRE_ROLL_FRAMES) preRoll.shift();
    }

    if (signal.type === "SPEECH_END") {
      const speechEndAtMs = Date.now();
      stage("3. speech-end (local VAD)");

      // 4. Flush. The ONLY thing that makes the tail arrive.
      session.sendRealtimeInput({ activityEnd: {} });
      activityOpen = false;
      const flushAtMs = Date.now();
      stage("4. activityEnd (flush)");

      // 5. Hold. Re-opening activity keeps the model from answering while the
      //    tail is still arriving.
      session.sendRealtimeInput({ activityStart: {} });
      activityOpen = true;
      stage("5. activityStart (hold model)");

      const partsAtFlush = answer.parts.length;
      turnCompleteAtMs = 0;

      // 6/7. Wait for the transcript to stabilize, using the production policy.
      const config = {
        stableMs: TRANSCRIPT_STABLE_MS,
        postFlushGraceMs: TRANSCRIPT_POST_FLUSH_GRACE_MS,
        maxWaitMs: TRANSCRIPT_MAX_WAIT_MS,
      };
      let outcome = "PENDING";
      while (outcome === "PENDING") {
        outcome = transcriptOutcome(
          answer,
          {
            waitStartedAtMs: flushAtMs,
            nowMs: Date.now(),
            serverTurnComplete: turnCompleteAtMs > flushAtMs,
          },
          config,
        );
        if (outcome === "PENDING") await sleep(TRANSCRIPT_POLL_MS);
      }
      const stableAtMs = Date.now();
      const lateParts = answer.parts.length - partsAtFlush;
      stage(
        `6. late fragments`,
        `${lateParts} arrived after flush`,
      );
      stage("7. transcript stable", `outcome=${outcome}`);
      result.outcomes.push(outcome);

      if (lateParts > 0) {
        result.latency.flushToTailMs.push(answer.lastFragmentAtMs - flushAtMs);
      }
      result.latency.speechEndToStableMs.push(stableAtMs - speechEndAtMs);

      // 8. Complete answer.
      const complete = assembled(answer);
      stage("8. answer assembled", JSON.stringify(complete));
      result.turns += 1;
      result.transcripts.push(complete);
      answer = resetBuffer();

      // 9. Steering, exactly where the production client sends it.
      if (complete) {
        const u = understandAnswer(complete, "Tell me about your background.");
        session.sendClientContent({
          turns: [
            {
              role: "user",
              parts: [
                {
                  text: `[INTERVIEW CONTROLLER — internal guidance, do not read aloud]
Instruction: ${deriveIntent(u)} — ask one follow-up grounded in what the candidate just said.`,
                },
              ],
            },
          ],
          turnComplete: false,
        });
        stage("9. steering sent", `intent=${deriveIntent(u)}`);
      }

      // 10. Release.
      awaitingReply = true;
      const releasedAtMs = Date.now();
      session.sendRealtimeInput({ activityEnd: {} });
      activityOpen = false;
      stage("10. activityEnd (release)");
      result.latency.speechEndToReleaseMs.push(releasedAtMs - speechEndAtMs);

      const replyDeadline = Date.now() + 20_000;
      while (Date.now() < replyDeadline && awaitingReply) await sleep(100);
      if (modelRepliedAtMs > releasedAtMs) {
        result.latency.releaseToReplyMs.push(modelRepliedAtMs - releasedAtMs);
        stage("11. AI replied", `${modelRepliedAtMs - releasedAtMs}ms after release`);
      } else {
        stage("11. AI did NOT reply", "timeout");
      }

      detector = resetTurn();
      await sleep(2500);
    }

    // Real time, so the detector's clock matches a live session.
    await sleep(FRAME_MS);
  }

  session.close();
  return result;
}

// ---------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------

const results: Array<{ name: string; ok: boolean; detail: string }> = [];

function check(name: string, ok: boolean, detail: string): void {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}\n      ${detail}`);
}

function containsAll(haystack: string, needles: string[]): string[] {
  const lower = haystack.toLowerCase();
  return needles.filter((needle) => !lower.includes(needle.toLowerCase()));
}

async function main(): Promise<void> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("GEMINI_API_KEY is not set.");
    process.exit(2);
  }
  const model = process.env.AI_LIVE_MODEL || DEFAULT_LIVE_MODEL;
  const ai = new GoogleGenAI({ apiKey });

  console.log(`live model: ${model}`);
  console.log(`tts model:  ${TTS_MODEL}`);
  console.log(`silenceMs:  ${DEFAULT_TURN_CONFIG.silenceMs}`);

  const only = process.argv[2];
  const want = (id: string) => !only || only === id;

  // --- S1: real speech end to end ----------------------------------------
  if (want("s1")) {
    const text =
      "I am a software engineering student preparing for technical interviews.";
    const audio = await synthesize(ai, text);
    const run = await runScenario({ apiKey, model, audio, tailMs: 3000 });

    const transcript = run.transcripts.join(" ");
    const missing = containsAll(transcript, [
      "software engineering",
      "technical interview",
    ]);

    check(
      "S1 real speech produces a real transcript",
      run.turns === 1 && missing.length === 0,
      `turns=${run.turns} transcript=${JSON.stringify(transcript)}${
        missing.length ? ` missing=${missing.join(", ")}` : ""
      }`,
    );
    check(
      "S1 the interviewer replies after the turn is released",
      run.modelReplies >= 1,
      `replies=${run.modelReplies} latency=${run.latency.releaseToReplyMs.join(",")}ms`,
    );
    report("S1", run);
  }

  // --- S2 / TEST A: 1s mid-sentence pause --------------------------------
  if (want("s2")) {
    const audio = concat([
      await synthesize(ai, "I would use PostgreSQL because"),
      silence(1000),
      await synthesize(ai, "we need transactional consistency."),
    ]);
    const run = await runScenario({ apiKey, model, audio, tailMs: 3000 });

    check(
      "S2 (TEST A) a 1s pause does not split the answer",
      run.turns === 1,
      `turns=${run.turns} → ${JSON.stringify(run.transcripts)}`,
    );
    const joined = run.transcripts.join(" ");
    check(
      "S2 both clauses land in one answer",
      run.turns === 1 && containsAll(joined, ["postgres", "consisten"]).length === 0,
      JSON.stringify(joined),
    );
    report("S2", run);
  }

  // --- S3 / TEST B: 2s mid-sentence pause --------------------------------
  if (want("s3")) {
    const audio = concat([
      await synthesize(ai, "I would probably"),
      silence(2000),
      await synthesize(ai, "use Redis for caching."),
    ]);
    const run = await runScenario({ apiKey, model, audio, tailMs: 3000 });

    check(
      "S3 (TEST B) a 2s pause does not split the answer",
      run.turns === 1,
      `turns=${run.turns} → ${JSON.stringify(run.transcripts)}`,
    );
    report("S3", run);
  }

  // --- S4 / TEST C: long multi-sentence answer ---------------------------
  if (want("s4")) {
    const audio = await synthesize(
      ai,
      "I would first identify the bottleneck. Then I would inspect the database queries. After that I would determine whether indexing or caching is appropriate. Finally I would measure the improvement.",
    );
    const run = await runScenario({ apiKey, model, audio, tailMs: 3000 });

    const joined = run.transcripts.join(" ");
    check(
      "S4 (TEST C) a four-sentence answer is one turn",
      run.turns === 1,
      `turns=${run.turns}`,
    );
    check(
      "S4 the final sentence is not truncated",
      containsAll(joined, ["measure"]).length === 0,
      JSON.stringify(joined.slice(-120)),
    );
    report("S4", run);
  }

  // --- S5: self-correction ------------------------------------------------
  if (want("s5")) {
    const audio = await synthesize(
      ai,
      "I would use MySQL. Actually, PostgreSQL would be better because we need stronger transactional guarantees.",
    );
    const run = await runScenario({ apiKey, model, audio, tailMs: 3000 });
    const joined = run.transcripts.join(" ");

    check(
      "S5 self-correction is captured in one turn",
      run.turns === 1 && containsAll(joined, ["postgres"]).length === 0,
      JSON.stringify(joined),
    );

    const understanding = understandAnswer(joined, "Which database would you choose?");
    console.log(
      `      intent=${deriveIntent(understanding)} reasoning=${understanding.reasoningPresent} tech=${understanding.technologyMentioned.join("/")}`,
    );
    report("S5", run);
  }

  finish();
}

function report(id: string, run: ScenarioResult): void {
  const avg = (xs: number[]) =>
    xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null;
  console.log(
    `      ${id} latency: speechEnd→stable ${avg(run.latency.speechEndToStableMs) ?? "n/a"}ms | ` +
      `flush→tail ${avg(run.latency.flushToTailMs) ?? "no tail"}ms | ` +
      `speechEnd→release ${avg(run.latency.speechEndToReleaseMs) ?? "n/a"}ms | ` +
      `release→reply ${avg(run.latency.releaseToReplyMs) ?? "n/a"}ms | ` +
      `outcomes=${run.outcomes.join("/") || "n/a"}
`,
  );
}

function finish(): void {
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) {
    console.log("failed:");
    for (const f of failed) console.log(`  - ${f.name}`);
  }
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error("harness threw:", error instanceof Error ? error.message : error);
  process.exit(1);
});
