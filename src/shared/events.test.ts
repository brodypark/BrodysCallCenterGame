import { describe, expect, it } from "vitest";
import { Config } from "@shared/Config";
import {
  ClientEventSchemas,
  ClientRequestResponseSchemas,
  ClientRequestSchemas,
} from "@shared/events";
import { MaxUnitsPerCharacter } from "@shared/messageText";

describe("client event schemas", () => {
  it("takes no payload for answer, decline and hang up", () => {
    for (const event of ["call:answer", "call:decline", "call:hangUp"] as const) {
      expect(ClientEventSchemas[event].safeParse(undefined).success).toBe(true);
      expect(ClientEventSchemas[event].safeParse({}).success).toBe(false);
      expect(ClientEventSchemas[event].safeParse("now").success).toBe(false);
    }
  });

  it("takes a message's text and nothing else", () => {
    const send = ClientEventSchemas["call:send"];
    expect(send.safeParse({ text: "hello" }).success).toBe(true);
    expect(send.safeParse({ text: 42 }).success).toBe(false);
    expect(send.safeParse("hello").success).toBe(false);
    expect(send.safeParse({ text: "hello", playerId: "someone-else" }).success).toBe(false);
  });

  it("turns away text far over the length limit", () => {
    const send = ClientEventSchemas["call:send"];
    const limit = Config.Call.MaxTypedMessageLength * MaxUnitsPerCharacter;
    expect(send.safeParse({ text: "x".repeat(limit) }).success).toBe(true);
    expect(send.safeParse({ text: "x".repeat(limit + 1) }).success).toBe(false);
  });

  it("takes a positive whole line id for finished speaking", () => {
    const finished = ClientEventSchemas["call:finishedSpeaking"];
    expect(finished.safeParse({ lineId: 3 }).success).toBe(true);
    expect(finished.safeParse({ lineId: 0 }).success).toBe(false);
    expect(finished.safeParse({ lineId: 1.5 }).success).toBe(false);
    expect(finished.safeParse({ lineId: "3" }).success).toBe(false);
  });

  it("checks a redeem answer's shape", () => {
    const answer = ClientRequestResponseSchemas["redeem:code"];
    const good = { success: true, payout: 50, triesRemaining: 3, message: "Ka-ching! +$50" };
    expect(answer.safeParse(good).success).toBe(true);
    expect(answer.safeParse({ ...good, triesRemaining: null }).success).toBe(true);
    expect(answer.safeParse({ ...good, payout: "50" }).success).toBe(false);
  });

  it("takes a code of limited length to redeem", () => {
    const redeem = ClientRequestSchemas["redeem:code"];
    expect(redeem.safeParse({ code: "GMA-7QZ" }).success).toBe(true);
    expect(
      redeem.safeParse({ code: "x".repeat(Config.Redeem.MaxCodeInputLength + 1) }).success,
    ).toBe(false);
    expect(redeem.safeParse({ code: 7 }).success).toBe(false);
  });
});
