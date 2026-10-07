import { describe, expect, it } from "vitest";
import type { CallSnapshot } from "@shared/types";
import { currentVictimLine } from "@client/voice/victimLine";

const talking: CallSnapshot = {
  status: "inCall",
  caller: "Grandma Gertrude",
  turn: "victimTurn",
  playerTurns: 1,
  transcript: {
    callerName: "Grandma Gertrude",
    messages: [
      { speaker: "victim", text: "Hello, dear!", lineId: 1 },
      { speaker: "player", text: "Hi there" },
      { speaker: "victim", text: "Oh, you sound nice.", lineId: 2 },
    ],
    endReason: null,
  },
  lastOutcome: null,
};

describe("currentVictimLine", () => {
  it("is the newest victim line during the victim's turn", () => {
    expect(currentVictimLine(talking)).toEqual({ lineId: 2, text: "Oh, you sound nice." });
  });

  it("is nothing on the player's turn, while thinking, or outside a call", () => {
    expect(currentVictimLine({ ...talking, turn: "playerTurn" })).toBeNull();
    expect(currentVictimLine({ ...talking, turn: "processing" })).toBeNull();
    expect(currentVictimLine({ ...talking, status: "idle", turn: null })).toBeNull();
  });
});
