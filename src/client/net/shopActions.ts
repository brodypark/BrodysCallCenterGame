// Asks the server to buy or equip something in the Shop. Intent only: the server checks the
// price, the order of tiers and that the shop is open.

import { Config } from "@shared/Config";
import { ClientRequestResponseSchemas } from "@shared/events";
import { secondsToMs } from "@shared/time";
import type { ShopResult } from "@shared/types";
import { socket } from "@client/net/socket";

async function ask(request: "shop:buy" | "shop:equip", id: string): Promise<ShopResult | null> {
  if (!socket.connected) {
    return null;
  }
  try {
    const answer: unknown = await socket
      .timeout(secondsToMs(Config.Connection.RequestTimeoutSeconds))
      .emitWithAck(request, { id });
    const parsed = ClientRequestResponseSchemas[request].safeParse(answer);
    return parsed.success ? parsed.data : null;
  } catch {
    // No answer in time.
    return null;
  }
}

/** The server's answer, or null if it couldn't be reached in time. */
export function buyUpgrade(id: string): Promise<ShopResult | null> {
  return ask("shop:buy", id);
}

export function equipCosmetic(id: string): Promise<ShopResult | null> {
  return ask("shop:equip", id);
}
