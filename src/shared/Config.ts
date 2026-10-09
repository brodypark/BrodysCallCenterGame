// Tunable values shared by the server and the client: timers, limits and rules. No magic
// numbers elsewhere. Starting values come from docs/design.md and are meant to be tuned in
// playtesting. Server-only values live in src/server/config.ts; per-scenario values (card
// value, suspicion start/threshold/trust level, unlock level) live in each scenario module.
// Sections are added as the build steps need them.

import type { BuyableCosmeticId } from "@shared/cosmetics";

export const Config = {
  Saves: {
    // Save slots each player can keep.
    SlotCount: 3,
    // The slot that holds a player's Sandbox save (shop purchases and control panel
    // settings). Campaign slots are 1 to SlotCount, so the two never mix.
    SandboxSlot: 0,
  },

  // Sandbox mode (docs/design.md "Game modes"): no shifts, quota or XP, unlimited money,
  // and a control panel.
  Sandbox: {
    // The control panel's "anyone" choice for who calls next.
    RandomCaller: "random",
    // Longest caller choice the client may send (scenario ids are short).
    MaxCallerIdLength: 40,
    // The trust slider runs from 0 (about to hang up) to this (fully trusting).
    TrustSliderMax: 100,
  },

  Shift: {
    // The design is 360 (6 minutes).
    LengthSeconds: 360,
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
    // For each Wobblebucks Card charged (a side problem fixed for a fee).
    PerCharge: 5,
    ShiftPassBonus: 25,
    // Level curve: going from level 1 to 2 costs FirstLevelCost XP, and each level after
    // that costs CostIncreasePerLevel more than the one before (75, 100, 125, ...).
    FirstLevelCost: 75,
    CostIncreasePerLevel: 25,
  },

  // The upgrades shop. Only open between shifts; everything is paid from banked money and
  // kept forever.
  Shop: {
    // Each shift perk is bought in tiers, which cost these amounts in order. The number of
    // prices is the highest tier.
    PerkTierPrices: [200, 500, 1000],
    // Longest upgrade id the client may send.
    MaxUpgradeIdLength: 40,
    // What each tier of each perk adds.
    ExtraShiftSecondsPerTier: 30,
    LowerStartingSuspicionPerTier: 3,
    ExtraRedeemTriesPerTier: 1,
    // Cosmetics, by id. The default wallpaper (teal) and theme (classic) are free.
    CosmeticPrices: {
      midnightBlue: 100,
      sunsetGradient: 200,
      hackerGrid: 300,
      puddingPink: 400,
      darkMode: 200,
      bubblegum: 300,
      terminalGreen: 400,
    } satisfies Record<BuyableCosmeticId, number>,
  },

  // The Characters app: a page per caller. Hints on a caller's page unlock as the player
  // cashes in that caller's gift cards; their spending limit once their Wobblebucks Card has
  // been charged.
  Characters: {
    ScamsForHint: { likes: 1, dislikes: 2, obsession: 3 },
    ChargesForLimit: 1,
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
    // Fake "thinking" time before a scripted reply (or a test word's). AI replies take as
    // long as the AI does instead.
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
    // Room for a voice line's audio to load (Config.Voice.LoadTimeoutSeconds) first.
    SafetyExtraSeconds: 10,
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
    // The share of calls where the victim also has a side problem they can pay to have fixed.
    SideProblemChance: 0.35,
    // Charges over a card's spending limit are declined; this many and the card freezes.
    TriesPerCard: 2,
    // The smallest and biggest amounts the Wobblebucks Machine will charge, in dollars.
    MinChargeAmount: 1,
    MaxChargeAmount: 999,
  },

  AI: {
    // The cost switch: true makes every victim use their scenario's scripted replies and
    // never calls Gemini. Victims are scripted anyway when GEMINI_API_KEY isn't set.
    UseScriptedReplies: false,
    // A fast, cheap Gemini model (ai.google.dev/gemini-api/docs/models), and how much it
    // thinks before replying. Less thinking means faster replies.
    Model: "gemini-3.1-flash-lite",
    ThinkingLevel: "minimal",
    // Longest reply the model may write, in tokens. A MaxReplyLength reply plus the JSON
    // around it is well under this; the rest is room for any thinking.
    MaxOutputTokens: 400,
    // Longest victim line, in characters (voice cost grows with characters). Scripted lines
    // are checked against it too.
    MaxReplyLength: 200,
    // Most recent conversation lines sent with each request. Calls have no turn cap, so
    // without this a long call would keep growing the request.
    MaxHistoryLines: 30,
    // Chance (0 to 1) that a reply brings up the victim's obsession. The server rolls it each
    // turn and tells the AI, since left to itself it overdoes running gags.
    ObsessionChance: 0.2,
    // Backups for Model, tried in this order when it fails or is slow. Gemini's rate limits
    // and overloads are per model, so another model usually still answers. All of them must
    // accept ThinkingLevel (checked in ai.google.dev/gemini-api/docs/thinking, 2026-10-08).
    FallbackModels: ["gemini-3.5-flash-lite", "gemini-3.5-flash"],
    // One request gives up after RequestTimeoutSeconds. A failed one (timeout, error, safety
    // block, bad JSON) moves on to the next model (and then the backup key), up to
    // MaxAttempts requests in all. Going back to one already tried waits RetryBaseSeconds,
    // then twice that. If a request hasn't answered after HedgeAfterSeconds, the next one
    // starts alongside it and the first good reply wins. No new try starts once
    // ReplyDeadlineSeconds have passed since the player spoke; the victim says a scripted
    // line instead.
    RequestTimeoutSeconds: 6,
    MaxAttempts: 6,
    RetryBaseSeconds: 0.5,
    HedgeAfterSeconds: 3,
    // Most requests running at once for one reply (the slow one plus its hedge).
    MaxParallelRequests: 2,
    ReplyDeadlineSeconds: 12,
    // No new try starts with less than this left before ReplyDeadlineSeconds: it couldn't
    // answer in time, but would still count against the limits.
    MinRequestSeconds: 2,
    // If no reply (not even a fallback) has come this long after the player spoke, the
    // victim says a scripted line anyway. Only a bug would ever need it.
    ReplyGuardSeconds: 15,
  },
  Voice: {
    // The switch: true gives every victim subtitle-only timed lines and no voice requests.
    // The server also does that when ELEVENLABS_API_KEY isn't set. Doesn't touch
    // push-to-talk (PlayerVoice), which costs nothing. The limits on voice requests are
    // server-only (ServerConfig.VoiceLimits).
    TypedOnly: false,
    // How long the client waits for a victim line's audio to arrive before showing it as
    // subtitles only (timed like a line without a voice).
    LoadTimeoutSeconds: 8,
    // Once a line's audio is playing, how long past its length to wait for the browser to
    // say it ended before moving on anyway.
    EndGraceSeconds: 2,
  },

  // Push-to-talk. The browser's own speech recognition turns the player's words into text,
  // which is sent exactly like a typed message, so it costs nothing and needs no server
  // checks of its own.
  PlayerVoice: {
    // The key held to talk (a KeyboardEvent.code, so it's the same key on any layout).
    TalkKey: "KeyV",
    // Longest the player can hold the talk key in one go; it lets go by itself after this.
    MaxTalkSeconds: 15,
    // After letting go, how long to wait for the browser's final words before sending
    // whatever it heard so far.
    ResultWaitSeconds: 3,
    // The language the browser listens for.
    Language: "en-US",
    // How long a notice (e.g. "Mic blocked") stays up.
    NoticeSeconds: 5,
  },

  // The victim's cartoon face (ui/Face). Sizes are fractions of the face's square.
  Face: {
    // Eyebrows ease to a new mood's pose over this long.
    BrowSeconds: 0.2,
    // The talking mouth: width, and height when shut and wide open.
    TalkWidth: 0.15,
    TalkMinHeight: 0.03,
    TalkMaxHeight: 0.13,
    // Below this openness (0 to 1) the face shows its mood's resting mouth instead.
    MouthShowThreshold: 0.08,
    // How fast the mouth opens and closes, in openness per second.
    MouthOpenSpeed: 14,
    MouthCloseSpeed: 8,
    // How the mouth follows the voice: each line's loudness is measured this many times a
    // second from its audio. A moment at LoudnessPeakShare of the line's loudest opens the
    // mouth fully (lower it for a wider-open mouth), and anything under LoudnessGate of that
    // shuts it, so it closes between words.
    LoudnessFramesPerSecond: 60,
    LoudnessPeakShare: 0.6,
    LoudnessGate: 0.15,
    // With no voice to follow (subtitles only), the mouth flaps at this speed (radians per
    // second) during the victim's turn.
    FlapSpeed: 10,
    // Blinks: random gaps between them, how long each lasts, and how far the eyes close.
    BlinkMinSeconds: 2.5,
    BlinkMaxSeconds: 5.5,
    BlinkSeconds: 0.12,
    BlinkEyeHeight: 0.15,
    // The head bobs up and down by this fraction, once per BobPeriodSeconds.
    BobPeriodSeconds: 3.5,
    BobAmount: 0.015,
  },

  // The feedback moments (ui/effects): stamps, shakes, flashes, coins, rolling numbers.
  Effects: {
    // Stamps (CALL ENDED, PROMOTED, FIRED) start this many times bigger and slam down.
    StampStartScale: 3,
    SlamSeconds: 0.25,
    StampRotationDegrees: -12,
    // The CALL ENDED stamp stays this long, then fades.
    StampHoldSeconds: 1.8,
    StampFadeSeconds: 0.5,
    // The desktop shakes when a victim hangs up, by this fraction of its size.
    ShakeSeconds: 0.4,
    ShakeAmount: 0.006,
    // The trust bar blinks on big changes.
    FlashSeconds: 0.12,
    FlashCount: 3,
    // Coins thrown out of the Redeem button, flying up to CoinTravel (a fraction of the
    // desktop's height).
    CoinCount: 12,
    CoinSeconds: 0.9,
    CoinTravel: 0.18,
    // Numbers (the taskbar earnings) roll up to a new value over this long.
    RollSeconds: 0.8,
    // A trust change at least this big (in percent of the bar) in one turn flashes the bar,
    // beeps, and makes the face react.
    BigTrustChangePercent: 10,
    // How long the face shows a reaction before going back to its resting mood.
    ReactionSeconds: 3,
    // Shift report: when the stamp lands, and how long after it the level up jingle plays.
    ReportStampDelaySeconds: 0.9,
    LevelUpJingleDelaySeconds: 2.5,
    // The hacked screen (a bait caller's trap; it lasts as long as the server says): its fake
    // console types its lines out over this long, and the countdown updates this often.
    HackConsoleSeconds: 6,
    HackTickSeconds: 0.25,
  },

  // New-mail notifications (ui/Toasts): a card slides in at the bottom right of the desk with
  // the sender and the start of the email. Clicking it opens the email.
  Toasts: {
    // How long each one stays up once it's on screen (the timer waits while the desk is
    // covered, e.g. by the shift report).
    ShowSeconds: 6,
    // Most shown at once; the rest wait their turn.
    MaxShown: 3,
    // Most waiting; the oldest are dropped (they're still in the inbox).
    MaxQueued: 10,
    // How much of the email's text it shows, in characters.
    SnippetLength: 90,
    // How long it takes to slide in.
    SlideSeconds: 0.3,
  },

  // The intro video that plays when a new Campaign save starts (ui/introPlayer).
  Intro: {
    // When it ends (or is skipped), it fades into the desk over this long.
    FadeSeconds: 1.5,
  },

  // Sound effects (ui/sounds), made in code (ui/synthSounds) unless a file replaces one.
  Sounds: {
    // Where a new player's master volume (over everything) and sound effects volume start,
    // from 0 to 1. Players change them in Settings.
    DefaultMasterVolume: 0.8,
    DefaultEffectsVolume: 0.7,
    // The dial tone and the overtime alarm are cut off after this long (the ones made in code
    // are shorter anyway; this is for recorded replacements).
    DialToneSeconds: 2.5,
    OvertimeSeconds: 2,
  },

  // Background music (ui/music). The songs are listed in ui/songs.ts.
  Music: {
    // The music volume a new player starts at, from 0 to 1 (under the master volume).
    DefaultVolume: 0.35,
    // While the victim talks, the music drops to this fraction of its volume.
    DuckLevel: 0.25,
    // Volume changes (ducking) fade over this long.
    FadeSeconds: 0.4,
  },

  // The facecam (client/facecam): the player's webcam with a call-center headset drawn on,
  // for streaming. Off until the player turns it on; the video never leaves their device.
  Facecam: {
    // The camera picture asked for, in pixels (4:3).
    VideoWidth: 640,
    VideoHeight: 480,
    // Shown like a mirror, the way webcam previews usually look.
    Mirror: true,
    // Most faces given a headset at once, e.g. a friend leaning in.
    MaxFaces: 3,
    // How sure the tracker must be that a face is there, 0 to 1.
    MinConfidence: 0.5,
    // The stinky aroma's box round each head, as a multiple of the face's width at the ears.
    StinkSize: 1.5,
    // Turning on gives up after this long (loading the tracker, or the camera's video).
    StartTimeoutSeconds: 30,
  },
} as const;
