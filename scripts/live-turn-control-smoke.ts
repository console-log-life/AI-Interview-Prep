/**
 * Live turn-control smoke test.
 *
 * Verifies the single assumption the whole realtime interview rests on:
 * with `automaticActivityDetection: { disabled: true }`, the model does **not**
 * generate a reply when it hears the candidate stop. It waits for the client to
 * send `activityEnd`.
 *
 * That matters because it is the window in which the orchestrator understands
 * the answer and steers the next question. If the model replies on silence
 * anyway, every directive lands a turn late and the interviewer is a
 * commentator rather than a listener — the exact bug this architecture was
 * built to fix.
 *
 * It talks to the real Gemini Live API, so it is a script and not a unit test:
 * `npm test` must never need a key or a network.
 *
 *   npx tsx scripts/live-turn-control-smoke.ts
 *
 * Nothing here prints the API key.
 */

import { config as loadEnv } from "dotenv";
import { GoogleGenAI, Modality, type LiveServerMessage } from "@google/genai";

import { DEFAULT_LIVE_MODEL, INPUT_SAMPLE_RATE } from "../lib/ai/live/config";

loadEnv();

/**
 * How long to wait after the audio stops before concluding the model is
 * genuinely holding.
 *
 * Comfortably longer than the most impatient persona (1200 ms) and than the
 * API's own chat-tuned default, so a pass cannot be a slow response.
 */
const HOLD_WINDOW_MS = 5000;

/** How long the model gets to answer once the turn is released. */
const REPLY_TIMEOUT_MS = 20_000;

/** Seconds of audio to send while the "candidate" is speaking. */
const SPEECH_SECONDS = 2;

const SYSTEM_INSTRUCTION =
  "You are an interviewer. Ask exactly one short question and then stop. Never speak until the candidate has finished.";

type Result = { name: string; ok: boolean; detail: string };
const results: Result[] = [];

function record(name: string, ok: boolean, detail: string): void {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}\n      ${detail}`);
}

/**
 * Speech-shaped PCM.
 *
 * Not real speech — this test is about *when* the model responds, not what it
 * transcribes. A voiced fundamental with a couple of harmonics and an envelope
 * is enough to look like activity to anything measuring energy.
 */
function speechLikePcm(seconds: number): Buffer {
  const total = INPUT_SAMPLE_RATE * seconds;
  const buffer = Buffer.alloc(total * 2);
  for (let i = 0; i < total; i += 1) {
    const t = i / INPUT_SAMPLE_RATE;
    const envelope = 0.5 + 0.5 * Math.sin(2 * Math.PI * 3 * t); // syllable rate
    const sample =
      (Math.sin(2 * Math.PI * 130 * t) * 0.6 +
        Math.sin(2 * Math.PI * 260 * t) * 0.25 +
        Math.sin(2 * Math.PI * 520 * t) * 0.15) *
      envelope *
      0.4;
    buffer.writeInt16LE(Math.max(-1, Math.min(1, sample)) * 0x7fff, i * 2);
  }
  return buffer;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function main(): Promise<void> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("GEMINI_API_KEY is not set. Nothing to test against.");
    process.exit(2);
  }

  const model = process.env.AI_LIVE_MODEL || DEFAULT_LIVE_MODEL;
  console.log(`model: ${model}\n`);

  const ai = new GoogleGenAI({ apiKey });

  // --- 1. the token mints with server VAD disabled -------------------------
  // If the upstream rejects this config the architecture cannot work at all,
  // and the failure would otherwise only appear at connect time in a browser.
  let token: string;
  try {
    const minted = await ai.authTokens.create({
      config: {
        uses: 1,
        expireTime: new Date(Date.now() + 10 * 60_000).toISOString(),
        newSessionExpireTime: new Date(Date.now() + 2 * 60_000).toISOString(),
        liveConnectConstraints: {
          model,
          config: {
            responseModalities: ["AUDIO" as never],
            systemInstruction: SYSTEM_INSTRUCTION,
            inputAudioTranscription: {},
            outputAudioTranscription: {},
            realtimeInputConfig: {
              automaticActivityDetection: { disabled: true },
            },
          },
        },
        lockAdditionalFields: [],
      },
    });
    if (!minted.name) throw new Error("no token name returned");
    token = minted.name;
    record("token mints with automaticActivityDetection disabled", true, "accepted upstream");
  } catch (error) {
    record(
      "token mints with automaticActivityDetection disabled",
      false,
      error instanceof Error ? error.message : "unknown error",
    );
    return finish();
  }

  // --- 2. connect ----------------------------------------------------------
  let setupComplete = false;
  let modelTurnAtMs: number | null = null;
  let transcriptionSeen = false;
  let inputTranscript = "";
  let closed: string | null = null;
  let startedSpeakingAtMs = 0;

  const client = new GoogleGenAI({
    apiKey: token,
    httpOptions: { apiVersion: "v1alpha" },
  });

  const session = await client.live.connect({
    model,
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
          transcriptionSeen = true;
          inputTranscript = content.inputTranscription.text;
        }
        // Any sign the model has begun producing a turn.
        const producing =
          Boolean(content.modelTurn?.parts?.length) ||
          Boolean(content.outputTranscription?.text) ||
          content.turnComplete === true;
        if (producing && modelTurnAtMs === null) {
          modelTurnAtMs = Date.now();
        }
      },
      onerror: (error: unknown) => {
        closed = `error: ${error instanceof Error ? error.message : String(error)}`;
      },
      onclose: (event: unknown) => {
        const reason = (event as { reason?: string } | undefined)?.reason;
        closed = `closed${reason ? `: ${reason}` : ""}`;
      },
    },
    config: {
      responseModalities: [Modality.AUDIO],
      systemInstruction: SYSTEM_INSTRUCTION,
      inputAudioTranscription: {},
      outputAudioTranscription: {},
      realtimeInputConfig: { automaticActivityDetection: { disabled: true } },
    },
  });

  for (let i = 0; i < 50 && !setupComplete; i += 1) await sleep(100);
  record("socket opens and setup completes", setupComplete, closed ?? "setupComplete received");
  if (!setupComplete) {
    session.close();
    return finish();
  }

  // The model is instructed to open; let any greeting land and be discounted,
  // so it is not mistaken for a reply to the candidate.
  await sleep(3000);
  modelTurnAtMs = null;

  // --- 3. the candidate speaks --------------------------------------------
  session.sendRealtimeInput({ activityStart: {} });
  startedSpeakingAtMs = Date.now();

  const pcm = speechLikePcm(SPEECH_SECONDS);
  const chunkBytes = 2048 * 2; // 128 ms at 16 kHz, matching the worklet.
  for (let offset = 0; offset < pcm.length; offset += chunkBytes) {
    session.sendRealtimeInput({
      audio: {
        data: pcm.subarray(offset, offset + chunkBytes).toString("base64"),
        mimeType: `audio/pcm;rate=${INPUT_SAMPLE_RATE}`,
      },
    });
    await sleep(128);
  }

  // --- 4. THE ASSERTION ----------------------------------------------------
  // Audio has stopped. Every persona's silence threshold has now elapsed
  // several times over. With server VAD disabled the model must still be
  // waiting, because the client has not released the turn.
  await sleep(HOLD_WINDOW_MS);

  const spokeEarly = modelTurnAtMs !== null;
  record(
    "model HOLDS through silence until the client releases the turn",
    !spokeEarly,
    spokeEarly
      ? `model began speaking ${modelTurnAtMs! - startedSpeakingAtMs}ms after speech started — server VAD is still active, the architecture does NOT work`
      : `silent for ${HOLD_WINDOW_MS}ms after audio stopped; the steering window is real`,
  );

  // --- 5. releasing the turn produces a reply ------------------------------
  session.sendRealtimeInput({ activityEnd: {} });
  const releasedAtMs = Date.now();

  const deadline = Date.now() + REPLY_TIMEOUT_MS;
  while (Date.now() < deadline && modelTurnAtMs === null) await sleep(200);

  const replied = modelTurnAtMs !== null;
  record(
    "activityEnd releases the turn and the model replies",
    replied,
    replied
      ? `replied ${modelTurnAtMs! - releasedAtMs}ms after activityEnd`
      : `no reply within ${REPLY_TIMEOUT_MS}ms — the turn never releases and the interview would hang`,
  );

  // Informational: whether transcription still flows with server VAD off.
  // Synthetic audio contains no words, so an empty result is expected and is
  // not a failure — this only reports what arrived.
  console.log(
    `\ninfo  inputTranscription events: ${transcriptionSeen ? "yes" : "none"}${
      inputTranscript ? ` (${JSON.stringify(inputTranscript.slice(0, 80))})` : ""
    }`,
  );
  console.log("info  synthetic tones carry no speech, so empty transcription here says nothing about real dictation.");

  session.close();
  finish();
}

function finish(): void {
  const failed = results.filter((result) => !result.ok);
  console.log(
    `\n${results.length - failed.length}/${results.length} checks passed`,
  );
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error("smoke test threw:", error instanceof Error ? error.message : error);
  process.exit(1);
});
