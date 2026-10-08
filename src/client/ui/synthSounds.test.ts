import { describe, expect, it } from "vitest";
import { Sounds, type SoundName } from "@client/ui/soundList";
import { synthesize } from "@client/ui/synthSounds";

const Rate = 22_050;
const names = Object.keys(Sounds) as SoundName[];

describe("synthesize", () => {
  it.each(names)("makes %s: audible, within -1 to 1, and short", (name) => {
    const samples = synthesize(name, Rate);
    expect(samples.length).toBeGreaterThan(0);
    // Long enough to hear, short enough to stay a sound effect (the dial tone is longest).
    expect(samples.length / Rate).toBeGreaterThanOrEqual(0.01);
    expect(samples.length / Rate).toBeLessThan(3.5);
    let loudest = 0;
    for (const sample of samples) {
      expect(Number.isFinite(sample)).toBe(true);
      loudest = Math.max(loudest, Math.abs(sample));
    }
    expect(loudest).toBeGreaterThan(0.5);
    expect(loudest).toBeLessThanOrEqual(1);
  });

  it("makes the same sound every time", () => {
    expect(synthesize("stamp", Rate)).toEqual(synthesize("stamp", Rate));
  });

  it("keeps the click tiny", () => {
    expect(synthesize("click", Rate).length / Rate).toBeLessThan(0.06);
  });

  it("gives the ringtone a pause before it loops", () => {
    const ring = synthesize("ring", Rate);
    const tail = ring.subarray(Math.round(1.2 * Rate));
    expect(tail.every((sample) => sample === 0)).toBe(true);
  });
});
