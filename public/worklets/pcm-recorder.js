/**
 * Microphone → 16-bit PCM chunks, on the audio thread.
 *
 * An AudioWorklet is used rather than the deprecated ScriptProcessorNode
 * because ScriptProcessor runs on the main thread: any React render or layout
 * during the interview would stutter the captured audio, which the model hears
 * as clipped speech.
 *
 * The worklet only converts and buffers. Resampling to the 16 kHz the Live API
 * requires is done by the AudioContext itself (constructed at that rate), so
 * there is no resampling maths here to get subtly wrong.
 */
class PcmRecorderProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    // Frames per message. Set from config so the two cannot drift apart.
    this.chunkSize = options?.processorOptions?.chunkSize ?? 2048;
    this.buffer = new Float32Array(this.chunkSize);
    this.offset = 0;
  }

  process(inputs) {
    const channel = inputs[0]?.[0];
    // No input yet (or the track ended) — keep the node alive regardless.
    if (!channel) return true;

    for (let i = 0; i < channel.length; i += 1) {
      this.buffer[this.offset] = channel[i];
      this.offset += 1;

      if (this.offset === this.chunkSize) {
        // Transfer the buffer rather than copying it — this runs several
        // times a second for the whole interview.
        const pcm = toPcm16(this.buffer);
        this.port.postMessage(pcm, [pcm]);
        this.offset = 0;
      }
    }
    return true;
  }
}

/** Float32 [-1,1] → little-endian signed 16-bit PCM. */
function toPcm16(input) {
  const output = new ArrayBuffer(input.length * 2);
  const view = new DataView(output);
  for (let i = 0; i < input.length; i += 1) {
    // Clamp before scaling: values slightly outside [-1,1] wrap and produce
    // audible clicks that the model can mistake for speech onsets.
    const sample = Math.max(-1, Math.min(1, input[i]));
    view.setInt16(i * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
  }
  return output;
}

registerProcessor("pcm-recorder", PcmRecorderProcessor);
