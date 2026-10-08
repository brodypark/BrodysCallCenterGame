// Time units. Config holds durations in seconds; timers want milliseconds.

export const MsPerSecond = 1000;

export function secondsToMs(seconds: number): number {
  return seconds * MsPerSecond;
}

const SecondsPerMinute = 60;

/** A countdown as m:ss, e.g. 7:05. Never negative. */
export function formatClock(seconds: number): string {
  const whole = Math.max(0, Math.ceil(seconds));
  const minutes = Math.floor(whole / SecondsPerMinute);
  const rest = whole % SecondsPerMinute;
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}
