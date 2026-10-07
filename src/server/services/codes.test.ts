import { describe, expect, it } from "vitest";
import { normalizeCode } from "@shared/cardCode";
import { Config } from "@shared/Config";
import { generateCode } from "@server/services/codes";

const Shape = new RegExp(
  `^GMA(-[${Config.Code.Characters}]{${Config.Code.GroupLength}}){${Config.Code.GroupCount}}$`,
);

describe("generateCode", () => {
  it("makes codes like GMA-7QZ from the safe alphabet", () => {
    for (let index = 0; index < 200; index++) {
      expect(generateCode("GMA", () => false)).toMatch(Shape);
    }
  });

  it("gives up rather than looping forever when every code is taken", () => {
    expect(() => generateCode("GMA", () => true)).toThrow(/No free GMA code/);
  });

  it("never hands out a code that's taken", () => {
    const taken = new Set<string>();
    for (let index = 0; index < 500; index++) {
      const code = generateCode("GMA", (normalized) => taken.has(normalized));
      expect(taken.has(normalizeCode(code))).toBe(false);
      taken.add(normalizeCode(code));
    }
  });
});

describe("normalizeCode", () => {
  it("ignores case, spaces and dashes", () => {
    expect(normalizeCode(" gma - 7qz ")).toBe("GMA7QZ");
    expect(normalizeCode("GMA-7QZ")).toBe("GMA7QZ");
  });
});
