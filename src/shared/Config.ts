// Tunable values shared by the server and the client: timers, limits and rules. No magic
// numbers elsewhere. Starting values come from docs/design.md and are meant to be tuned in
// playtesting. Server-only values live in src/server/config.ts; per-scenario values (card
// value, suspicion start/threshold/trust level, unlock level) live in each scenario module.
// Sections are added as the build steps need them.

export const Config = {
  Saves: {
    // Save slots each player can keep.
    SlotCount: 3,
  },

  Shift: {
    LengthSeconds: 480,
    // Money a shift must earn to pass. The same every shift.
    Quota: 150,
    // In overtime, once the last call is over, seconds left to redeem any code still open
    // before the shift ends anyway.
    OvertimeRedeemSeconds: 30,
    // In overtime, how long the player can sit on their turn without saying anything before
    // the call is cut off. Paused while the victim thinks and talks.
    OvertimeIdleSeconds: 60,
  },

  XP: {
    // For each gift card cashed in, by the scenario's difficulty.
    PerSuccess: { Easy: 10, Medium: 20, Hard: 30 },
    ShiftPassBonus: 25,
  },

  Call: {
    // Seconds after clocking in before the first call rings.
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
    // Player turns before the victim can reveal the code at all, however convinced they
    // are. Stops a player from tricking the AI into an instant reveal.
    MinTurnsBeforeReveal: 3,
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
    // How long the client waits for the server to answer a request (e.g. redeeming a code)
    // before saying it couldn't get through.
    RequestTimeoutSeconds: 5,
  },

  Suspicion: {
    // Suspicion runs from Min (fully fooled) to Max. Scenarios set their own starting
    // value, hang-up threshold and trust level inside this range.
    Min: 0,
    Max: 100,
    // Largest change a reply may make in one turn. Rises are capped lower than drops, so
    // one awkward line can't end a call on its own.
    MaxDropPerTurn: 25,
    MaxRisePerTurn: 15,
  },

  // The Caller Trust bar. Trust runs from full (no suspicion) to empty (the victim hangs
  // up). The word over it depends on how close suspicion is to the hang-up threshold (0 to
  // 1); below the trust level it's always TRUSTING.
  Trust: {
    WaryAt: 0.5,
    AngryAt: 0.75,
  },

  Redeem: {
    // Wrong tries allowed per code before the card locks.
    TriesPerCode: 3,
    // Longest text the Redeem app sends, in characters. Anything longer is turned away
    // without costing a try.
    MaxCodeInputLength: 40,
  },

  Code: {
    // Fake codes look like PRE-XXX, e.g. GMA-7QZ: the scenario's prefix (exactly
    // PrefixLength capitals or digits), then GroupCount dash-separated groups of
    // GroupLength random characters. 6 characters in all.
    PrefixLength: 3,
    GroupCount: 1,
    GroupLength: 3,
    // No 0/O or 1/I, so codes are easy to read aloud and type. No vowels, Y, 3 (E) or 4
    // (A), so a random code can't spell a word, even in leetspeak.
    Characters: "BCDFGHJKLMNPQRSTVWXZ256789",
    // Picks to try for a code the player doesn't already have before giving up. A player
    // would need thousands of cards with one prefix to get anywhere near this.
    MaxGenerateAttempts: 1000,
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
