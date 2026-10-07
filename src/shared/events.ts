// Socket.IO events between the client and the server. Every client event has a Zod schema:
// the server parses each payload with it and ignores anything that doesn't match. Clients
// only send intent; the server decides what happens.

import { z } from "zod";
import { Config } from "@shared/Config";
import { MaxUnitsPerCharacter } from "@shared/messageText";
import type { CallSnapshot } from "@shared/types";

const clientEventSchemas = {
  "call:answer": z.undefined(),
  "call:decline": z.undefined(),
  "call:hangUp": z.undefined(),
  // A rough length check; cleanMessage() does the exact one.
  "call:send": z.strictObject({
    text: z.string().max(Config.Call.MaxTypedMessageLength * MaxUnitsPerCharacter),
  }),
} satisfies Record<string, z.ZodType>;

export type ClientEventName = keyof typeof clientEventSchemas;

export type ClientEventPayload<E extends ClientEventName> = z.output<
  (typeof clientEventSchemas)[E]
>;

/** The schema for each client event's payload. */
export const ClientEventSchemas: {
  readonly [E in ClientEventName]: z.ZodType<ClientEventPayload<E>>;
} = clientEventSchemas;

/** Client events as the client sends them. */
export type ClientToServerEvents = {
  [E in ClientEventName]: ClientEventPayload<E> extends undefined
    ? () => void
    : (payload: ClientEventPayload<E>) => void;
};

/** Client events as the server receives them: anything at all, until it's been parsed. */
export type IncomingClientEvents = Record<ClientEventName, (...args: unknown[]) => void>;

/** Events the server sends to one player's client. */
export interface ServerToClientEvents {
  "call:snapshot": (snapshot: CallSnapshot) => void;
  // The player opened the game in another tab, which took over. This tab is disconnected
  // and doesn't reconnect by itself.
  "session:replaced": () => void;
}
