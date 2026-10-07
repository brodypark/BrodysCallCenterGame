import { describe, expect, it } from "vitest";
import { Config } from "@shared/Config";
import { applySuspicionChange, clampSuspicionChange, trustMeter } from "@server/services/suspicion";

describe("clampSuspicionChange", () => {
  it("keeps changes within the per-turn limits, as whole numbers", () => {
    expect(clampSuspicionChange(-5)).toBe(-5);
    expect(clampSuspicionChange(-999)).toBe(-Config.Suspicion.MaxDropPerTurn);
    expect(clampSuspicionChange(999)).toBe(Config.Suspicion.MaxRisePerTurn);
    expect(clampSuspicionChange(4.6)).toBe(5);
  });

  it("treats numbers that aren't real as no change", () => {
    expect(clampSuspicionChange(Number.NaN)).toBe(0);
    expect(clampSuspicionChange(Number.POSITIVE_INFINITY)).toBe(0);
    expect(clampSuspicionChange(Number.NEGATIVE_INFINITY)).toBe(0);
  });
});

describe("applySuspicionChange", () => {
  it("keeps suspicion within its range", () => {
    expect(applySuspicionChange(40, -10)).toBe(30);
    expect(applySuspicionChange(10, -25)).toBe(Config.Suspicion.Min);
    expect(applySuspicionChange(95, 15)).toBe(Config.Suspicion.Max);
  });
});

describe("trustMeter", () => {
  it("measures trust towards the hang-up threshold", () => {
    expect(trustMeter(0, 100, 30).percent).toBe(100);
    expect(trustMeter(45, 90, 25).percent).toBe(50);
    expect(trustMeter(90, 90, 25).percent).toBe(0);
    expect(trustMeter(100, 90, 25).percent).toBe(0);
  });

  it("marks where trust has to climb past for the code", () => {
    expect(trustMeter(40, 100, 30).revealAt).toBe(70);
    expect(trustMeter(40, 80, 20).revealAt).toBe(75);
  });

  it("picks the word from how close they are to hanging up", () => {
    expect(trustMeter(29, 100, 30).word).toBe("trusting");
    expect(trustMeter(30, 100, 30).word).toBe("unsure");
    expect(trustMeter(50, 100, 30).word).toBe("wary");
    expect(trustMeter(75, 100, 30).word).toBe("angry");
  });
});
