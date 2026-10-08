import { describe, expect, it } from "vitest";
import {
  NothingHeardNotice,
  shortenTranscript,
  speechFailure,
  takesTyping,
} from "@client/voice/playerSpeech";

describe("speechFailure", () => {
  it("switches voice off for good when the mic is blocked or missing", () => {
    for (const code of ["not-allowed", "service-not-allowed", "audio-capture"]) {
      const failure = speechFailure(code);
      expect(failure.permanent).toBe(true);
      expect(failure.notice).not.toBeNull();
    }
  });

  it("lets the player try again after hearing nothing or a network blip", () => {
    expect(speechFailure("no-speech")).toEqual({ notice: NothingHeardNotice, permanent: false });
    expect(speechFailure("network").permanent).toBe(false);
  });

  it("says nothing when the talk was stopped on purpose", () => {
    expect(speechFailure("aborted")).toEqual({ notice: null, permanent: false });
  });

  it("has a notice for errors it doesn't know", () => {
    expect(speechFailure("something-new")).toEqual({
      notice: expect.any(String) as string,
      permanent: false,
    });
  });
});

describe("shortenTranscript", () => {
  it("leaves short text alone, trimmed", () => {
    expect(shortenTranscript("  hello grandma  ", 200)).toBe("hello grandma");
  });

  it("cuts long text at a word break", () => {
    expect(shortenTranscript("one two three four", 12)).toBe("one two");
  });

  it("cuts mid-word when the only break would lose too much", () => {
    expect(shortenTranscript("a supercalifragilistic", 10)).toBe("a supercal");
  });

  it("counts characters, not UTF-16 units", () => {
    expect(shortenTranscript("😀😀😀", 2)).toBe("😀😀");
  });
});

describe("takesTyping", () => {
  it("is true for text boxes and editable elements", () => {
    expect(takesTyping({ tagName: "INPUT", isContentEditable: false })).toBe(true);
    expect(takesTyping({ tagName: "TEXTAREA", isContentEditable: false })).toBe(true);
    expect(takesTyping({ tagName: "DIV", isContentEditable: true })).toBe(true);
  });

  it("is false for buttons, the page, and nothing focused", () => {
    expect(takesTyping({ tagName: "BUTTON", isContentEditable: false })).toBe(false);
    expect(takesTyping({ tagName: "BODY", isContentEditable: false })).toBe(false);
    expect(takesTyping(null)).toBe(false);
  });
});
