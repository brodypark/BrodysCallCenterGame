import { describe, expect, it } from "vitest";
import { splitSpoken } from "@client/voice/spokenWords";

const Line = "Oh hello dear, who is this?";

describe("splitSpoken", () => {
  it("shows nothing before they start", () => {
    expect(splitSpoken(Line, 0)).toEqual({ said: "", unsaid: Line });
  });

  it("shows each letter once its share of the line is reached", () => {
    expect(splitSpoken(Line, 0.01)).toEqual({ said: "O", unsaid: "h hello dear, who is this?" });
    expect(splitSpoken(Line, 4 / Line.length).said).toBe("Oh h");
    expect(splitSpoken(Line, 4.5 / Line.length).said).toBe("Oh he");
    expect(splitSpoken(Line, 0.99).said).toBe(Line);
  });

  it("shows the whole line once said, or if the fraction runs over", () => {
    expect(splitSpoken(Line, 1)).toEqual({ said: Line, unsaid: "" });
    expect(splitSpoken(Line, 1.5)).toEqual({ said: Line, unsaid: "" });
  });

  it("puts said and unsaid back together into the line", () => {
    for (const fraction of [0, 0.2, 0.5, 0.8, 1]) {
      const { said, unsaid } = splitSpoken(Line, fraction);
      expect(said + unsaid).toBe(Line);
    }
  });

  it("never splits an emoji in half", () => {
    expect(splitSpoken("Hi 👋", 0.9)).toEqual({ said: "Hi 👋", unsaid: "" });
    expect(splitSpoken("Hi 👋", 0.7)).toEqual({ said: "Hi ", unsaid: "👋" });
  });

  it("handles a negative fraction and an empty line", () => {
    expect(splitSpoken(Line, -1).said).toBe("");
    expect(splitSpoken("", 0.5)).toEqual({ said: "", unsaid: "" });
  });
});
