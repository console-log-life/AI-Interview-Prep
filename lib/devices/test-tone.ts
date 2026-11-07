/**
 * A synthesized speaker-test sound.
 *
 * Generated rather than shipped as an asset so the check works offline and
 * costs no request, and returned as a WAV blob so it can be played through an
 * `<audio>` element — which, unlike a raw AudioContext, supports `setSinkId`
 * and therefore lets the candidate test a *chosen* output device rather than
 * whichever one the system happens to prefer.
 *
 * Two rising tones with a soft envelope: distinctive enough that a candidate
 * knows whether they heard it, short enough not to be irritating on the third
 * re-check, and no clicks at the edges that a hard start would produce.
 */

const SAMPLE_RATE = 44_100;
const TONE_MS = 260;
const FREQUENCIES = [523.25, 783.99]; // C5 then G5.

export function buildTestTone(): Blob {
  const perTone = Math.floor((SAMPLE_RATE * TONE_MS) / 1000);
  const total = perTone * FREQUENCIES.length;
  const samples = new Float32Array(total);

  FREQUENCIES.forEach((frequency, index) => {
    const offset = index * perTone;
    for (let i = 0; i < perTone; i += 1) {
      const t = i / SAMPLE_RATE;
      // Raised-cosine envelope: silence at both ends, so no click.
      const envelope = 0.5 * (1 - Math.cos((2 * Math.PI * i) / perTone));
      samples[offset + i] = Math.sin(2 * Math.PI * frequency * t) * envelope * 0.35;
    }
  });

  return new Blob([encodeWav(samples)], { type: "audio/wav" });
}

/** Minimal 16-bit mono PCM WAV container. */
function encodeWav(samples: Float32Array): ArrayBuffer {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  const writeAscii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i));
  };

  writeAscii(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeAscii(8, "WAVE");
  writeAscii(12, "fmt ");
  view.setUint32(16, 16, true); // PCM header size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, SAMPLE_RATE * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  writeAscii(36, "data");
  view.setUint32(40, samples.length * 2, true);

  for (let i = 0; i < samples.length; i += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, clamped * 0x7fff, true);
  }

  return buffer;
}
