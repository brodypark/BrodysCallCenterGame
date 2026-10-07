import { describe, expect, it } from "vitest";
import { Config } from "@shared/Config";
import { ClientEventSchemas } from "@shared/events";
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
});
