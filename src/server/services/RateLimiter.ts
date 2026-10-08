// Cost guard for paid API requests (Gemini now, ElevenLabs later): a per-player limit in any
// rolling minute, a per-player daily cap, and a daily cap for everyone together. Days are
// UTC days. Counts live in memory, so a server restart starts them over.

const MsPerMinute = 60_000;

export interface RateLimits {
  perMinute: number;
  perDay: number;
  globalPerDay: number;
}

interface PlayerUsage {
  // Requests today.
  today: number;
  // When each request in the last minute was made, oldest first.
  recent: number[];
}

/** The UTC day a time falls on, e.g. 2026-10-07. */
function utcDay(time: number): string {
  return new Date(time).toISOString().slice(0, "YYYY-MM-DD".length);
}

export class RateLimiter {
  private readonly limits: RateLimits;
  private readonly now: () => number;
  private readonly players = new Map<string, PlayerUsage>();
  private day: string;
  private globalToday = 0;

  constructor(limits: RateLimits, now: () => number = Date.now) {
    this.limits = limits;
    this.now = now;
    this.day = utcDay(now());
  }

  /** Counts one request for `playerId` if it's within every limit. Returns whether it is;
   * a request that isn't allowed doesn't count. */
  tryTake(playerId: string): boolean {
    const now = this.now();
    const today = utcDay(now);
    if (today !== this.day) {
      // A new day: everyone starts over, and yesterday's players are forgotten.
      this.day = today;
      this.globalToday = 0;
      this.players.clear();
    }
    if (this.globalToday >= this.limits.globalPerDay) {
      return false;
    }
    const usage = this.players.get(playerId) ?? { today: 0, recent: [] };
    const minuteAgo = now - MsPerMinute;
    usage.recent = usage.recent.filter((time) => time > minuteAgo);
    if (usage.today >= this.limits.perDay || usage.recent.length >= this.limits.perMinute) {
      return false;
    }
    usage.today += 1;
    usage.recent.push(now);
    this.globalToday += 1;
    this.players.set(playerId, usage);
    return true;
  }
}
