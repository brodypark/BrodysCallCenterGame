// How loud a victim line is at each moment, worked out once from its decoded audio, so the
// face's mouth can follow the words: open on loud syllables, shut between words. Plain
// functions, so they're tested without a browser.

export interface LoudnessEnvelope {
  framesPerSecond: number;
  // Each frame's loudness, from 0 (mouth shut) to 1 (wide open).
  frames: Float32Array;
}

export interface EnvelopeOptions {
  framesPerSecond: number;
  // A frame at this fraction of the line's loudest counts as fully loud (1).
  peakShare: number;
  // Frames under this (after scaling) count as silent (0).
  gate: number;
}

/** The loudness envelope of `samples` (one channel, -1 to 1) at `sampleRate`, scaled to the
 * line's own loudest moment so quiet and loud voices both move the mouth. */
export function loudnessEnvelope(
  samples: Float32Array,
  sampleRate: number,
  options: EnvelopeOptions,
): LoudnessEnvelope {
  const frameSize = Math.max(1, Math.round(sampleRate / options.framesPerSecond));
  const frameCount = Math.ceil(samples.length / frameSize);
  const frames = new Float32Array(frameCount);
  let peak = 0;
  for (let frame = 0; frame < frameCount; frame += 1) {
    const start = frame * frameSize;
    const end = Math.min(start + frameSize, samples.length);
    let sum = 0;
    for (let index = start; index < end; index += 1) {
      const sample = samples[index] ?? 0;
      sum += sample * sample;
    }
    // Root mean square: the frame's average loudness.
    const rms = Math.sqrt(sum / Math.max(1, end - start));
    frames[frame] = rms;
    peak = Math.max(peak, rms);
  }
  const fullAt = peak * options.peakShare;
  for (let frame = 0; frame < frameCount; frame += 1) {
    const scaled = fullAt > 0 ? Math.min((frames[frame] ?? 0) / fullAt, 1) : 0;
    frames[frame] = scaled < options.gate ? 0 : scaled;
  }
  return { framesPerSecond: options.framesPerSecond, frames };
}

/** How loud the line is `seconds` in: 0 before it starts and after it ends. */
export function loudnessAt(envelope: LoudnessEnvelope, seconds: number): number {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return 0;
  }
  return envelope.frames[Math.floor(seconds * envelope.framesPerSecond)] ?? 0;
}
