import { describe, expect, it } from "vitest";
import { formatClock, secondsToMs } from "@shared/time";

describe("time", () => {
  it("formats countdowns as m:ss, rounding up and never below zero", () => {
    expect(formatClock(480)).toBe("8:00");
    expect(formatClock(65.2)).toBe("1:06");
    expect(formatClock(5)).toBe("0:05");
    expect(formatClock(-3)).toBe("0:00");
  });

  it("converts seconds to milliseconds", () => {
    expect(secondsToMs(1.5)).toBe(1500);
  });
});
