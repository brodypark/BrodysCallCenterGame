// Time units. Config holds durations in seconds; timers want milliseconds.

export const MsPerSecond = 1000;

export function secondsToMs(seconds: number): number {
  return seconds * MsPerSecond;
}
