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

## Save slots

Each player has **3 save slots** (tied to their browser's player cookie until accounts exist).

- Every new visit opens the **Save Slots** screen: **Continue** a save, start a **New Game** in
  an empty slot, or **Delete** a slot (after "Are you sure?").
- **New Game** plays the intro video (`public/videos/intro.mp4`, about 20 s) over the screen,
  with a **Skip** button in the bottom right until it ends. It then fades into the desk, and
  only then do How to Play and the boss's welcome email open. Music waits for it. It doesn't
  replay on a refresh, on Continue or in Sandbox.
- Refreshing or dropping out and coming back within **30 s** skips the screen: same slot, same
  shift, same call.
- Away longer, an unfinished shift ends as a **failed shift** (earnings lost, XP kept) and is
  saved, so leaving can't dodge a FIRED. Next visit, continue the slot from the picker.
- **Switch save** in the Start menu goes back to the screen, only between shifts.
- A save that can't be read shows as damaged: it can be deleted but is never overwritten.

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
  of pop-ups, Grandpa Gus's hearing aid only plays polka, Boen's language app panda won't stop nagging him, Tonald Drump's big red desk phone only calls a pizza place, Hubble's smart lights are stuck in disco mode, Hudson's microwave popcorn button sets off the smoke alarm, Sarah's laptop
  autocorrects everything to "boba", Pete's smart scale says he weighs three pounds, Brody's smart
  fridge locks itself at night, Uncle Mike's smart TV only shows Georgia's worst losses, Evan's phone sends
  his half-written texts to CJ's sister, CJ's PC fans sound like a jet engine on stream, and
  Jordan's robot vacuum won't clean until someone calls heads or tails, and The Villain's
  laugh-activated gadget vault won't open now that he's laughed himself hoarse.
- **The pitch:** the player offers to fix it for a small fee. Asking for money makes the victim
  more careful, so the fix has to sound believable. Asking how much they can pay is suspicious.
- **Wobblebucks Card:** if they agree, they read out their Wobblebucks Card, a made-up card with
  a short code like the gift cards (`WBK-7QZ`, always the `WBK` prefix). It's never a
  real-looking card: no long numbers, dates or security codes. The server generates it and
  decides the reveal with the same rules as the gift card code (suspicion below the trust
  level, not too early).
- **Wobblebucks Machine app:** type the card and an amount to charge. Each victim's card has a
  hidden **spending limit** (Grandma $40, Grandpa Gus $45, Boen $45, Tonald Drump $50, Hubble $45, Hudson $50, Sarah $70, Pete $80, Brody $100,
  Uncle Mike $120, Evan $140, CJ $160, Jordan $180, The Villain $200), kept on the server. Charging within it pays that amount; charging over
  it is **declined** and uses a try. **2 tries per card**, then it's frozen. Each card can be
  charged once.
- A charge adds to shift earnings and gives **5 XP**, but doesn't count as a successful call (the
  gift card does), so it doesn't change the success rate.
- Each app turns away the other's cards without costing a try.
- Without the AI, scripted victims never bring up a side problem. The `!card` test word
  (development only) makes any victim read their card.

## Economy

- **Payout = the scenario's card value.** Each scenario sets its own value, from $50 (Grandma)
  to $250 (The Villain). Harder scenarios have bigger cards.
- **Quota:** fixed per shift. Starting value: **$150** (3 Grandma successes out of ~4–5 calls).
  A failed live audit raises it for the rest of that shift.
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
- **Scenario unlocks:** **two new scenarios every level**: Grandma, Grandpa Gus, Boen and Tonald
  Drump at level 1 (four, as an exception),
  then two more each level up to Jordan and The Villain at 6. Easy ones come first, Medium at
  level 3, Hard from level 4. Each
  scenario module sets its own `unlockLevel` to follow this. Scenarios are unlocked **only**
  through XP, never bought.

## Live audits (Skibidi, Quality Assurance)

Skibidi listens in on calls from a van in the parking lot. On a Campaign call, right after the
player's 2nd message, there's a 30% chance he emails a side objective (at most 2 per shift, and
only before the shift timer runs out). The email pops up as a notification at the bottom right;
the Call window shows the task and progress under the trust bar. Objectives (all checked on the
server):

- **Say it:** say "thank you for choosing us" twice (case and punctuation ignored).
- **Forbidden word:** get the code without saying "scam" (or any word starting with it).
- **Speed run:** get the code within the next 4 messages.
- **Upsell:** get the Wobblebucks Card read out too (only on calls with a side problem).
- **Smooth talker:** get the code without the trust bar ever hitting ANGRY.

Graded when the call ends; being hung up on always fails. **Pass:** +$25 to the shift's
earnings and +20 XP. **Fail:** the shift's quota goes up $25. Skibidi emails the result, and
the shift report counts audits passed and failed. A call cut off by the shift ending isn't
graded. Numbers live in ServerConfig.Audit. Dev test word: `!audit` or `!audit <objective>`.
In Sandbox, audits only start from the Control Panel's Trigger audit button (or the test word);
they're graded and emailed the same way, but nothing is paid out or raised.

## Bait callers

From level 2, 7% of Campaign calls are bait: an undercover scam-buster playing the usual
caller. The name, face, voice, greeting and starting trust are all the same, so nothing gives
them away at first. The tells:

- they stall ("my computer is updating", "I dropped the phone");
- they ask oddly technical questions (which server, your employee number, is this recorded);
- they're a little too keen, and trust falls fast;
- their code always starts with HNY (e.g. HNY-7QZ), not the caller's usual prefix.

They never have a side problem. **Hanging up** is always safe, even after they read the code.
**Redeeming** the trap code (or a typo with its prefix) pays nothing. Instead the screen is
hacked for 10 seconds: it glitches and freezes, with a fake console. The shift fails on the
spot, whatever it earned (XP is kept). A $300 fine comes out of the bank, never below $0. Then
the report shows HACKED, and Linda from HR emails about the fine. A trap code doesn't count as
"getting the code" for Skibidi's audits.

Bait cards don't keep overtime open. Numbers live in ServerConfig.Bait. In Sandbox, the
Control Panel's "Bait caller" box makes every call bait (never rolled). Redeeming there plays
the hacked screen and ends the bait call, with no fine. Dev test word: `!bait` turns the call
in progress into bait, if they haven't read their code yet.

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

- **Obsession:** a running gag (Grandma's cat, Sir Fluffington). Every greeting opens with it,
  so the player meets it straight away; after that it comes up only now and then. Most replies are normal. The server decides each turn whether this reply may
  mention it (a 20% chance, `Config.AI.ObsessionChance`) and tells the AI, because left to
  itself the AI overdoes running gags.
- **Catchphrases:** signature lines, used every few replies at most.
- **Likes and dislikes:** what calms or annoys this person in particular, so each victim needs a
  different approach. They win over the general suspicion rules when the two disagree (CJ
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
| 1 | Grandpa Gus | Easy | $55 | `GPZ` | 40 | 100 | 30 | 10 | 60 |
| 1 | Boen | Easy | $55 | `BNZ` | 40 | 100 | 30 | 10 | 60 |
| 1 | Tonald Drump | Easy | $60 | `TDZ` | 35 | 100 | 25 | 10 | 65 |
| 2 | Hubble | Easy | $55 | `HBL` | 40 | 100 | 30 | 10 | 60 |
| 2 | Hudson | Easy | $60 | `HDS` | 35 | 100 | 25 | 10 | 65 |
| 3 | Sarah | Medium | $80 | `SRH` | 45 | 90 | 25 | 20 | 45 |
| 3 | Pete | Medium | $100 | `PTF` | 35 | 80 | 15 | 20 | 45 |
| 4 | Brody | Hard | $125 | `BRZ` | 60 | 90 | 25 | 35 | 30 |
| 4 | Uncle Mike | Hard | $150 | `MKE` | 55 | 85 | 20 | 35 | 30 |
| 5 | Evan | Hard | $175 | `EVN` | 50 | 85 | 20 | 30 | 35 |
| 5 | CJ | Hard | $200 | `CJZ` | 65 | 85 | 20 | 45 | 20 |
| 6 | Jordan | Hard | $225 | `JRD` | 55 | 90 | 20 | 35 | 35 |
| 6 | The Villain | Hard | $250 | `VLN` | 60 | 90 | 20 | 40 | 30 |

Prefixes are never real words, since the AI's replies are cleaned of anything shaped like a code
with the scenario's prefix. Grandma is ported from the Roblox version; the other thirteen are new to
the browser version. Four callers are unlocked from the start (Grandma, Grandpa Gus, Boen and
Tonald Drump), so
early shifts aren't all one voice.

**Grandma Gertrude (Easy, level 1):** a sweet, confused grandma who can't figure out how to
redeem the Pudding Palace card her grandson Timmy sent. Obsession: Sir Fluffington, her fat,
judgmental cat. Likes patience, good manners and questions about the cat; hates being rushed,
computer words and bossy orders. The most forgiving scenario: she never hangs up unless you're
really rude.

**Grandpa Gus (Easy, level 1):** a gruff, hard-of-hearing old-timer whose Wormy Wally's Bait
Emporium card keeps getting spat out of the store's machine. Obsession: Old Whiskers, the catfish
that got away in 1974 (she's the size of a canoe now). Calls the internet "the world wide
wire". Likes respect ("sir"), patience and his fishing stories; hates being rushed, long
explanations, computer words, being called old and anyone doubting Old Whiskers. Bald under an olive cap,
glasses and a white mustache. As forgiving as Grandma.

**Boen (Easy, level 1):** a super friendly guy three weeks into learning Mandarin and counting
down to his dream trip, whose Jade Dragon Dumpling House card says "card not activated".
Obsession: China (the pandas in Chengdu, the Great Wall, dumplings, his Mandarin lessons); it's
all fandom, never accents or impressions. Rates things out of ten dumplings. Likes patience and
getting excited about his trip; hates being rushed or talked down to, the "visible from space"
myth and "dumplings are basically ravioli". Short black hair.

**Tonald Drump (Easy, level 1):** a boastful man who never lets you forget he's the President of
the United States of America, whose Golden Fairway Pro Shop card got declined ("a first for any
president"). Obsession: golf (eighteen holes-in-one in one round, he says). Everything is
"tremendous". Likes flattery and "Mr. President"; hates being corrected, doubted or put on hold,
and long explanations. Kept silly: no real politics, people or news. Golden hair and a deep tan.

**Hubble (Easy, level 2):** a gadget-obsessed tech geek whose Gadget Gulch card won't scan with
the card reader he built out of a webcam and a toaster. Obsession: technology (his seven-screen
battle station, and Gerald, his router, who he treats like a pet). The twist on Grandma: confident tech jargon impresses him.
Hates being told to turn it off and on again, being talked down to and being rushed. Short
dark hair and glasses.

**Hudson (Easy, level 2):** a super chill movie fan whose Kernel Kingdom Cinemas card says "card
not recognised". Obsession: popcorn (butter ratios, microwave timing, the kernels at the
bottom). Rates everything out of ten. Likes a relaxed, friendly tone and snack talk; hates being
rushed, stiff scripted talk and anyone dissing popcorn. Short brown hair. As forgiving as
Grandma, but needs a little more convincing (trust 25) and pays a bit more.

**Sarah (Medium, level 3):** a bubbly college student walking to class whose Bubble Bliss Tea
card says "invalid balance". Obsession: boba tea; she ranks every flavor in a spreadsheet. She's
sat through a phone-scam lecture, so she starts warier (45). Likes a genuine, casual tone and
being asked about her boba order; hates being talked down to, robotic help-line phrases and
"bubble juice". Long black hair, earrings, rosy cheeks.

**Pete (Medium, level 3):** a high-energy personal trainer doing push-ups all call, whose Iron
Temple Supplements card says "card not found". Obsession: working out (reps, macros, never
skipping leg day). Likes hype, confident coach-like instructions and being called strong; hates
slow explanations and junk-food talk. Blue headband. Starts friendly (35) but his trust level is
very low (15) and his fuse short (80), so you have to keep the energy up.

**Brody (Hard, level 4):** a big foodie who called right before dinner and is always mid-bite,
whose Mega Munch Burger Barn card says "card already used". Obsession: eating (his next meal,
his last meal, snack combos). He starts hangry and suspicious (60); talking food with him and
letting him finish his bite win him over, while rushing him through dinner or telling him to
skip a meal makes it worse. Calls people "chef". Blonde hair and glasses.

**Uncle Mike (Hard, level 4):** a loud, stubborn uncle watching the Georgia game only to
complain about it, whose End Zone Sports card says "card declined". Obsession: the University of Georgia football
team and how bad it is. He tests you with questions and pounces on answers that change. Likes
confidence, straight answers and agreeing that Georgia football stinks; saying "Go Dawgs" or
defending them sets him off. Bald with a big grey mustache. The lowest threshold (85) and trust
level 20 mean you need a story and you have to stick to it.

**Evan (Hard, level 5):** a sweet, nervous guy with a hopeless crush on his friend CJ's sister,
whose Rose & Ribbon Florist card (for flowers for her) says "card not activated". Obsession: the
crush; he rehearses asking her out mid-call and begs you not to tell CJ. Likes encouragement,
kindness and (bad) dating advice; hates being teased, pushy talk and anyone saying she's out of
his league. Short reddish hair, glasses, always blushing.

**CJ (Hard, level 5):** a chronically online gamer streaming the call to his chat, whose Galaxy
Gamer Gems card says "code already used". Obsession: brainrot (skibidi, sigma, rizz, aura,
"only in Ohio"), and he rates everything's aura. The twist: formal, official help-line talk makes
him *more* suspicious; slang and memes win him over. Hates being called "sir" and anything
urgent ("the scam playbook"). Dyed blue hair, a red headband. The final boss: he starts the most
suspicious (65) with the least room for mistakes.

**Jordan (Hard, level 6):** a fast-talking guy who bets on everything (snail races, coin flips
with his cat, which pigeon lands first) and can't stop until he's lost it all, whose Quackpot
Arcade card (won in the arcade's raffle) says "card on hold". Obsession: gambling, cartoon style: his
bets are always silly stuff (snacks, socks, his couch), never money. Likes the help line taking
his bets, odds talk and cheering for his snail; hates "guaranteed" or "risk-free" promises
(nothing's a sure thing), being called a sore loser and anyone jinxing his streak. Short black
hair and a thin mustache.

**The Villain (Hard, level 6):** a dramatic cartoon super-villain with a volcano lair and
henchmen all named Doug, whose Sinister Supplies Co. card (a Villain Appreciation Day gift) keeps
getting declined, so he can't finish his Mega Tickle Ray. Obsession: his evil schemes, cartoon
style (the Tickle Ray, stealing every left sock; nobody hurt). He's always watching for heroes in disguise. Likes being called "Your
Dreadfulness", questions about his schemes and praise for his evil laugh; hates heroic
speeches, being laughed at or called cute, and anyone saying his plan won't work. Still sore that a fat orange cat once out-schemed him. Green skin, an eyepatch, a
mustache and a purple captain's hat. The biggest card ($250).

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

**Sounds** are made in code from tones and noise (retro, cartoonish, nothing to license). A
recorded file can replace one, as long as we have the rights to it; it goes in
`public/sounds` and is credited in `docs/credits.md`. No real operating-system sounds.

**Settings app** (also on the title menu): a master volume over everything, the background
music (pick a looping song or none, and its volume; it gets quieter while the victim talks),
and sound effects (on or off, and their volume). They're per-browser preferences, not part
of the save. Sound effects are made in code, so they need no files.

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

## Game modes

Picked on the title menu (**Campaign** or **Sandbox**); quitting to the title switches. The
server owns the mode: the client only asks.

- **Campaign:** the game as described above: shifts, quota, XP, levels, unlocks and the shop,
  in 3 save slots.
- **Sandbox:** no shifts, quota, report or XP. Calls never ring by themselves: the player
  rings each one from the Control Panel.
  Money is unlimited ($∞): the Shop works as normal but everything is free. Cards can still be
  redeemed and charged (with all the effects), but nothing is banked. Sandbox has its own hidden
  save (slot 0) holding only its shop purchases and control panel settings, so it never touches
  a Campaign slot. Cost guards (per-player AI and voice limits) apply as in Campaign, and matter
  more here.
- **Control Panel** (a Sandbox-only app, opens by itself):
  - Callers: who calls next (any caller, whatever the level, or random), the side problem
    (random, always, never), and Ring now (the only way a Sandbox call starts).
  - Live call (on the player's turn): a trust slider, Read the code, Read the card, Make them
    hang up.
  - Replies: AI or scripted.
  - Look: any theme or wallpaper, and Reset Sandbox (clears its purchases and settings).

## Custom callers (planned, step 14)

Players make their own victims in a Caller Maker app (e.g. a character based on a friend or
family member): name, personality, quirks, obsession, catchphrases, likes, dislikes,
situation, a difficulty preset (so nobody can build a free-money caller), a face and a voice.
They're fictional cartoon characters: no real personal details (addresses, phone numbers,
workplaces, account or card details). Private to the player who made them; the server still
decides every reveal and makes every code.

## Streamer extras (facecam built; voice changer planned)

- **Facecam (built):** an optional webcam window (the Facecam app) that shows the player with
  a call-center headset and mic drawn on, so they look like they work the help line. Off
  until the player turns it on, the only time the game asks for the camera. MediaPipe's Face
  Landmarker tracks the face on the device (served from our own server, loaded only when
  turned on, its usage logging blocked), and each frame is drawn, tracked and given its
  headset before the browser paints it, so the headset follows the head (position, size and
  tilt). If no face is found, the picture just shows without a headset. A stinky aroma (green
  wisps off the head, two buzzing flies, a green haze) is on unless the player unticks
  Stinky. All video stays on the device: never recorded, uploaded or sent to an AI. The
  camera stops when the window closes, the tab is hidden or the title menu covers the desk
  (and starts again when the game is back in view). This replaced the first version, which
  covered the player's face with a cartoon one.
- **Player voice changer:** an optional setting that plays the player's lines back in a
  character voice (ElevenLabs), so both sides of the call sound like characters. Adds voice
  cost per message, so it has its own limits.

## Changes from the Roblox version

- **AI:** victims' replies come from Gemini, called by the server. The reply can be longer than
  Roblox allowed, but is still capped in Config because voice cost grows with characters.
- **Voice:** ElevenLabs speaks victim lines (streamed from the server). The player's
  push-to-talk is turned into text by the browser's own speech recognition (free; Chrome, Edge
  and Safari) and sent like a typed message. No 300-character speech limit and no age check for
  voice; typing always works and takes over if voice is unsupported, the mic is denied or
  missing, or recognition fails.
- **No platform text filter:** the AI is told the content rules, and player text is only shown
  back to that player.
- **Identity and saving:** an anonymous player id in a signed cookie (accounts later), one active
  tab per player, and three save slots per player in SQLite (see "Save slots").
- **Cost guards:** per-player rate limits and daily caps on AI and voice, plus a Config switch to
  scripted replies and typed-only voice.

## Open questions

- **Voice changer voices:** an Indian-accent voice was requested. It plays straight into the
  "Indian scam caller" stereotype, which clashes with the cartoonish tone and would likely
  read as mocking a real group. Decide before step 16; silly character voices (robot,
  chipmunk, posh butler, pirate) are the alternative.
- **Fixed quota vs. bigger cards:** later scenarios pay more, so the fixed quota gets easier.
  Is that okay (progression reward), or should the quota scale a little?
- **Name:** "GPT" is closely tied to another company's product. Check that the name doesn't
  conflict with the "no real brands" content rule before publishing.
