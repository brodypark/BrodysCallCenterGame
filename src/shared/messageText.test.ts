import { describe, expect, it } from "vitest";
import { cleanMessage } from "@shared/messageText";

describe("cleanMessage", () => {
  it("trims the ends", () => {
    expect(cleanMessage("  hello there  ")).toBe("hello there");
  });

  it("turns control characters and odd spaces into plain spaces", () => {
    expect(cleanMessage("hi\nthere\tfriend")).toBe("hi there friend");
    expect(cleanMessage("hi\u2028there\u00A0you")).toBe("hi there you");
  });

  it("rejects messages that are empty once cleaned", () => {
    expect(cleanMessage("")).toBeNull();
    expect(cleanMessage(" \n\t\u00A0\u3000 ")).toBeNull();
  });

  it("counts characters, not UTF-16 units, against the limit", () => {
    expect(cleanMessage("😀".repeat(5), 5)).toBe("😀😀😀😀😀");
    expect(cleanMessage("😀".repeat(6), 5)).toBeNull();
    expect(cleanMessage("a".repeat(6), 5)).toBeNull();
  });

  it("rejects broken text", () => {
    expect(cleanMessage("bad \uD83D half")).toBeNull();
  });
});
