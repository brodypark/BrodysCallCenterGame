// Tunable values shared by the server and the client: timers, limits and rules. No magic
// numbers elsewhere. Starting values come from docs/design.md and are meant to be tuned in
// playtesting. Server-only values live in src/server/config.ts; per-scenario values (card
// value, suspicion start/threshold/trust level, unlock level) live in each scenario module.
// Sections are added as the build steps need them.

export const Config = {
  Call: {
    // Seconds after a player arrives before the first call rings.
    FirstCallDelaySeconds: 5,
    // Seconds an incoming call rings before it's missed.
    RingSeconds: 15,
    // Seconds between one call ending and the next one ringing.
    SecondsBetweenCalls: 5,
    // Longest message a player can type, in characters.
    MaxTypedMessageLength: 200,
    // Most chat messages kept per call; the oldest drop off. Calls have no turn cap, so
    // without this a long call would keep growing (and be resent whole on every change).
    MaxTranscriptMessages: 60,
    // After a player's connection drops (or they refresh), how long their call waits for
    // them to come back before everything about them is cleared.
    ReconnectGraceSeconds: 30,
  },

  Turn: {
    // Fake "thinking" time before a scripted reply. AI replies (step 8) take as long as the
    // AI does instead.
    ThinkingSeconds: 1.5,
    // How long a victim line "takes" when there's no voice to play: this many seconds per
    // character, kept between Min and Max. MinSpeakingSeconds is also the soonest the server
    // accepts that a line has been said, so skipping can't rush the call.
    SpeakingSecondsPerCharacter: 0.05,
    MinSpeakingSeconds: 1.5,
    MaxSpeakingSeconds: 10,
    // How long the server waits for the client to finish saying a line before moving on
    // anyway: this many seconds per character, plus SafetyExtraSeconds. Only matters if the
    // client never reports back.
    SafetySecondsPerCharacter: 0.15,
    SafetyExtraSeconds: 5,
  },

  Connection: {
    // When the server turns the connection down (e.g. the player cookie is missing), how
    // long the client waits before getting a new cookie and trying again.
    RetrySeconds: 2,
  },

  Suspicion: {
    // Suspicion runs from Min (fully fooled) to Max. Scenarios set their own starting
    // value, hang-up threshold and trust level inside this range.
    Min: 0,
    Max: 100,
  },

  Code: {
    // Fake codes look like PRE-XXX, e.g. GMA-7QZ: the scenario's prefix (exactly this many
    // capitals or digits), then random characters.
    PrefixLength: 3,
  },

  Card: {
    // Every Wobblebucks Card starts with this (e.g. WBK-7QZ), so it can't be mistaken for a
    // gift card. No scenario may use it as its code prefix.
    Prefix: "WBK",
    // The smallest and biggest amounts the Wobblebucks Machine will charge, in dollars.
    MinChargeAmount: 1,
    MaxChargeAmount: 999,
  },

  AI: {
    // Longest victim line, in characters (voice cost grows with characters). Scripted lines
    // are checked against it too.
    MaxReplyLength: 200,
  },
} as const;
