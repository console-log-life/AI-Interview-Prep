import {
  AUDIO_CHUNK_SAMPLES,
  INPUT_SAMPLE_RATE,
  OUTPUT_SAMPLE_RATE,
} from "@/lib/ai/live/config";

/**
 * Browser audio plumbing for the live interview.
 *
 * Two independent AudioContexts, because capture and playback run at different
 * sample rates the Live API fixes for us: 16 kHz in, 24 kHz out. Constructing
 * each context at the required rate lets the browser resample, which is both
 * faster and more correct than doing it in JavaScript.
 *
 * Everything allocated here is released by `dispose()`. A live interview holds
 * a microphone, two audio graphs and a camera; leaking any of them leaves the
 * browser's recording indicator on after the user has navigated away, which is
 * a genuine privacy problem rather than an untidy one.
 */

export type AudioManagerCallbacks = {
  /** Fired for each captured PCM chunk, ready to send. */
  onChunk: (pcm: ArrayBuffer) => void;
  /** Fired when queued interviewer audio starts or stops playing. */
  onPlaybackChange?: (playing: boolean) => void;
};

export class LiveAudioManager {
  private inputContext: AudioContext | null = null;
  private outputContext: AudioContext | null = null;
  private recorderNode: AudioWorkletNode | null = null;
  private playerNode: AudioWorkletNode | null = null;
  /**
   * Output volume control.
   *
   * A gain node rather than pausing the context, so muting the interviewer
   * does not also stall the queue: audio keeps flowing and the transcript
   * keeps pace, the candidate simply stops hearing it. Pausing would leave
   * seconds of stale speech to play out on unmute.
   */
  private outputGain: GainNode | null = null;
  /**
   * Measurement tap on the interviewer's voice.
   *
   * Branched off the player *before* the gain node, so the visualiser still
   * reflects that the interviewer is talking when the candidate has muted
   * their speakers — that is true, and hiding it would leave a muted candidate
   * unable to tell whether anything is happening.
   */
  private outputAnalyser: AnalyserNode | null = null;
  private levelBuffer: Uint8Array<ArrayBuffer> | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private muted = false;

  constructor(private readonly callbacks: AudioManagerCallbacks) {}

  /** Wires the microphone stream into the recorder worklet. */
  async startCapture(stream: MediaStream): Promise<void> {
    if (this.inputContext) return;

    this.inputContext = new AudioContext({ sampleRate: INPUT_SAMPLE_RATE });
    await this.inputContext.audioWorklet.addModule("/worklets/pcm-recorder.js");

    this.source = this.inputContext.createMediaStreamSource(stream);
    this.recorderNode = new AudioWorkletNode(this.inputContext, "pcm-recorder", {
      processorOptions: { chunkSize: AUDIO_CHUNK_SAMPLES },
      numberOfInputs: 1,
      numberOfOutputs: 0,
    });

    this.recorderNode.port.onmessage = (event) => {
      // Muting is enforced here rather than by stopping the track: stopping
      // and restarting a track renegotiates the device and drops the first
      // syllable when the candidate unmutes.
      if (this.muted) return;
      this.callbacks.onChunk(event.data as ArrayBuffer);
    };

    this.source.connect(this.recorderNode);
  }

  /** Prepares the playback graph for the interviewer's voice. */
  async startPlayback(): Promise<void> {
    if (this.outputContext) return;

    this.outputContext = new AudioContext({ sampleRate: OUTPUT_SAMPLE_RATE });
    await this.outputContext.audioWorklet.addModule("/worklets/pcm-player.js");

    this.playerNode = new AudioWorkletNode(this.outputContext, "pcm-player", {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [1],
    });

    this.playerNode.port.onmessage = (event) => {
      if (event.data?.type === "playing") {
        this.callbacks.onPlaybackChange?.(Boolean(event.data.playing));
      }
    };

    this.outputGain = this.outputContext.createGain();
    this.playerNode.connect(this.outputGain);
    this.outputGain.connect(this.outputContext.destination);

    this.outputAnalyser = this.outputContext.createAnalyser();
    // Small window, heavily smoothed: this drives a decorative meter, not an
    // analysis, and a jittery bar reads as noise rather than speech.
    this.outputAnalyser.fftSize = 256;
    this.outputAnalyser.smoothingTimeConstant = 0.7;
    this.levelBuffer = new Uint8Array(
      new ArrayBuffer(this.outputAnalyser.frequencyBinCount),
    );
    // An AnalyserNode is a valid sink; it needs no route to the destination.
    this.playerNode.connect(this.outputAnalyser);
  }

  /** Queues a chunk of interviewer audio (base64 16-bit PCM at 24 kHz). */
  enqueue(base64Pcm: string): void {
    if (!this.playerNode) return;
    const samples = decodePcm16(base64Pcm);
    this.playerNode.port.postMessage(
      { type: "chunk", samples: samples.buffer },
      [samples.buffer],
    );
  }

  /**
   * Barge-in: drop everything queued.
   *
   * Called on the Live API's `interrupted` signal. Without this the AI keeps
   * talking over the candidate for however many seconds are already buffered,
   * which is exactly the behaviour that makes a voice agent feel broken.
   */
  flushPlayback(): void {
    this.playerNode?.port.postMessage({ type: "flush" });
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
  }

  /** Silences the interviewer's voice without interrupting the session. */
  setOutputMuted(muted: boolean): void {
    if (this.outputGain) this.outputGain.gain.value = muted ? 0 : 1;
  }

  /**
   * Current loudness of the interviewer's voice, 0-1.
   *
   * Read on demand rather than pushed, so the caller can sample it from an
   * animation frame without a state update — and therefore without a React
   * render — for every audio buffer.
   *
   * Returns 0 when nothing is playing, which is what makes the meter stop by
   * itself instead of needing to be told to.
   */
  outputLevel(): number {
    if (!this.outputAnalyser || !this.levelBuffer) return 0;
    this.outputAnalyser.getByteTimeDomainData(this.levelBuffer);

    let sum = 0;
    for (const value of this.levelBuffer) {
      const centred = (value - 128) / 128;
      sum += centred * centred;
    }
    const rms = Math.sqrt(sum / this.levelBuffer.length);
    // Speech RMS sits well below 1; scaling makes the meter use its range
    // without ever reporting more than full.
    return Math.min(1, rms * 3);
  }

  /** Browsers start contexts suspended until a user gesture. */
  async resume(): Promise<void> {
    await this.inputContext?.resume();
    await this.outputContext?.resume();
  }

  async dispose(): Promise<void> {
    this.flushPlayback();

    this.recorderNode?.port.close();
    this.playerNode?.port.close();
    this.source?.disconnect();
    this.recorderNode?.disconnect();
    this.outputGain?.disconnect();
    this.outputAnalyser?.disconnect();
    this.playerNode?.disconnect();

    await this.inputContext?.close().catch(() => undefined);
    await this.outputContext?.close().catch(() => undefined);

    this.source = null;
    this.recorderNode = null;
    this.playerNode = null;
    this.inputContext = null;
    this.outputContext = null;
  }
}

/** base64 PCM16 → Float32 samples in [-1, 1]. */
export function decodePcm16(base64: string): Float32Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);

  const view = new DataView(bytes.buffer);
  const samples = new Float32Array(bytes.length / 2);
  for (let i = 0; i < samples.length; i += 1) {
    samples[i] = view.getInt16(i * 2, true) / 0x8000;
  }
  return samples;
}

/** ArrayBuffer → base64, for sending captured PCM over the socket. */
export function encodeBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  // Chunked to avoid blowing the argument limit on long buffers.
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}
