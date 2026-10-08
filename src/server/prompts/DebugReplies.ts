// Test words, so the reveal and hang-up paths can be tried without playing a whole call.
// !card makes the victim read their Wobblebucks Card, even on a call without a side
// problem.
// Typed as a message, one gets the matching reply instead of the scripted (or AI) one.
// Development only: CallService ignores them in production. The replies still go through
// the normal rules (suspicion is capped per turn, and the code is only revealed below the
// trust level), except Config.Call.MinTurnsBeforeReveal, which only exists to stop players
// tricking the AI.

import { Config } from "@shared/Config";
import type { AIReply } from "@server/scenarios/scenarioSchema";

const Replies: Readonly<Record<string, AIReply>> = {
  "!reveal": {
    reply: "(Test) Alright, dear, let me read it to you.",
    suspicionChange: -Config.Suspicion.MaxDropPerTurn,
    revealsCode: true,
  },
  "!sus": {
    reply: "(Test) Hmm, that sounds fishy to me...",
    suspicionChange: Config.Suspicion.MaxRisePerTurn,
    revealsCode: false,
  },
  "!card": {
    reply: "(Test) Fine, here's my Wobblebucks Card for the fix.",
    suspicionChange: -Config.Suspicion.MaxDropPerTurn,
    revealsCode: false,
    revealsCard: true,
  },
  "!calm": {
    reply: "(Test) Oh, you're such a dear.",
    suspicionChange: -Config.Suspicion.MaxDropPerTurn,
    revealsCode: false,
  },
};

/** The test reply for `message`, or null if it isn't a test word. */
export function matchTestWord(message: string): AIReply | null {
  return Replies[message.trim().toLowerCase()] ?? null;
}
