# Trust Me Bro Tech Support (ScamGPT, browser) — Scam Call Comedy Game

## Concept
Single-player browser game. The player sits at a fake retro desktop, takes calls from AI-driven victims (e.g. a grandma with gift card trouble), talks them (voice or typing) into revealing a fake card code, then redeems it in an app for money. Each scam type is a scenario. Full design: docs/design.md

This is a port of the Roblox version in ../ScammingGameRoblox (see Porting from Roblox). The browser drops Roblox's limits: Gemini writes the victims' replies and ElevenLabs speaks them.

Future: a shared office with other players. Build for that move: all game state keyed by player, and the desktop renders inside any container.

## Core Loop
1. Incoming call → player answers
2. Turn-based conversation: player speaks → transcribed → AI replies → reply spoken aloud → repeat
3. Suspicion rises or falls with what the player says
4. If convinced, the victim reveals a fake code → player redeems it → server verifies → payout
5. If suspicion maxes out, the victim hangs up with no payout. There's no turn cap.

## Apps
Control Panel (Sandbox only), Phone (incoming call), Call (subtitles, push-to-talk, typed box, turn indicator, trust meter, cartoon face, hang up), Redeem, Wobblebucks Machine (charge a Wobblebucks Card from a side problem), Stats, Shop (perks and cosmetics), Settings (master volume, music, sound effects; also on the title menu), How to Play (opens by itself until first closed, saved as stats.tutorialSeen). Windows drag by their title bar; desktop icons drag and snap to an invisible grid.

## Stack
- TypeScript (strict) everywhere, Node.js LTS, npm
- Client: React + Vite, CSS Modules with CSS variables for themes
- Server: Node + Fastify (HTTP) + Socket.IO (game events)
- Saves: SQLite (better-sqlite3)
- AI: Gemini through the Gemini API (Google's official Node SDK; confirm the package in step 8)
- Voice: ElevenLabs text-to-speech, called from the server only; player speech uses the browser's own speech recognition (Web Speech API), which is free
- Validation: Zod. Tests: Vitest. Lint and format: ESLint (typescript-eslint) + Prettier
- Claude Code in VS Code

## Structure
- src/server → Node server, all game logic
  - index.ts: Fastify + Socket.IO; serves the built client in production
  - services/: CallService, AIService, VoiceService, RedeemService, ShiftService, ShopService, SandboxService (Sandbox mode and its Control Panel), TutorialService, DataService, SaveService (3 save slots per player), PlayerService (identity, one connection per player), RateLimiter
  - prompts/: VictimPrompt, DebugReplies
  - scenarios/: one module per scam, plus ScenarioRegistry
- src/client → React app
  - net/: the socket connection and typed event helpers
  - state/: client stores holding what the server last said
  - voice/: VictimVoice (plays lines, measures loudness), PlayerVoice + pushToTalk (push-to-talk with the browser's speech recognition)
  - ui/: Desktop, Window, DesktopIcons, Taskbar, StartMenu, TitleMenu (home screen with Clock In, between shifts), ShiftResults, Face (+ faceParts), Effects (stamp, coins, rolling number, + desktopShake), sounds (+ soundList, synthSounds: effects made in code) + soundCues, music + songs, audioSettings + audioSettingsStore (per-browser sound settings), themes
  - ui/apps/: Phone, Call, Redeem, Wobblebucks, Stats, Shop, Tutorial, Settings
- src/shared → used by both: Config, events (Socket.IO event types + Zod schemas), types, Levels, Upgrades
- public/sounds (optional recorded replacements for the made-in-code effects, listed in SoundFiles in ui/sounds), public/sounds/music (looped songs), public/fonts → files we have the rights to (credited in docs/credits.md)
- docs/ → design notes. data/ → SQLite file (gitignored)

## Architecture Rules
- The server decides everything: turn state, suspicion, reveals, codes, money, XP, purchases. The client sends intent only (answer, decline, send message, finished speaking, hang up, redeem, charge, buy, clock in).
- Every client event is validated with a Zod schema and checked against the player's current state before it does anything.
- Call and shift state live in server memory, keyed by player id. Saved stats live in SQLite.
- Players get an anonymous id in a signed httpOnly cookie (accounts later). One active connection per player: a new tab takes over and the old one is told why.
- Secrets (GEMINI_API_KEY, ELEVENLABS_API_KEY) live in .env and are read only by the server. Client code never imports from src/server.
- Anything the player shouldn't see stays on the server: prompts, codes before they're read out, Wobblebucks spending limits, other scenario internals. The client only gets what the call snapshot sends (name, face, trust bar, turn).
- Cost guards: per-player rate limits and daily caps on AI and voice requests, plus a switch in Config that turns the game to scripted replies and typed-only voice. Log token and character usage per call.
- The desktop is a 16:9 box sized to its container, not the window, so it can later sit on a monitor in a 3D office.

## Scenarios
One module per scam type in src/server/scenarios/: id, displayName, difficulty, unlockLevel (new one every 2 levels), persona (personality, quirks, obsession, catchphrases, likes, dislikes), situation, prize, starting suspicion, threshold and trust level, voice (ElevenLabs voiceId and settings), face (drawing data for the SVG face), lines (several greetings, reveal/hang-up/not-ready lines, 12 fallback replies), optional side problem. ScenarioRegistry finds and validates them; calls pick a random unlocked one, never the same one twice in a row. Adding a scam = adding a module, no core changes.
- Most replies are normal. The obsession comes up only occasionally: the server rolls Config.AI.ObsessionChance each turn and tells the AI whether it may mention it. Likes and dislikes override the general suspicion rules.
- Tune fallback replies so suspicion drifts below trust and they reveal around turn 9-10 without hitting the threshold; only ~2 of 12 mention the obsession.

## AI Victim
- All AI calls go through AIService on the server, using Google's official Gemini SDK. Read the current Gemini API docs before writing or changing AIService; don't guess SDK usage, model ids or settings.
- Model and settings come from Config.AI. Pick a fast model from the current Gemini docs, since replies must be fast.
- Replies are structured JSON validated with a Zod schema: { reply, suspicionChange, revealsCode, revealsCard }. Reply length is capped in Config (voice cost grows with characters).
- The scenario's system prompt never changes during a call, so it can be cached. Things that change each turn (suspicion, turn number, obsession roll, side problem state) go after it.
- Send the whole call history each turn, up to Config.AI.MaxHistoryLines.
- The server clamps suspicionChange, decides every reveal, and generates the fake codes. The AI never invents a code and never sees one.
- Timeout plus canned fallback on every request, and the same fallback for safety blocks, errors and invalid JSON.

## Voice (turn-based)
- Turn states (server): PlayerTurn → Processing → VictimTurn → PlayerTurn
- Victim voice: the server turns each victim line into speech with ElevenLabs (eleven_flash_v2_5) and streams it over HTTP, only for that player's current line and only once per line (CallService.claimLineForVoice). The client (voice/VictimVoice.ts) downloads it, plays it on one page-wide audio element, measures loudness for the face (Web Audio AnalyserNode), and reports FinishedSpeaking only when the audio ends; the audio stops the moment the turn moves on. No audio (off, over a limit, failed, autoplay blocked) means subtitles timed like a line without a voice. The server has a safety timer.
- Player voice: push-to-talk (hold V outside a text box, or the Talk button). The browser's SpeechRecognition (webkitSpeechRecognition in Safari) turns it into text on the client, which is sent through call:send exactly like typed text, so the server's checks are the same and it costs nothing. Chrome, Edge and Safari have it; Firefox doesn't. Mic is off during the victim's turn; max talk length is Config.PlayerVoice.MaxTalkSeconds.
- Typed input always works and takes over automatically if voice is unsupported, the mic is denied or missing, or recognition fails.
- Browsers block sound until the player clicks something, so start audio on the first click (e.g. Clock In).
- Read the current ElevenLabs docs before writing voice code; don't guess endpoints, model ids, or settings. Same for any browser API you aren't sure of.

## Content Rules
- Comedic and cartoonish. Fake codes only: 6 characters, a 3-character non-word prefix plus 3 random (e.g. GMA-7QZ). Wobblebucks Cards are WBK-XXX, never a real-looking card.
- No real brands, gift card companies, payment methods, banks, real currencies or payment platforms, or off-site links.
- Player text is only ever shown to that player. If it's ever shown to anyone else, add moderation first.

## Code Rules
- TypeScript strict mode; no `any` without a comment saying why; exported functions have typed parameters and returns
- One job per module. Game rules live in plain TypeScript modules, not React components, so they can be unit tested
- No magic numbers: tunables go in src/shared/Config.ts (server-only values in src/server/config.ts)
- Clean up timers, listeners and per-player state when a player disconnects or a call ends
- async/await with try/catch; timeouts and retries with backoff around Gemini, ElevenLabs and database calls
- Unit tests (Vitest) for game rules: suspicion, reveals, code generation and checking, shifts, shop, rate limits. Mock Gemini and ElevenLabs in tests
- Run lint, typecheck and tests after edits and fix errors

## Commands
npm run dev | npm run build | npm start | npm run lint | npm run format | npm run typecheck | npm test

## How to Work With Me
- KEEP REPLIES SHORT: after finishing, 1-3 sentences. No recap of steps, no re-explaining code, no restating my request. Give only what changed and how to test it. At most one question.
- Give complete files, not snippets
- Propose a short plan before big features and wait for my OK
- One feature at a time
- If unsure whether an API exists (browser, Gemini, ElevenLabs), say so instead of guessing
- After code changes, use the ts-reviewer subagent and fix Critical issues; use game-tester for a checklist before commits
- Don't add dependencies or change build config without asking
- Don't spend API money without asking: no loops or scripts that call the real Gemini or ElevenLabs APIs

## Porting from Roblox
../ScammingGameRoblox is the finished Roblox version. Treat it as read-only reference; never edit it.
- Port: docs/design.md (rules and numbers), src/shared/Config.luau (tunables), src/shared/Scenarios/Grandma (the other five Roblox callers were replaced by new ones: Hudson, Sarah, Pete, Brody, Uncle Mike, Evan, CJ), src/server/Prompts/ (VictimPrompt, DebugReplies), Levels, Upgrades, Types, the rules in CallService, RedeemService and ShiftService, the desktop look (UI/Theme), and the cartoon faces (UI/Face, redrawn as SVG).
- Don't port Roblox-only workarounds: TextService filtering, SurfaceGui, AudioSpeechToText quirks, the 300-character TTS limit, 13+ voice rules, UIDragDetector quirks, Studio command-bar tricks.
- Keep the test words (!reveal, !sus, !calm, !card), in development only.

## Build Order
Prompts are in docs/build-prompts.md.
0 Tooling and scaffold · 1 Desktop shell · 2 Connection, player id, fake call flow · 3 Turn state machine · 4 Suspicion, redeem, payout · 5 Shifts · 6 Saving (SQLite) · 7 XP, levels, shop, tutorial · 8 AIService with Gemini (Grandma) · 9 Victim voice (ElevenLabs) · 10 Player voice · 11 Faces, sounds and effects · 12 All 6 scenarios and side problems · 13 Game modes (Career and Sandbox) · 14 Custom callers · 15 Facecam · 16 Player voice changer · 17 Deploy with cost guards

## Status
Done through Step 13: scaffold, desktop shell, player id and connection, fake call flow, turn state machine, suspicion, code reveal, Redeem app, payout, shifts (overtime, report), saving with 3 save slots in SQLite (picker on every new visit; refresh within 30 s resumes; leaving mid-shift for longer counts as a failed shift), XP, levels, caller unlocks, the Shop (perks and cosmetics) and How to Play, and Gemini victim replies (AIService, Interactions API, gemini-3.1-flash-lite; scripted fallback when there's no key, the switch is on, a limit is hit or the AI fails; side problems). Steps 9 and 10 are built: ElevenLabs victim voices (each line fetched once; her turn ends when the audio ends), and push-to-talk with the browser's speech recognition, sent like typed text. Step 11 is built: SVG faces (mood from the trust word, reactions to big swings, blink, bob, mouth follows the voice), effects (CALL ENDED stamp + shake, trust flash, coin burst, rolling earnings, report stamp), sound effects made in code (clicks, ringtone and the rest; no files), looped background music (two meme tracks, licenses unconfirmed), and a Settings app (master volume, music, sound effects on/off and volume). Step 12 is built: eight callers (Grandma, Hudson, Sarah, Pete, Brody, Uncle Mike, Evan, CJ; one unlocks every 2 levels, up to level 15), side problems (35% of calls) and the Wobblebucks Machine, plus the !card test word and the !level N dev command. Step 13 is built: Campaign and Sandbox from the title menu; Sandbox has no shifts or XP, unlimited money (free shop), its own hidden save (slot 0), and a Control Panel app (pick caller, side problem, ring now (calls never ring by themselves), trust slider, read code/card, hang up, AI or scripted, look, reset). Shifts are 60 s for testing (Config.Shift.LengthSeconds; the design is 480). Next: Step 14.
