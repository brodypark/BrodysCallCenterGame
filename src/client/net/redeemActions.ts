// Asks the server to cash in a card code. Intent only: the server checks the code and
// decides the payout.

import { Config } from "@shared/Config";
import { ClientRequestResponseSchemas } from "@shared/events";
import { secondsToMs } from "@shared/time";
import type { RedeemResult } from "@shared/types";
import { socket } from "@client/net/socket";

/** The server's answer, or null if it couldn't be reached in time. */
export async function redeemCode(code: string): Promise<RedeemResult | null> {
  if (!socket.connected) {
    return null;
  }
  try {
    const answer: unknown = await socket
      .timeout(secondsToMs(Config.Connection.RequestTimeoutSeconds))
      .emitWithAck("redeem:code", { code });
    const parsed = ClientRequestResponseSchemas["redeem:code"].safeParse(answer);
    return parsed.success ? parsed.data : null;
  } catch {
    // No answer in time.
    return null;
  }
}
