import { describe, expect, it } from "vitest";
import { Config } from "@shared/Config";
import { cleanReplyText, maskCodes, parseAIReply } from "@server/services/aiReply";

const json = (value: unknown): string => JSON.stringify(value);
const reply = (text: string, extra: object = {}): string =>
  json({ reply: text, suspicionChange: -5, revealsCode: false, revealsCard: false, ...extra });

describe("maskCodes", () => {
  it.each([
    ["The back says GMA-7QZ, dear.", "The back says ..., dear."],
    ["It's gma-bcd I think", "It's ... I think"],
    ["GMA BCD, was it?", "..., was it?"],
    ["GMA–7QZ with an en dash", "... with an en dash"],
    ["My other card is WBK-XYZ", "My other card is ..."],
    ["Some other shape: ABC-123", "Some other shape: ..."],
    ["Codes like 7QZ or b7k", "Codes like ... or ..."],
    ["GMA7QZ all squashed", "... all squashed"],
  ])("masks %j", (input, expected) => {
    expect(maskCodes(input, "GMA")).toBe(expected);
  });

  it.each([
    "Back in 1958, in the 1950s, at 9am on the 2nd.",
    "WOO-HOO! Oh, my stars!",
    "AND THE cat sat on it",
    "Bless your cotton socks, dear.",
    "A well-known, half-baked idea",
  ])("leaves ordinary text alone: %j", (input) => {
    expect(maskCodes(input, "GMA")).toBe(input);
  });
});

describe("cleanReplyText", () => {
  it("makes one tidy line", () => {
    expect(cleanReplyText("  Oh\n\nmy   stars!\t", "GMA")).toBe("Oh my stars!");
  });

  it("cuts a long reply at a word break, with an ellipsis", () => {
    const long = "word ".repeat(100);
    const cleaned = cleanReplyText(long, "GMA");
    expect([...cleaned].length).toBeLessThanOrEqual(Config.AI.MaxReplyLength);
    expect(cleaned.endsWith("word...")).toBe(true);
  });
});

describe("parseAIReply", () => {
  it("reads a well-formed reply", () => {
    expect(parseAIReply(reply("Hello, dear!"), "GMA")).toEqual({
      reply: "Hello, dear!",
      suspicionChange: -5,
      revealsCode: false,
      revealsCard: false,
      hangsUp: false,
    });
  });

  it("reads a goodbye that ends the call", () => {
    expect(parseAIReply(reply("Bye now!", { hangsUp: true }), "GMA")?.hangsUp).toBe(true);
  });

  it("copes with a code fence around the JSON", () => {
    expect(parseAIReply("```json\n" + reply("Hi") + "\n```", "GMA")?.reply).toBe("Hi");
  });

  it("clamps the suspicion change and rounds it", () => {
    expect(parseAIReply(reply("Hi", { suspicionChange: -999 }), "GMA")?.suspicionChange).toBe(
      -Config.Suspicion.MaxDropPerTurn,
    );
    expect(parseAIReply(reply("Hi", { suspicionChange: 999 }), "GMA")?.suspicionChange).toBe(
      Config.Suspicion.MaxRisePerTurn,
    );
    expect(parseAIReply(reply("Hi", { suspicionChange: 2.6 }), "GMA")?.suspicionChange).toBe(3);
  });

  it("treats a missing revealsCard or hangsUp as false and ignores extra fields", () => {
    const text = json({ reply: "Hi", suspicionChange: 0, revealsCode: true, extra: 1 });
    expect(parseAIReply(text, "GMA")).toEqual({
      reply: "Hi",
      suspicionChange: 0,
      revealsCode: true,
      revealsCard: false,
      hangsUp: false,
    });
  });

  it("masks a code the AI made up", () => {
    expect(parseAIReply(reply("It says GMA-7QZ!"), "GMA")?.reply).toBe("It says ...!");
  });

  it.each([
    ["not JSON", "Hello there"],
    ["broken JSON", '{"reply": "Hi",'],
    ["a missing field", json({ reply: "Hi", revealsCode: false })],
    ["a wrong type", json({ reply: "Hi", suspicionChange: "-5", revealsCode: false })],
    ["an empty reply", reply("   ")],
    ["an array", "[1, 2]"],
  ])("rejects %s", (_label, text) => {
    expect(parseAIReply(text, "GMA")).toBeNull();
  });
});
