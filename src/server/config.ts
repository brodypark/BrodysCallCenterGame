// Server-only tunables. Values both sides need live in src/shared/Config.ts.
// vite.config.ts imports this file before the @ aliases exist, so keep it free of imports.

export const ServerConfig = {
  // Port and host the game server listens on when PORT / HOST aren't set in .env. Vite's dev
  // server forwards /socket.io here.
  DefaultPort: 3000,
  DefaultHost: "localhost",
  // In production the host's proxy forwards to the server from outside, so it listens on
  // every network interface unless HOST says otherwise.
  DefaultProductionHost: "0.0.0.0",
  // How production finds a player's IP behind the host's proxies (net/clientIp). Render puts
  // Cloudflare in front of every service, and Cloudflare sets this header to the visitor's
  // address itself, overwriting any the browser sent. On a host without Cloudflare in front,
  // set it to null, or players could send their own.
  ClientIpHeader: "cf-connecting-ip" as string | null,
  // Without that header: how many proxies append to X-Forwarded-For. A player's IP is read
  // that many entries from the right; entries further left come from the client and can be
  // forged. Also how many hops Fastify trusts.
  TrustedProxyHops: 1,
  // The built client, relative to the built server (dist/server). Served in production only;
  // in development Vite serves the client.
  ClientBuildDir: "../client",
  // On SIGINT/SIGTERM, how long to wait for open requests to finish before exiting anyway.
  ShutdownTimeoutMs: 5000,
  // The biggest Socket.IO message a client may send. Game events are tiny; voice clips go
  // over HTTP instead (step 10).
  MaxSocketMessageBytes: 16 * 1024,
  // Most game connections open at once from one IP address, against bots making endless
  // anonymous players. A household or office shares one address, so it's well above a
  // family's worth. A connection over it is turned away and the client keeps retrying.
  MaxConnectionsPerIp: 20,

  // The Email app (MailService). Mail is written out on the server, so these stay here.
  Mail: {
    // Most emails kept in an inbox; the oldest go first.
    MaxInbox: 50,
    // In one shift: callers hanging up on the player, the player hanging up on callers, and
    // calls declined or left ringing, before HR or the boss sends a warning.
    HungUpOnWarning: 3,
    HangingUpWarning: 3,
    IgnoredCallsWarning: 3,
  },

  // Skibidi's live audits (AuditService): mid-call side objectives, emailed during a Campaign
  // call. The objectives are checked on the server, so their rules stay here.
  Audit: {
    // The chance (0 to 1) that a call gets an audit, rolled once per call, right after the
    // player's AfterPlayerTurn-th message.
    Chance: 0.3,
    AfterPlayerTurn: 2,
    // Most audits in one shift.
    MaxPerShift: 2,
    // Passing adds this to the shift's earnings, plus this much XP.
    PassMoney: 25,
    PassXP: 20,
    // Failing raises this shift's quota by this much.
    FailQuotaRaise: 25,
    // "Say it": the phrase, and how many times.
    Phrase: "thank you for choosing us",
    PhraseTimes: 2,
    // "Forbidden word": any word starting with this ("scams", "scammer") counts.
    ForbiddenWord: "scam",
    // "Speed run": get the code within this many of the player's messages.
    SpeedRunTurns: 4,
  },

  // Bait callers: now and then a caller is secretly an undercover scam-buster. They play the
  // usual victim but drop tells and read out a trap code; cashing it in gets the player
  // hacked. Hidden from the client, so a call never gives away that it's bait.
  Bait: {
    // The chance (0 to 1) that a call is bait, rolled when it rings, from MinLevel up.
    Chance: 0.07,
    MinLevel: 2,
    // Every bait code starts with this (e.g. HNY-7QZ), so players can learn to spot one. No
    // scenario may use it.
    CodePrefix: "HNY",
    // Taken from the player's banked money (never below 0) when they're hacked.
    Fine: 300,
    // How long the hacked screen stays frozen.
    HackSeconds: 10,
  },

  Database: {
    // The SQLite file with everyone's saves, relative to the server's own folder (src/server
    // in development, dist/server when built), so both use the project's gitignored data/
    // folder wherever the server is started from.
    Path: "../../data/scamgpt.sqlite",
    // Database calls block the whole server while they wait, so the waits are kept short.
    // SQLite waits up to BusyTimeoutMs for a lock; a call still busy after that is tried
    // again up to MaxRetries times, pausing RetryBaseMs, then twice that. Worst case:
    // 3 x 250 + 50 + 100 = 900 ms.
    BusyTimeoutMs: 250,
    MaxRetries: 2,
    RetryBaseMs: 50,
  },

  // Cost guards on Gemini requests (one per victim reply). Kept on the server so players
  // can't see how close they are. A request over any limit gets a scripted reply instead.
  AILimits: {
    // Per player, in any rolling minute. A turn takes several seconds, so real play stays
    // well under this.
    PerMinute: 20,
    // Per player, per UTC day: about 30 calls when the first model answers. Backup models
    // and hedges (AIService) use extra requests on a bad turn.
    PerDay: 300,
    // All players together, per UTC day. New anonymous players are free to make, so this is
    // the real ceiling on the bill: about $4 a day at Config.AI.Model's prices, more if many
    // requests go to the pricier backup models. A hedge that loses is stopped but may still
    // be billed, and its tokens aren't in the per-call log.
    GlobalPerDay: 5000,
  },

  // Cost guards on ElevenLabs victim voice lines. A line over any limit is shown as
  // subtitles only. Kept on the server so players can't see how close they are.
  VoiceLimits: {
    // Lines per player in any rolling minute. Real play is a few a minute.
    PerMinute: 20,
    // Characters per player, per UTC day: about 100 lines.
    PerDayCharacters: 15_000,
    // Characters for all players together, per UTC day: the real ceiling on the bill.
    GlobalPerDayCharacters: 100_000,
  },

  // ElevenLabs text-to-speech for victim lines (docs read 2026-10-08).
  ElevenLabs: {
    // Streaming text-to-speech: POST {BaseUrl}/{voiceId}/stream.
    BaseUrl: "https://api.elevenlabs.io/v1/text-to-speech",
    // The fast, cheap model (eleven_turbo_v2_5 is deprecated in its favor).
    Model: "eleven_flash_v2_5",
    // MP3 at 64 kbps: plenty for a voice, and half the download of the default.
    OutputFormat: "mp3_44100_64",
    // How long to wait for the audio to start arriving (the audio itself then streams).
    // Kept well under Config.Voice.LoadTimeoutSeconds, which covers the whole download, so
    // a retry still has time to work.
    RequestTimeoutMs: 3500,
    // Tries again after a network error, a timeout or a 5xx/429 this many times, waiting
    // RetryBaseMs (then twice that).
    MaxRetries: 1,
    RetryBaseMs: 400,
  },

  PlayerCookie: {
    Name: "scamgpt_player",
    // A year. Every visit starts it again.
    MaxAgeSeconds: 365 * 24 * 60 * 60,
    // Signs the cookie in development when COOKIE_SECRET isn't set, so restarting the dev
    // server keeps your player id. Never used in production, which refuses to start without
    // a real secret.
    DevSecret: "scamgpt-development-only-cookie-secret",
    // The shortest COOKIE_SECRET production accepts.
    MinSecretLength: 32,
  },
} as const;
