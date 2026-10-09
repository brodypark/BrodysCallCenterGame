import { describe, expect, it } from "vitest";
import { AllScenarios } from "@server/scenarios/all";

// What each caller's obsession sounds like. Every greeting opens with it, so the player
// meets the running gag straight away; after that it only comes up now and then.
const ObsessionWords: Readonly<Record<string, RegExp>> = {
  grandma: /Sir Fluffington/,
  grandpa: /Old Whiskers|catfish/i,
  hubble: /Gerald|router|screen|firmware|diagnostic|gadget/i,
  hudson: /popcorn/i,
  sarah: /boba|milk tea/i,
  pete: /leg day|push-ups|squats|in shape|protein/i,
  brody: /pizza|nachos|cheeseburger|starving|bite/i,
  uncleMike: /Georgia/,
  evan: /CJ's sister/,
  cj: /skibidi|aura|sigma|Ohio/i,
  jordan: /\b(bet|betting|odds|double or nothing|streak|lucky)\b/i,
  villain: /evil|scheme|diabolical|mwaha/i,
};

describe("Scenario greetings", () => {
  it.each(AllScenarios.map((scenario) => [scenario.id, scenario] as const))(
    "%s opens every call with their obsession",
    (id, scenario) => {
      const words = ObsessionWords[id];
      expect(words, `add ${id} to ObsessionWords`).toBeDefined();
      for (const greeting of scenario.lines.greetings) {
        expect(greeting).toMatch(words ?? /$^/);
      }
    },
  );
});
