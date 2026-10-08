import { describe, expect, it } from "vitest";
import { matchDevCommand } from "@server/prompts/DevCommands";

describe("matchDevCommand", () => {
  it("ignores normal messages", () => {
    expect(matchDevCommand("hello grandma")).toBeNull();
    expect(matchDevCommand("__proto__")).toBeNull();
    expect(matchDevCommand("constructor")).toBeNull();
  });

  it("ignores dev commands since they are disabled", () => {
    expect(matchDevCommand("!xp")).toBeNull();
    expect(matchDevCommand("!money")).toBeNull();
    expect(matchDevCommand("!level 11")).toBeNull();
  });
});
