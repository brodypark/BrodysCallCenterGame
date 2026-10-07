import { describe, expect, it } from "vitest";
import { Config } from "@shared/Config";
import { fakeSpeakingSeconds, safetySeconds } from "@shared/speechTiming";

describe("fakeSpeakingSeconds", () => {
  it("grows with the line's length", () => {
    const text = "x".repeat(100);
    expect(fakeSpeakingSeconds(text)).toBeCloseTo(100 * Config.Turn.SpeakingSecondsPerCharacter);
  });

  it("stays between the shortest and longest speaking times", () => {
    expect(fakeSpeakingSeconds("Hi")).toBe(Config.Turn.MinSpeakingSeconds);
    expect(fakeSpeakingSeconds("x".repeat(10_000))).toBe(Config.Turn.MaxSpeakingSeconds);
  });

  it("counts characters, not UTF-16 units", () => {
    expect(fakeSpeakingSeconds("😀".repeat(100))).toBe(fakeSpeakingSeconds("x".repeat(100)));
  });
});

describe("safetySeconds", () => {
  it("always gives the client longer than the fake speaking time", () => {
    for (const length of [1, 50, 200, 1000]) {
      const text = "x".repeat(length);
      expect(safetySeconds(text)).toBeGreaterThan(fakeSpeakingSeconds(text));
    }
  });
});
