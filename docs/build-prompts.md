# ScamGPT (Browser) — Build Prompts

Paste these into Claude Code in order, one step at a time. They follow the Build Order in
CLAUDE.md. The Roblox version in `../ScammingGameRoblox` is finished, so most steps port its
rules and content; it's read-only reference.

## How to use

1. Start each step in a fresh session (`/clear`) after the previous step is committed.
2. Paste the step's prompt. Claude proposes a plan; read it, answer questions, say "OK".
3. Test in the browser using the steps Claude gives you (`npm run dev`, then open
   http://localhost:5173).
4. Paste the **Wrap-up** prompt, then the **Commit** prompt once your tests pass.
5. If something breaks, use the **Bug report** prompt instead of describing it loosely.

Text in `[brackets]` is for you to fill in.

---

## Reusable prompts

### Wrap-up (after every step)

```text
Wrap up this step:
1. Run npm run format, npm run lint, npm run typecheck and npm test. Fix every error.
2. Run the ts-reviewer subagent on everything changed in this step. Fix all Critical
   issues and list the rest for me.
3. Run the game-tester subagent and give me its browser test checklist.
4. Update "Status" in CLAUDE.md. If any design decision changed, update docs/design.md too.
Don't commit yet.
```

### Commit (after your tests pass)

```text
I tested it in the browser and it works. Commit this step with a clear message.
```

### Bug report

```text
Something's wrong in the browser.
What I did: [steps]
What happened: [what you saw]
What I expected: [what should happen]
Browser console: [paste errors/warnings]
Server terminal: [paste errors/warnings]
Find the cause before changing anything, explain it in plain words, then fix it.
```

---

## Step 0 — Tooling and scaffold

```text
This is a new browser version of my Roblox game. Read CLAUDE.md, then skim the Roblox
project at ../ScammingGameRoblox (read-only): its CLAUDE.md, docs/design.md,
src/shared/Config.luau and one scenario, so you understand what we're porting.

Step 0: set up the project. Propose a plan first, including every dependency you want
to add with one line on why, and wait for my OK. Then:
1. Scaffold one npm package in TypeScript strict mode, laid out as in CLAUDE.md: a Vite +
   React client, a Node server with Fastify + Socket.IO, and src/shared with path aliases.
   `npm run dev` starts both with hot reload; in production the server serves the built
   client.
2. Add ESLint (typescript-eslint, react-hooks), Prettier, Vitest and the npm scripts
   listed in CLAUDE.md, plus one small test so `npm test` runs.
3. Add .gitignore (node_modules, dist, .env, data/) and .env.example with
   GEMINI_API_KEY and ELEVENLABS_API_KEY. Load env on the server only.
4. Make a placeholder page that connects over Socket.IO and shows "connected", to prove the
   client-server link works.
5. Create two read-only subagents in .claude/agents/, adapted from the Roblox ones in
   ../ScammingGameRoblox/.claude/agents/:
   - ts-reviewer: TypeScript/React/Node review, Zod checks on every socket event, secrets
     and hidden data never reaching the client, quota guards.
   - game-tester: manual test checklists for the browser.
6. Copy ../ScammingGameRoblox/docs/design.md to docs/design.md and adapt it: drop the
   Roblox-only parts, keep the rules and numbers. Write docs/build-prompts.md with one
   prompt per Build Order step plus the Wrap-up, Commit and Bug report prompts, in the same
   style as the Roblox one.
Then run lint, typecheck and tests, and tell me how to open it in the browser. Don't
commit yet.
```

## Step 1 — Desktop shell with placeholder apps

```text
Build step 1: the desktop shell with placeholder apps. Read docs/design.md ("Desktop and
apps" and "Look and feel") first, and look at the Roblox desktop for reference
(../ScammingGameRoblox/src/client/UI: Desktop, Window, DesktopIcons, Draggable, Taskbar,
StartMenu, AppList, Theme). No game logic and no socket events yet.

Requirements:
- <Desktop /> renders inside whatever container it's given: a 16:9 box sized to its
  parent, not the browser window (no window sizes, 100vw/100vh or position: fixed inside
  it). Today the page just gives it a full-screen container.
- Everything inside scales with the box, so it looks the same at any size.
- The retro 90s/2000s look from the Roblox Theme: beveled windows with title bars, a teal
  desktop, a taskbar with a start button, and a tray with placeholders for the shift timer
  and earnings/quota.
- Theme colors, fonts and sizes are CSS variables in ui/themes, so the Shop's wallpapers
  and window themes (step 7) are just another set of variables.
- One component per app in ui/apps (Phone, Call, Redeem, Wobblebucks, Stats, Shop,
  Tutorial) with placeholder contents that match the design doc. The Call window has an
  empty chat log, a Talk button, a text box, a turn indicator, a trust bar, a face
  placeholder and a Hang Up button, none of them working yet.
- Windows open from desktop icons or the start menu, close, come to the front when
  clicked, and drag by their title bar without leaving the desktop. Icons drag and snap to
  an invisible grid. Use pointer events.
- Window and icon state (open, position, order) lives in a plain TypeScript module, not
  spread through components, with unit tests for grid snapping and keeping windows inside
  the desktop.
- Remove the step 0 placeholder page.

Done when: npm run dev shows the desktop, every app opens, closes, focuses and drags, icons
snap to the grid, and it still looks right when I resize the browser to any shape.

Propose a short plan first and wait for my OK. Then tell me exactly how to test it.
```

## Step 2 — Connection, player id, fake call flow

```text
Build step 2: player identity, the socket connection and the fake call flow with typed
input and scripted replies. No AI, no voice, no suspicion, no shifts yet. Read
docs/design.md ("Call flow" and "Scenarios") and port from ../ScammingGameRoblox:
src/shared/Scenarios/Grandma.luau, src/shared/Types.luau and the call rules in
src/server/Services/CallService.luau.

List any dependencies you want to add (e.g. zod, a cookie plugin) with one line each.

Requirements:
- PlayerService: a new visitor gets an anonymous random id in a signed, httpOnly,
  SameSite=Lax cookie (secret from .env; add it to .env.example). The Socket.IO handshake
  verifies the cookie and checks the Origin header; no valid cookie, no connection.
- One active connection per player: opening a second tab takes over, and the old tab is
  disconnected with a reason it shows ("Opened in another tab"). It doesn't reconnect by
  itself.
- src/shared/events.ts: every event's type and a Zod schema for every client event. The
  server parses every payload and ignores bad ones without crashing.
- src/server/scenarios/grandma.ts with Grandma's persona, situation and lines from the
  Roblox module. ScenarioRegistry validates scenarios with Zod at startup. Placeholder
  voice and face values marked TODO.
- CallService keeps per-player call state in memory, keyed by player id. A while after the
  player connects, a call rings (Config.Call). It rings for Config.Call.RingSeconds and is
  then missed. It handles answer, decline, hang up and send message; the next call rings
  Config.Call.SecondsBetweenCalls after one ends. Replies come from Grandma's fallback
  replies in order.
- Every client event is checked against the player's current call state before it does
  anything (e.g. answer only while ringing). Messages are capped at
  Config.Call.MaxTypedMessageLength.
- The server sends a call snapshot whenever the call changes. A client store in state/
  keeps the last snapshot and the apps render it.
- Phone app: ringing popup with Answer and Decline. Call app: chat log, text box, Send and
  Hang Up.
- Decide what a refresh or a dropped connection does to a live call (e.g. a short grace
  period to reconnect, then clean up) and tell me in the plan. Everything for that player
  is cleaned up in the end: timers, listeners and state.
- Unit tests for the call rules, using fake timers.

Done when: calls ring, answer/decline/miss work, my messages appear with a Grandma reply
after each, hanging up ends the call and the next one rings, a second tab takes over, and
refreshing mid-call does what you said it would.

Propose a short plan first and wait for my OK. Then tell me exactly how to test it.
```

## Step 3 — Turn state machine

```text
Build step 3: the turn state machine from CLAUDE.md ("Voice"), still with typed input and
scripted replies. Port the rules from the Roblox CallService and Config.Turn.

Requirements:
- The server tracks the turn per call: PlayerTurn -> (message received) Processing ->
  (reply ready) VictimTurn -> (victim finished speaking) PlayerTurn.
- Processing waits Config.Turn.ThinkingSeconds to fake the AI. VictimTurn ends when the
  client sends finished speaking for the current line (matched by a line id), or when the
  server's safety timer runs out (based on the line's length; numbers in Config). Until
  real voice arrives, the client fakes the speaking time from the line's length.
- Ending VictimTurn goes through one function, so step 9 can plug in real audio.
- The server ignores send message unless it's PlayerTurn, and ignores finished speaking
  for an earlier line or call.
- The call snapshot includes the turn. The Call app shows a turn indicator ("Your turn" /
  "Grandma is thinking..." / "Grandma is talking...") and disables the text box and Talk
  button outside PlayerTurn.
- No turn cap.
- Unit tests for the state machine, including late, duplicate and out-of-order events.

Done when: I can only send on my turn, the indicator always matches the server, spamming
Send does nothing extra, and a client that never reports back still gets its turn back.

Propose a short plan first and wait for my OK. Then tell me exactly how to test it.
```

## Step 4 — Suspicion, code reveal, Redeem app, payout

```text
Build step 4: suspicion, the code reveal, the Redeem app and payout. Still no AI. Read
docs/design.md ("Suspicion", "Code reveal", "Redeem app", "Economy") and port the rules
from the Roblox CallService, RedeemService and Prompts/DebugReplies.

Requirements:
- Scripted replies have the same shape as a future AI reply ({ reply, suspicionChange,
  revealsCode, revealsCard }), so this logic won't change when the AI arrives.
- Suspicion starts at the scenario's startingSuspicion, each change is clamped to
  Config.Suspicion, the total stays within Min/Max, and reaching the threshold ends the
  call with the hang-up line.
- The server generates a fake code per call from Config.Code (prefix plus 3 characters from
  the safe alphabet, using crypto randomness). It's revealed only when revealsCode is true,
  suspicion is below the trust level and Config.Call.MinTurnsBeforeReveal turns have
  passed; otherwise the victim says the not-ready line. The code only ever reaches the
  client inside the victim's line.
- Redeem app: sends a redeem event and shows the result. Ignore case, spaces and dashes.
  Config.Redeem.TriesPerCode wrong tries, then the card locks. Each code redeems once and
  stays redeemable after the call ends.
- Payout is the scenario's card value, added to in-memory earnings shown in the taskbar.
- Caller Trust bar in the Call app (trust = Max - suspicion) with the trust word from the
  Roblox version.
- The test words !reveal, !sus and !calm, from DebugReplies. They only work in
  development, never when NODE_ENV is production.
- Unit tests for suspicion clamping, the reveal rule, code generation and code checking.

Done when: suspicion moves, the victim hangs up at the threshold, the code shows up only
when the rules allow, and redeeming pays out with tries and locking working.

Propose a short plan first and wait for my OK. Then tell me exactly how to test it.
```

## Step 5 — Shifts, quota, results screen

```text
Build step 5: shifts. Read docs/design.md ("Session structure: shifts" and "Economy") and
port the rules from the Roblox ShiftService, UI/ClockIn and UI/ShiftResults.

Requirements:
- A Clock In screen on the desktop. Calls only ring during a shift. The Clock In click also
  unlocks browser audio, ready for step 9.
- Shift timer (Config.Shift.LengthSeconds) and earnings vs. quota in the taskbar tray. The
  server owns the clock; the client counts down to the end time the server sends.
- Overtime exactly as in the design doc: no new calls, the current call can finish, the
  idle cutoff, the redeem window, and a ringing call counts as missed.
- Shift end makes a shift result. Pass: shift earnings move to the bank. Fail: they're
  lost. XP is worked out with Config.XP and shown, but nothing is saved yet.
- A results screen with a PROMOTED or FIRED stamp, then back to Clock In.
- Stats app shows banked money, calls completed and success rate, from memory.
- ShiftService is plain TypeScript with unit tests (pass, fail, overtime, timers right at
  the boundary) using fake timers.

Done when: a full shift runs from Clock In to results, pass and fail bank correctly, and
overtime lets me finish and redeem my last call.

Propose a short plan first and wait for my OK. Then tell me exactly how to test it,
including how to shorten the shift for testing.
```

## Step 6 — Saving stats (SQLite)

```text
Build step 6: DataService saves player stats in SQLite with better-sqlite3. Ask before
adding it, and port the stats shape from the Roblox Types and DataService.

Requirements:
- The database file lives in data/ (gitignored), with its path in src/server/config.ts.
- A schema version and a simple migration step, so later fields (XP, owned upgrades,
  tutorialSeen) never wipe saves.
- Stats are keyed by the player id from the cookie. Load on connect with defaults for new
  players; validate saved stats with Zod on load.
- Save after anything that changes stats (banking, calls, shift results). Wrap database
  calls in try/catch with a busy timeout and retries, and never let a failed load lead to
  defaults overwriting real data. Tell me how you handle that.
- Close the database cleanly on shutdown.
- Tests use an in-memory database.

Done when: my bank and stats survive a server restart and a page refresh, and a private
window gets its own fresh stats.

Propose a short plan first and wait for my OK. Then tell me exactly how to test it,
including how to reset my stats.
```

## Step 7 — XP, levels, shop, tutorial

```text
Build step 7: XP, levels, scenario unlocks, the Shop and How to Play. Read docs/design.md
("Progression", "Upgrades") and port src/shared/Levels.luau, src/shared/Upgrades.luau,
ShopService, TutorialService and the Shop and Tutorial apps from the Roblox project.

Requirements:
- src/shared/Levels.ts: level from XP and XP to the next level, with unit tests against
  the table in the design doc.
- XP per successful call by difficulty, per Wobblebucks charge, and the shift pass bonus.
  XP is kept on a failed shift, and saved.
- ScenarioRegistry picks a random unlocked scenario, never the same one twice in a row.
- Level and XP bar in the Stats app, and a level up / new scenario popup.
- Shop app with the perks (3 tiers, bought in order) and cosmetics (wallpapers and window
  themes) from src/shared/Upgrades.ts. Purchases only between shifts; the server checks the
  price against banked money and saves what's owned and equipped. The server applies perks;
  the client applies cosmetics by switching CSS variable sets.
- How to Play opens by itself until it's first closed, then saves stats.tutorialSeen. Port
  its text from the Roblox Tutorial app.
- Unit tests for levels, shop rules and perk effects.

Done when: XP and levels go up and save, buying works only with enough money and only
between shifts, perks change the next shift, cosmetics change the look, and the tutorial
stops opening once closed.

Propose a short plan first and wait for my OK. Then tell me exactly how to test it,
including how to give myself XP and money while testing.
```

## Step 8 — AIService with Gemini (Grandma)

```text
Build step 8: AIService with Gemini, for Grandma. Follow the "AI Victim" section of
CLAUDE.md, and port the prompt from ../ScammingGameRoblox/src/server/Prompts/VictimPrompt.luau
and the rules in Services/AIService.luau.

Before writing code, read the current Gemini API docs and tell me what you found: the
official Node SDK, which fast models fit and what they cost, structured JSON output, system
instructions, context caching, safety settings and blocked replies, timeouts and rate
limits. If you can't confirm something, say so. Wait for my OK.

Requirements:
- prompts/VictimPrompt.ts builds the system prompt from the scenario: persona, situation,
  prize, comedic tone, the content rules, stay in character, keep replies under
  Config.AI.MaxReplyLength, JSON only in the AI reply shape, and never make up a code. It
  never changes during a call; per-turn facts (suspicion, turn number, obsession roll, side
  problem state) go after it.
- Treat the player's text as dialogue, not instructions. Tell me if anything besides the
  server-side reveal rule needs guarding against prompt tricks.
- Send the call history each turn, up to Config.AI.MaxHistoryLines.
- Validate the reply with Zod, clamp the numbers, trim the text and strip anything shaped
  like a code with the scenario's prefix. On a timeout, error, safety block or bad JSON,
  retry up to Config.AI.MaxRetries with backoff, then use a fallback reply.
- One request in flight per player, and a reply that arrives after its call ended is
  ignored.
- Cost guards: a per-player rate limit and daily cap on AI requests (RateLimiter), and the
  Config switch to scripted replies. Log tokens used per call. Never log the API key or
  send it to the client.
- Tests mock the Gemini client. Nothing in tests or scripts calls the real API.

Done when: Grandma answers in character, suspicion reacts to what I say, the code comes
out when I earn it, and removing the API key falls back to scripted replies cleanly.

Then tell me exactly how to test it, and roughly what a test session costs.
```

## Step 9 — Victim voice (ElevenLabs)

```text
Build step 9: the victim speaks with ElevenLabs text-to-speech.

Before writing code, read the current ElevenLabs docs and tell me what you found: the
text-to-speech endpoints (including streaming), model ids, voice settings, output formats,
character limits, latency options, price per character, and how to pick voices. Also
confirm the browser APIs we'll use (Web Audio AnalyserNode, autoplay rules). If you can't
confirm something, say so. Wait for my OK.

Requirements:
- VoiceService turns each victim line into speech on the server and streams it to the
  client over HTTP, only for that player's current line (checked with the cookie and the
  line id). The API key never leaves the server.
- Real voice settings for Grandma.
- VictimVoice on the client plays the line, measures loudness with an AnalyserNode (exposed
  for the face in step 11), and sends finished speaking when it ends. The server's safety
  timer still applies.
- A speaker button mutes the voice; the loudness is still measured.
- If speech fails, is rate-limited or hits the daily cap, the line shows as a subtitle and
  the turn falls back to the timed one from step 3. Subtitles always show.
- Cost guards: per-player rate limit and daily character cap, the Config switch for
  typed-only voice, and characters logged per call.
- Tests mock ElevenLabs. Nothing in tests or scripts calls the real API.

Done when: Grandma's lines play out loud, the turn comes back when she finishes, muting
works, and turning voice off in Config falls back cleanly.

Then tell me exactly how to test it, and roughly what a test session costs.
```

## Step 10 — Player voice (push-to-talk)

```text
Build step 10: the player talks with push-to-talk, transcribed by ElevenLabs
speech-to-text.

Before writing code, read the current ElevenLabs speech-to-text docs and the MDN docs for
getUserMedia and MediaRecorder (including which formats each browser records, Safari
especially). Tell me what you found and wait for my OK.

Requirements:
- Push-to-talk: hold V or the Talk button. Only during PlayerTurn; the mic is off during
  the victim's turn. Clips stop at Config.Voice.MaxClipSeconds.
- PlayerVoice records with MediaRecorder and uploads the clip over HTTP. The server checks
  it's that player's turn and the clip's size and length, then transcribes it. The text
  goes through exactly the same send message path and checks as typed text.
- Ask for the mic only the first time the player tries to talk, not on page load.
- Typed input always works. If the mic is denied, missing or fails, or transcription fails
  or hits a limit, switch to typing and show a short notice.
- Show "Listening..." while recording, and my words in the chat once they're back.
- Cost guards like step 9. Tests mock ElevenLabs.

Done when: holding V records, letting go sends, my words show up as my message and the
victim answers them, and denying the mic leaves typing working.

Then tell me exactly how to test it, and roughly what a test session costs.
```

## Step 11 — Faces, sounds and effects

```text
Build step 11: cartoon faces, sounds and the feedback moments. Read docs/design.md ("Look
and feel") and port the faces from ../ScammingGameRoblox/src/client/UI/Face.luau as SVG,
and the cues from UI/Effects, UI/Sounds and UI/SoundCues.

Requirements:
- ui/Face draws an SVG face from the scenario's face data (skin, hair style, glasses, hats,
  beard, eyepatch, antennae, ...). The resting expression follows the trust word, with
  quick reactions to big swings; it blinks and bobs, and the mouth opens with the voice's
  loudness from step 9 (even when muted).
- Effects: code redeemed (ka-ching, coin burst, money counter rolls up), victim hangs up
  (dial tone, screen shake, red CALL ENDED stamp), trust swings (the bar flashes), shift
  results (report card with a PROMOTED or FIRED stamp).
- Sounds for ringing, windows opening and closing, clicks and the moments above. List every
  sound you need; I'll add files I have the rights to in public/sounds and credit them in
  docs/credits.md. Until then, skip any sound that's missing.
- Effects stay inside the desktop box (no full-window overlays) and respect
  prefers-reduced-motion.

Done when: Grandma's face reacts and talks, and every moment above looks and sounds right.

Propose a short plan first and wait for my OK. Then tell me exactly how to test it.
```

## Step 12 — All 6 scenarios and side problems

```text
Build step 12: the other five scenarios and side problems. Port Zorp, Barnacle Bill, Chad,
Gary and Inspector Hawk from ../ScammingGameRoblox/src/shared/Scenarios/, and the side
problem and Wobblebucks rules from docs/design.md ("Side problems and the Wobblebucks
Machine") and the Roblox CallService and RedeemService.

Requirements:
- One module per scenario in src/server/scenarios/. Adding them should need no core
  changes; if it does, stop and tell me why first.
- Pick an ElevenLabs voice and settings for each (ask before generating any test audio),
  and port each face.
- Side problems: rolled per call (Config.Card.SideProblemChance) and told to the AI. The
  Wobblebucks Card (WBK-XXX) is revealed by the same rules as the gift card code. Spending
  limits stay on the server.
- Wobblebucks Machine app: card and amount, tries left, approved / declined / frozen. Each
  app turns away the other's cards without costing a try.
- The !card test word (development only).
- A unit test plays each scenario's 12 fallback replies through and checks they reveal
  around turn 9-10 without reaching the threshold.

Done when: each scenario unlocks at its level and sounds and looks different, and side
problems pay out through the Wobblebucks Machine.

Propose a short plan first and wait for my OK. Then tell me exactly how to test it,
including how to jump to level 11.
```

## Step 13 — Deploy with cost guards

```text
Plan only, no code until I OK it: get the game ready to put online.

Cover:
- Where to host a Node server with websockets and a persistent disk for SQLite. Compare 2-3
  options with prices, and how secrets are set on each.
- Production settings: the server serves the built client, HTTPS, secure cookies, trusted
  proxy settings, the Origin check and a health check route.
- Cost guards: confirm every Gemini and ElevenLabs call goes through RateLimiter, set
  per-player and global daily caps, a global switch that drops everyone to scripted replies
  and typed-only voice when a cap is hit, and a daily usage log.
- Abuse: connection limits per IP, request and upload size limits, and what happens when
  lots of players arrive at once.
- Database backups.
Write it to docs/deploy-plan.md and wait for my OK before building anything.
```

