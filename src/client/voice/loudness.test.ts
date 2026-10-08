import { describe, expect, it } from "vitest";
import { loudnessAt, loudnessEnvelope } from "@client/voice/loudness";

const Rate = 1000;
const Options = { framesPerSecond: 10, peakShare: 0.5, gate: 0.2 };

/** `seconds` of a steady tone at `level` (0 to 1). */
function tone(level: number, seconds: number): number[] {
  return Array.from({ length: seconds * Rate }, (_, index) => (index % 2 ? level : -level));
}

describe("loudnessEnvelope", () => {
  it("opens for loud parts, shuts for silence, scaled to the line's loudest", () => {
    // Loud, silent, half as loud, very quiet.
    const samples = new Float32Array([
      ...tone(0.4, 0.2),
      ...tone(0, 0.2),
      ...tone(0.2, 0.2),
      ...tone(0.02, 0.2),
    ]);
    const envelope = loudnessEnvelope(samples, Rate, Options);
    expect(envelope.frames).toHaveLength(8);
    // The loudest part is past peakShare, so fully open.
    expect(loudnessAt(envelope, 0.05)).toBe(1);
    expect(loudnessAt(envelope, 0.25)).toBe(0);
    // Half the peak is exactly peakShare: fully open too.
    expect(loudnessAt(envelope, 0.45)).toBeCloseTo(1);
    // A tenth of peakShare is under the gate.
    expect(loudnessAt(envelope, 0.65)).toBe(0);
  });

  it("works the same for a quiet voice", () => {
    const loud = loudnessEnvelope(new Float32Array(tone(0.8, 0.1)), Rate, Options);
    const quiet = loudnessEnvelope(new Float32Array(tone(0.05, 0.1)), Rate, Options);
    expect(Array.from(quiet.frames)).toEqual(Array.from(loud.frames));
  });

  it("is all shut for silence", () => {
    const envelope = loudnessEnvelope(new Float32Array(Rate), Rate, Options);
    expect(Array.from(envelope.frames).every((frame) => frame === 0)).toBe(true);
  });
});

describe("loudnessAt", () => {
  it("is 0 outside the line", () => {
    const envelope = loudnessEnvelope(new Float32Array(tone(0.5, 0.1)), Rate, Options);
    expect(loudnessAt(envelope, -1)).toBe(0);
    expect(loudnessAt(envelope, 5)).toBe(0);
    expect(loudnessAt(envelope, Number.NaN)).toBe(0);
  });
});
