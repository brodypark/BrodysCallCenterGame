// Which victim line the server is waiting on the client to say, if any.

import type { CallSnapshot } from "@shared/types";

export interface VictimLine {
  lineId: number;
  text: string;
}

/** The line the victim is saying right now: the newest victim line, during their turn. */
export function currentVictimLine(call: CallSnapshot): VictimLine | null {
  if (call.status !== "inCall" || call.turn !== "victimTurn") {
    return null;
  }
  const message = call.transcript?.messages.findLast((line) => line.speaker === "victim");
  return message?.speaker === "victim" ? { lineId: message.lineId, text: message.text } : null;
}
