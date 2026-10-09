// Bait callers: a normal caller who is secretly an undercover scam-buster. They look and sound
// like the usual victim (same name, face and voice), but drop tells, read out a trap code
// with ServerConfig.Bait.CodePrefix, and want the player to cash it in. Server only: the
// client is never told a call is bait.
//
// A bait call plays the base scenario with a few changes: the trap prefix, no side problem
// (their Wobblebucks Card would pay out for real), and their own scripted replies, which
// stall and ask oddly technical questions instead of the persona's usual lines. Suspicion
// starts where the real caller's does, so the trust bar never gives them away; they're keen,
// so it falls fast.

import { ServerConfig } from "@server/config";
import type { AIReply, Scenario } from "@server/scenarios/scenarioSchema";

// Used in order (then starting over) when the AI is off or fails. Written to fit any caller.
// From any caller's starting suspicion (65 at most), they drop below the trust level and read
// the code on turn 5, a bit sooner than a real victim would.
export const BaitFallbackReplies: readonly AIReply[] = [
  {
    reply:
      "Oh, wonderful, a real person. Hang on, my computer is doing an update. Okay, it's done. I'm all yours!",
    suspicionChange: -20,
    revealsCode: false,
  },
  {
    reply:
      "Quick question before we start. Which server are you calling from today? Just curious, for my notes.",
    suspicionChange: -15,
    revealsCode: false,
  },
  {
    reply:
      "Sorry, I dropped the phone. Then I had to find a pen. Then I had to find the other pen. Go on!",
    suspicionChange: -5,
    revealsCode: false,
  },
  {
    reply:
      "And what's your employee number? And is this call being recorded? Not that it matters. Ha!",
    suspicionChange: -10,
    revealsCode: false,
  },
  {
    reply:
      "You know what, you sound very professional. I'd love to read you the card. Let me grab it.",
    suspicionChange: -5,
    revealsCode: true,
  },
  {
    reply: "Did that go through? Take your time and type it in nice and slowly. Go on, try it now.",
    suspicionChange: 0,
    revealsCode: false,
  },
  {
    reply: "Hold on, my screen just went blue. No, wait, that's the wallpaper. Where were we?",
    suspicionChange: 0,
    revealsCode: false,
  },
  {
    reply:
      "Out of interest, what version of the help line software are you on? Mine says it's very old.",
    suspicionChange: 5,
    revealsCode: false,
  },
  {
    reply: "Shall I read the card again? Happy to. Anything for such a helpful help line.",
    suspicionChange: -5,
    revealsCode: true,
  },
  {
    reply:
      "Sorry, someone's at the door. It's nobody. Just a very large van parked outside. Carry on!",
    suspicionChange: 0,
    revealsCode: false,
  },
  {
    reply: "Have you cashed it in yet? No rush. Well, a little rush. I'm very excited for you.",
    suspicionChange: 0,
    revealsCode: false,
  },
  {
    reply:
      "My computer is asking for another update. Can you hold while it spins? It loves to spin.",
    suspicionChange: 0,
    revealsCode: false,
  },
];

/** `scenario` played as a bait caller: same caller and starting trust, the trap code prefix,
 * no side problem, and the bait's scripted replies. */
export function toBaitScenario(scenario: Scenario): Scenario {
  return {
    ...scenario,
    sideProblem: undefined,
    codePrefix: ServerConfig.Bait.CodePrefix,
    lines: { ...scenario.lines, fallbackReplies: [...BaitFallbackReplies] },
  };
}
