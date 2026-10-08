# ScamGPT — Design

A comedic, single-player browser game. You sit at a retro computer desktop, take calls from
AI-driven characters, and talk them (by voice or typing) into reading out a fake gift card
code. Redeem the code for cash, hit your shift quota, and avoid getting hung up on.

CLAUDE.md covers the tech side (project structure, AI and voice APIs, code rules). This doc
covers how the game plays. All numbers here are starting values for `src/shared/Config.ts`
(or `src/server/config.ts` for server-only ones) and are expected to change during
playtesting.

This is a port of the finished Roblox version (`../ScammingGameRoblox`). The rules and numbers
are the same; see "Changes from the Roblox version" at the end for what's different.

## Pillars

- **Talking is the game.** Every mechanic exists to make the conversation matter.
- **Comedic, not real.** Silly personas, over-the-top situations, obviously fake codes. No real
  brands, card formats, payment methods, banks, currencies, payment platforms, or links.
- **Short, replayable sessions.** A shift is 8 minutes; failing one costs little time.
- **Server decides.** The client sends intent; the server owns suspicion, codes, money, and XP.

## Session structure: shifts

The game is played in **shifts**. The player starts one by clicking **Clock In** (that click
also unlocks the browser's audio).

- A shift lasts **8 minutes**, which fits about **4–5 calls**.
- Each shift has a **fixed money quota** (the same every shift).
- **Pass** (earnings ≥ quota): the shift's earnings are added to your bank, you get a shift
  XP bonus, and you see a "PROMOTED" results screen.
- **Fail** (earnings < quota): "FIRED". You **lose the money earned during that shift** but
  **keep all XP** earned. Then you start a new shift.
- Between shifts, you can spend banked money on upgrades (see Upgrades).

Because the quota is fixed, difficulty comes from the scenarios you unlock, not from a rising
target. Progress shows up as more variety and better upgrades.

### Shift timer running out

When the timer hits 0 during a call, the shift goes into **overtime**: no new calls ring, but
the current call can finish, and a revealed code can still be redeemed. A call that's still
ringing counts as missed.

- **During the call:** if the player stays quiet on their turn for **60 s**, the call is cut
  off. The countdown pauses while the victim thinks and talks, so only an idle player is cut
  off. A code already read out can still be redeemed afterwards.
- **After the call:** if the player still has a code to redeem, they get **30 s** to redeem it.
- The shift ends once the call is over and every revealed code is redeemed or locked, or when
  either countdown runs out.

## Call flow

1. **Idle:** the player is on the desktop.
2. **Incoming call:** the Phone app shows a ringing popup with the caller's name.
   - It rings for **15 s**. Answer, decline, or let it ring out.
   - Declining or missing a call has **no penalty** beyond the lost time.
3. **Conversation:** turn-based (PlayerTurn → Processing → VictimTurn → PlayerTurn), as
   described in CLAUDE.md, using voice or typing.
4. **Call ends** in one of these ways:
   - The victim reveals the code → the player can hang up and redeem it. The victim keeps
     chatting (and will repeat the code if asked) until the player hangs up.
   - Suspicion reaches the scenario's threshold → the victim hangs up. No payout.
   - The player hangs up.
   - There's no turn cap: a call lasts as long as the victim stays below the threshold.
5. **Next call:** rings **5 s** after the previous call ends (enough time to redeem). Only one
   call at a time. The first call of a shift rings **5 s** after clocking in.

Which scenario calls: picked at random from the player's unlocked scenarios, avoiding the same
scenario twice in a row.

## Suspicion

- Runs from **0** (totally fooled) to **100**.
- Each scenario sets a **starting suspicion** and a **hang-up threshold**.
- Every turn, the AI judges the player's line and returns `suspicionChange`. The server caps it
  at **-25 / +15 per turn** (rises are capped lower, so one awkward line can't end a call) and
  applies it. The AI is told to keep most changes small: about 5-10 either way for ordinary
  lines, bigger only for things the victim really likes, or something outrageous.
  - Lowers suspicion: staying in character, playing along with the persona's quirks, being
    patient, sounding helpful.
  - Raises suspicion: contradictions, pushiness, asking for the code too early, weird or
    off-topic requests.
- There's no automatic creep over time. The shift timer provides the pressure.
- The Call window shows this as **Caller Trust**, measured towards the scenario's hang-up
  threshold: full at 0 suspicion, empty exactly when the victim hangs up. A marker shows where
  trust has to climb past (the trust level) before they'll read out the code.

## Code reveal

The code is revealed only when **all** of these are true:

1. The AI's reply has `revealsCode: true`.
2. Suspicion is below the scenario's **trust level** (e.g. 30).
3. The player has taken at least **3 turns** this call, so a trick can't get an instant reveal.

Otherwise the victim says a "not ready yet" line instead.

The server generates a fake code for each call and inserts it into the victim's line. Codes are
**6 characters**: the scenario's 3-character prefix plus 3 random ones (e.g. `GMA-7QZ`), short
enough to catch by ear. The random characters skip look-alikes (0/O, 1/I) and vowels, so a code
is easy to read aloud and can't spell a word. The AI never sees or invents the code, so prompt
tricks can't leak it.

## Redeem app

- The player types the code into the Redeem app. The server checks it, ignoring case, spaces
  and dashes.
- **3 tries per code.** Codes are read aloud, so typos happen. After 3 wrong tries the card is
  "locked" and the payout is lost.
- A revealed code stays redeemable until the end of the shift (including overtime).
- Success: the scenario's card value is added to this shift's earnings.

## Side problems and the Wobblebucks Machine

A bonus way to earn on top of the gift card.

- **Side problem:** on about **35%** of calls (`Config.Card.SideProblemChance`), the victim also
  has a second problem at home, and mentions it early in passing. Grandma's computer box is full
  of pop-ups, Zorp's "car" navigator says "please return to orbit", Barnacle Bill's fish finder
  only finds boots, Chad's fitness watch counts reps as naps, Gary's fridge hums at night, and
  Inspector Hawk's printer prints upside down.
- **The pitch:** the player offers to fix it for a small fee. Asking for money makes the victim
  more careful, so the fix has to sound believable. Asking how much they can pay is suspicious.
- **Wobblebucks Card:** if they agree, they read out their Wobblebucks Card, a made-up card with
  a short code like the gift cards (`WBK-7QZ`, always the `WBK` prefix). It's never a
  real-looking card: no long numbers, dates or security codes. The server generates it and
  decides the reveal with the same rules as the gift card code (suspicion below the trust
  level, not too early).
- **Wobblebucks Machine app:** type the card and an amount to charge. Each victim's card has a
  hidden **spending limit** (Grandma $40, Zorp $50, Barnacle Bill $70, Chad $80, Gary $100,
  Inspector Hawk $120), kept on the server. Charging within it pays that amount; charging over
  it is **declined** and uses a try. **2 tries per card**, then it's frozen. Each card can be
  charged once.
- A charge adds to shift earnings and gives **5 XP**, but doesn't count as a successful call (the
  gift card does), so it doesn't change the success rate.
- Each app turns away the other's cards without costing a try.
- Without the AI, scripted victims never bring up a side problem. The `!card` test word
  (development only) makes any victim read their card.

## Economy

- **Payout = the scenario's card value.** Each scenario sets its own value, from $50 (Grandma)
  to $150 (Inspector Hawk). Harder scenarios have bigger cards.
- **Quota:** fixed per shift. Starting value: **$150** (3 Grandma successes out of ~4–5 calls).
- **Shift earnings vs. bank:** money earned during a shift is held as shift earnings. It moves to
  the bank only if the shift is passed. Upgrades are paid from the bank.

## Progression: XP and unlocks

- **XP per successful call**, scaled by difficulty: Easy 10, Medium 20, Hard 30.
- **XP bonus for passing a shift:** 25.
- XP is kept even when a shift is failed.
- XP raises the player's **level**. Everyone starts at level 1 with 0 XP.
- **Level curve:** going from level 1 to 2 costs **75 XP**, and each level after that costs
  **25 more** than the one before (75, 100, 125, 150, ...). There's no level cap.

  | Level | XP for that level | Total XP |
  | --- | --- | --- |
  | 2 | 75 | 75 |
  | 3 | 100 | 175 |
  | 4 | 125 | 300 |
  | 5 | 150 | 450 |
  | 6 | 175 | 625 |
  | 10 | 275 | 1,575 |

  A passed Grandma shift earns about 55 XP, so level 5 takes about 8 passed shifts (~1 hour)
  and level 10 about 29 (~4 hours). Harder scenarios pay more XP, which speeds later levels up.
- **Scenario unlocks:** a new scenario every **2 levels**: Grandma at level 1, then levels 3, 5,
  7, 9, 11, ... Easy ones come first, Medium around levels 5-7, Hard from level 9. Each
  scenario module sets its own `unlockLevel` to follow this. Scenarios are unlocked **only**
  through XP, never bought.

## Upgrades (bought with money)

Bought in the **Shop** app with banked money, **only between shifts**. Everything is kept
forever. Prices are in `Config.Shop`.

- **Shift perks:** permanent, each with **3 tiers** bought in order. Every perk's tiers cost
  **$200, $500 and $1,000** ($1,700 per perk, $5,100 for all three). Maxing every perk takes
  about 30 passed shifts (~4.5 hours), around when players reach level 10.

  | Perk | Per tier | At tier 3 |
  | --- | --- | --- |
  | Extra Coffee: longer shifts | +30 s | 9:30 shifts |
  | Smooth Talker: victims start less suspicious | -3 suspicion | -9 (Grandma starts at 31) |
  | Sticky Notes: more redeem tries per code | +1 try | 6 tries |

  Tiers are capped so the quota never becomes trivial. The server applies perks.
- **Cosmetics:** no gameplay effect; applied on the client by switching theme variables. The
  first set is built from colors and gradients in CSS (no image or sound assets). Buying one
  equips it; owned ones can be re-equipped for free.

  | Wallpapers | Price | Window themes | Price |
  | --- | --- | --- | --- |
  | Teal (default) | free | Classic Grey (default) | free |
  | Midnight Blue | $100 | Dark Mode | $200 |
  | Sunset Gradient | $200 | Bubblegum | $300 |
  | Hacker Grid | $300 | Terminal Green | $400 |
  | Pudding Pink | $400 | | |

  Later: ringtones (once the sounds from step 11 are in), cursor styles, and office cosmetics
  (chair, desk items).

## Scenarios

Each scam type is a module in `src/server/scenarios/`. They live on the server because
prompts, codes and spending limits must stay hidden; the client only gets what the call
snapshot sends (name, face, trust bar, turn). Adding a scenario means adding a module; core
code doesn't change.

Each scenario defines: persona, situation, prize, difficulty, card value, code prefix, starting
suspicion, hang-up threshold, trust level, voice (ElevenLabs voice id and settings), face,
scripted lines, an optional side problem, and the XP level that unlocks it.

Every persona also has:

- **Obsession:** a running gag that comes up only now and then (Grandma's cat, Sir
  Fluffington). Most replies are normal. The server decides each turn whether this reply may
  mention it (a 20% chance, `Config.AI.ObsessionChance`) and tells the AI, because left to
  itself the AI overdoes running gags.
- **Catchphrases:** signature lines, used every few replies at most.
- **Likes and dislikes:** what calms or annoys this person in particular, so each victim needs a
  different approach. They win over the general suspicion rules when the two disagree (Gary
  distrusts anyone who sounds like an official help line).
- **Several greetings**, one picked at random, so calls open differently.
- **A face** drawn as SVG from shapes, with optional extras: hats (tricorn, tinfoil,
  deerstalker, headband), a beard or mustache, an eyepatch, antennae.
- **12 fallback replies** for when the AI is off or fails, tuned so suspicion drifts below the
  trust level and they read the code around turn 9 or 10, without ever reaching the hang-up
  threshold. Only about 2 of the 12 mention the obsession.

**How difficulty works:** the gap between starting suspicion and the trust level is how much
convincing it takes (each turn lowers suspicion by at most 25). The gap between starting
suspicion and the threshold is how many mistakes you can make. Harder scenarios widen the first
gap and shrink the second, and pay more.

| Lvl | Scenario | Diff | Card | Prefix | Start | Threshold | Trust | To convince | Room for mistakes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Grandma Gertrude | Easy | $50 | `GMA` | 40 | 100 | 30 | 10 | 60 |
| 3 | Zorp the Alien | Easy | $60 | `ZRP` | 35 | 100 | 25 | 10 | 65 |
| 5 | Captain Barnacle Bill | Medium | $80 | `BRN` | 45 | 90 | 25 | 20 | 45 |
| 7 | Chad Thunderflex | Medium | $100 | `FLX` | 35 | 80 | 15 | 20 | 45 |
| 9 | Conspiracy Gary | Hard | $125 | `SQR` | 60 | 90 | 25 | 35 | 30 |
| 11 | Inspector Doris Hawk | Hard | $150 | `HWK` | 55 | 85 | 20 | 35 | 30 |

Prefixes are never real words, since the AI's replies are cleaned of anything shaped like a code
with the scenario's prefix.

**Grandma Gertrude (Easy, level 1):** a sweet, confused grandma who can't figure out how to
redeem the Pudding Palace card her grandson Timmy sent. Obsession: Sir Fluffington, her fat,
judgmental cat. Likes patience, good manners and questions about the cat; hates being rushed,
computer words and bossy orders. The most forgiving scenario: she never hangs up unless you're
really rude.

**Zorp the Alien (Easy, level 3):** a cheerful alien tourist whose Cosmic Snack Shack voucher
only makes the machine beep. Obsession: Earth cows, which he believes rule the planet. Likes
Earth things explained kindly and being told he's great at being human; hates shouting, any
mention of labs, and being called an alien ("Zorp is a normal Earth human"). Green, bald, with
glowing antennae. As forgiving as Grandma, but needs a little more convincing (trust 25) and
pays a bit more. A gentle step up.

**Captain Barnacle Bill (Medium, level 5):** a boastful retired pirate who thinks his Barnacle
Buffet voucher is cursed. Obsession: his rival Captain Saltbeard, who he blames for everything.
Likes being called Captain, pirate talk and hearing Saltbeard insulted; hates "Bill", the navy,
paperwork and being interrupted. Beard, eyepatch, gold earrings and a tricorn hat. The first
real test: twice Grandma's gap to convince, and a 90 threshold means bossing him around adds up.

**Chad Thunderflex (Medium, level 7):** a hyped-up gym bro whose Mega Muscle Smoothie card
says "not found". Obsession: leg day; he does squats and counts reps all call. Likes hype,
compliments on his biceps (Thunder and Lightning) and gym talk; hates slow explanations, being
called Chadwick and anyone doubting his strength. Red headband. He starts friendly (35) but his
trust level is very low (15) and his fuse is short (80), so you have to keep the energy up.

**Conspiracy Gary (Hard, level 9):** a paranoid conspiracy fan who's sure squirrels broke his
Nutty Nook Café card. Obsession: squirrels are spies. The twist: sounding like an official help
line makes him *more* suspicious; whispering, code words and agreeing about the squirrels win
him over. Tinfoil hat, mustache and glasses. Starts very suspicious (60), so it takes at least
two great turns to get him to 25, with little room for mistakes.

**Inspector Doris Hawk (Hard, level 11):** a sharp retired detective investigating why her
Muffin Emporium card says "invalid". Obsession: the unsolved Great Muffin Heist of '82. She
asks verification questions, writes everything down and pounces on contradictions. Likes
consistent, confident answers and being called Inspector; hates vague answers, asking for the
code too soon and muffin jokes. Glasses and a deerstalker cap. The final boss: the lowest
threshold (85) and trust level 20 mean you need a story and you have to stick to it.

**Economy check:** with the fixed $150 quota, two Hard cards nearly pass a shift, but Hard
victims hang up far more often, so later shifts pay better without being free. Calls still pick
randomly from every unlocked scenario, so Easy ones keep turning up too.

## Desktop and apps

A retro desktop that renders inside whatever container it's given: a **16:9 box sized to its
container**, not the browser window, so it can later sit on a monitor in a shared office.
Everything inside scales with the box.

- **Phone:** incoming-call popup with Answer / Decline.
- **Call:** chat bubbles (subtitles), push-to-talk button, typed input box, turn indicator,
  Caller Trust bar, the victim's cartoon face, hang-up button.
- **Redeem:** code entry, tries remaining, success or failure.
- **Wobblebucks Machine:** Wobblebucks Card and amount entry, tries remaining, approved or
  declined.
- **Stats:** money, calls completed, success rate, level and XP.
- **Shop:** shift perks and cosmetics (see Upgrades).
- **How to Play:** opens by itself until the player first closes it (saved as
  `stats.tutorialSeen`), then stays in the start menu.
- **Taskbar:** shift timer, shift earnings vs. quota, start-menu launcher.

Windows open from desktop icons or the start menu, come to the front when clicked, and drag by
their title bar. Desktop icons drag and snap to an invisible grid.

## Look and feel

**Retro 90s/2000s PC:** chunky beveled windows, a taskbar and start button, pixel-style icons,
dial-up and old-OS-style sounds. Cartoonish and silly to match the tone.

Moments that should feel especially satisfying:

- **Code redeemed:** cash register "ka-ching", coins burst, money counter rolls up.
- **Victim hangs up:** dial tone, screen shake, red "CALL ENDED" stamp.
- **Suspicion swings:** the trust bar flashes and the victim's face reacts (smiles when
  suspicion drops, frowns when it rises) on big changes.
- **Shift results:** a report card with calls taken, earnings vs. quota, and a "PROMOTED" or
  "FIRED" stamp.

**Sounds** are files we have the rights to, kept in `public/sounds` and credited in
`docs/credits.md`. No real operating-system sounds.

**Call window:** a dark phone-app look (the same in every desktop theme) with a Caller Trust
bar, the victim's name, their cartoon face, a status line, chat bubbles, and Hang Up / speaker
(mute the voice) / hold-to-talk mic buttons. Faces are drawn as SVG from shapes, so every
scenario gets one without image assets; each scenario describes its look. The face's resting
expression follows the trust word (neutral when unsure, wary, angry, happy when trusting), with
quick reactions to big swings. While the victim talks, the mouth moves with the loudness of
their voice (measured with a Web Audio analyser, even when muted); the face also blinks and
bobs.

## Content rules

See CLAUDE.md. In short: comedic and cartoonish; codes are obviously fake; no real brands, gift
card companies, payment methods, banks, real currencies, payment platforms, or off-site links.
Player text is only ever shown to that player; if it's ever shown to anyone else, add
moderation first.

## Starting numbers (for Config)

| Setting | Value |
| --- | --- |
| Shift length | 480 s (8 min) |
| First call after clocking in | 5 s |
| Ring time before missed | 15 s |
| Gap between calls | 5 s |
| Overtime: idle cutoff / redeem window | 60 s / 30 s |
| Suspicion range | 0–100 |
| Max suspicion change per turn | -25 / +15 |
| Player turns before a reveal is allowed | 3 |
| Obsession chance per reply | 20% |
| Shift quota | $150 |
| Redeem tries per code | 3 |
| XP per success (Easy / Medium / Hard) | 10 / 20 / 30 |
| XP for passing a shift | 25 |
| Card code length | 6 (3-character prefix + 3 random) |
| Side problem chance per call | 35% |
| Wobblebucks Card tries / XP per charge | 2 / 5 |
| Grandma: card / start / threshold / trust | $50 / 40 / 100 / 30 |

## Game modes (planned, step 13)

Picked the first time the game opens, and switchable later between shifts.

- **Career:** the game as described above: shifts, quota, XP, levels, unlocks and the shop.
- **Sandbox:** pick which scenario calls you, with unlimited money and the whole shop
  available. Kept separate from Career saves. Cost guards still apply.

## Custom callers (planned, step 14)

Players make their own victims in a Caller Maker app (e.g. a character based on a friend or
family member): name, personality, quirks, obsession, catchphrases, likes, dislikes,
situation, a difficulty preset (so nobody can build a free-money caller), a face and a voice.
They're fictional cartoon characters: no real personal details (addresses, phone numbers,
workplaces, account or card details). Private to the player who made them; the server still
decides every reveal and makes every code.

## Streamer extras (planned, steps 15-16)

- **Facecam:** an optional webcam window with a cartoon or AI-made face covering the
  player's face. Off by default; all video stays on the device; if tracking loses the face,
  the whole frame is covered rather than showing it.
- **Player voice changer:** an optional setting that plays the player's lines back in a
  character voice (ElevenLabs), so both sides of the call sound like characters. Adds voice
  cost per message, so it has its own limits.

## Changes from the Roblox version

- **AI:** victims' replies come from Gemini, called by the server. The reply can be longer than
  Roblox allowed, but is still capped in Config because voice cost grows with characters.
- **Voice:** ElevenLabs speaks victim lines (streamed from the server) and transcribes the
  player's push-to-talk clips. No 300-character speech limit and no age check for voice; typing
  always works and takes over if the mic is denied, missing, or fails.
- **No platform text filter:** the AI is told the content rules, and player text is only shown
  back to that player.
- **Identity and saving:** an anonymous player id in a signed cookie (accounts later), one active
  tab per player, and stats saved in SQLite.
- **Cost guards:** per-player rate limits and daily caps on AI and voice, plus a Config switch to
  scripted replies and typed-only voice.

## Open questions

- **Voice changer voices:** an Indian-accent voice was requested. It plays straight into the
  "Indian scam caller" stereotype, which clashes with the cartoonish tone and would likely
  read as mocking a real group. Decide before step 16; silly character voices (robot,
  chipmunk, posh butler, pirate) are the alternative.
- **Sandbox details:** does Sandbox have shifts and a quota, and does it earn XP? (Asked at
  the start of step 13.)

- **Fixed quota vs. bigger cards:** later scenarios pay more, so the fixed quota gets easier.
  Is that okay (progression reward), or should the quota scale a little?
- **Name:** "GPT" is closely tied to another company's product. Check that the name doesn't
  conflict with the "no real brands" content rule before publishing.
