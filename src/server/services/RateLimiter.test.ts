import { describe, expect, it } from "vitest";
import { RateLimiter } from "@server/services/RateLimiter";

const Minute = 60_000;
const Day = 24 * 60 * Minute;
// Midday UTC, so a few minutes either way stays on the same day.
const Start = Date.UTC(2026, 9, 7, 12);

function setup(limits: { perMinute?: number; perDay?: number; globalPerDay?: number } = {}) {
  let now = Start;
  const limiter = new RateLimiter(
    {
      perMinute: limits.perMinute ?? 100,
      perDay: limits.perDay ?? 1000,
      globalPerDay: limits.globalPerDay ?? 10_000,
    },
    () => now,
  );
  return {
    limiter,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

describe("RateLimiter", () => {
  it("counts an amount against the daily caps, but one request against the minute", () => {
    const { limiter } = setup({ perMinute: 3, perDay: 100, globalPerDay: 150 });
    expect(limiter.tryTake("a", 60)).toBe(true);
    // 60 + 50 would pass the player's 100.
    expect(limiter.tryTake("a", 50)).toBe(false);
    expect(limiter.tryTake("a", 40)).toBe(true);
    // 100 + 60 would pass everyone's 150.
    expect(limiter.tryTake("b", 60)).toBe(false);
    expect(limiter.tryTake("b", 50)).toBe(true);
  });

  it("refuses an amount that isn't a count", () => {
    const { limiter } = setup();
    expect(limiter.tryTake("a", -5)).toBe(false);
    expect(limiter.tryTake("a", Number.NaN)).toBe(false);
  });

  it("allows a player only so many requests in a rolling minute", () => {
    const { limiter, advance } = setup({ perMinute: 2 });
    expect(limiter.tryTake("a")).toBe(true);
    advance(Minute / 2);
    expect(limiter.tryTake("a")).toBe(true);
    expect(limiter.tryTake("a")).toBe(false);
    // Another player has their own limit.
    expect(limiter.tryTake("b")).toBe(true);
    // A minute after the first, that one no longer counts.
    advance(Minute / 2 + 1);
    expect(limiter.tryTake("a")).toBe(true);
    expect(limiter.tryTake("a")).toBe(false);
  });

  it("caps a player per day, and starts over the next UTC day", () => {
    const { limiter, advance } = setup({ perDay: 2 });
    expect(limiter.tryTake("a")).toBe(true);
    expect(limiter.tryTake("a")).toBe(true);
    advance(2 * Minute);
    expect(limiter.tryTake("a")).toBe(false);
    advance(Day);
    expect(limiter.tryTake("a")).toBe(true);
  });

  it("caps everyone together per day", () => {
    const { limiter, advance } = setup({ globalPerDay: 2 });
    expect(limiter.tryTake("a")).toBe(true);
    expect(limiter.tryTake("b")).toBe(true);
    expect(limiter.tryTake("c")).toBe(false);
    advance(Day);
    expect(limiter.tryTake("c")).toBe(true);
  });

  it("doesn't count requests it turns down", () => {
    const { limiter, advance } = setup({ perMinute: 1, perDay: 2 });
    expect(limiter.tryTake("a")).toBe(true);
    expect(limiter.tryTake("a")).toBe(false);
    expect(limiter.tryTake("a")).toBe(false);
    advance(Minute + 1);
    // Only one counted today, so one more is allowed.
    expect(limiter.tryTake("a")).toBe(true);
  });
});
