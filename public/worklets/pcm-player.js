/**
 * Queued PCM playback for the interviewer's voice.
 *
 * The Live API streams 24 kHz PCM faster than realtime, so chunks must be
 * queued and played back at a steady rate rather than fired at an <audio>
 * element. Doing it in a worklet also makes barge-in exact: a "flush" message
 * drops every queued sample immediately, so the AI stops mid-word the moment
 * the candidate speaks, rather than finishing whatever was already buffered.
 */
class PcmPlayerProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    /** @type {Float32Array[]} */
    this.queue = [];
    this.readOffset = 0;
    this.playing = false;

    this.port.onmessage = (event) => {
      const data = event.data;
      if (data?.type === "flush") {
        // Barge-in: discard everything buffered, not just stop appending.
        this.queue = [];
        this.readOffset = 0;
        this.notify(false);
        return;
      }
      if (data?.type === "chunk" && data.samples) {
        this.queue.push(new Float32Array(data.samples));
      }
    };
  }

  notify(playing) {
    if (this.playing !== playing) {
      this.playing = playing;
      this.port.postMessage({ type: "playing", playing });
    }
  }

  process(_inputs, outputs) {
    const output = outputs[0]?.[0];
    if (!output) return true;

    let written = 0;
    while (written < output.length && this.queue.length > 0) {
      const current = this.queue[0];
      const available = current.length - this.readOffset;
      const need = output.length - written;
      const take = Math.min(available, need);

      output.set(current.subarray(this.readOffset, this.readOffset + take), written);
      written += take;
      this.readOffset += take;

      if (this.readOffset >= current.length) {
        this.queue.shift();
        this.readOffset = 0;
      }
    }

    // Pad the rest with silence so the node never underruns into noise.
    if (written < output.length) output.fill(0, written);

    this.notify(this.queue.length > 0);
    return true;
  }
}

registerProcessor("pcm-player", PcmPlayerProcessor);
