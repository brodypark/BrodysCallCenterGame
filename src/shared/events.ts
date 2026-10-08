// Socket.IO events between the client and the server. Every client event has a Zod schema:
// the server parses each payload with it and ignores anything that doesn't match. Clients
// only send intent; the server decides what happens.

import { z } from "zod";
import { Config } from "@shared/Config";
import { MaxUnitsPerCharacter } from "@shared/messageText";
import type {
  CallSnapshot,
  PlayerStats,
  RedeemResult,
  ShiftResult,
  ShiftSnapshot,
} from "@shared/types";

const clientEventSchemas = {
  "shift:clockIn": z.undefined(),
  // The player closed the shift report.
  "shift:resultSeen": z.undefined(),
  "call:answer": z.undefined(),
  "call:decline": z.undefined(),
  "call:hangUp": z.undefined(),
  // A rough length check; cleanMessage() does the exact one.
  "call:send": z.strictObject({
    text: z.string().max(Config.Call.MaxTypedMessageLength * MaxUnitsPerCharacter),
  }),
  // The victim's line `lineId` has been said, so the turn can move on.
  "call:finishedSpeaking": z.strictObject({
    lineId: z.number().int().positive(),
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

// Requests: client events the server answers (a Socket.IO acknowledgement).
const clientRequestSchemas = {
  "redeem:code": z.strictObject({ code: z.string().max(Config.Redeem.MaxCodeInputLength) }),
} satisfies Record<string, z.ZodType>;

export type ClientRequestName = keyof typeof clientRequestSchemas;

export type ClientRequestPayload<R extends ClientRequestName> = z.output<
  (typeof clientRequestSchemas)[R]
>;

/** What the server answers each request with. */
export interface ClientRequestResponses {
  "redeem:code": RedeemResult;
}

/** The shape of each answer, so the client can check what it got back. */
export const ClientRequestResponseSchemas: {
  readonly [R in ClientRequestName]: z.ZodType<ClientRequestResponses[R]>;
} = {
  "redeem:code": z.strictObject({
    success: z.boolean(),
    payout: z.number(),
    triesRemaining: z.number().nullable(),
    message: z.string(),
  }),
};

/** The schema for each client request's payload. */
export const ClientRequestSchemas: {
  readonly [R in ClientRequestName]: z.ZodType<ClientRequestPayload<R>>;
} = clientRequestSchemas;

/** Client events and requests as the client sends them. */
export type ClientToServerEvents = {
  [E in ClientEventName]: ClientEventPayload<E> extends undefined
    ? () => void
    : (payload: ClientEventPayload<E>) => void;
} & {
  [R in ClientRequestName]: (
    payload: ClientRequestPayload<R>,
    answer: (response: ClientRequestResponses[R]) => void,
  ) => void;
};

/** Client events as the server receives them: anything at all, until it's been parsed. */
export type IncomingClientEvents = Record<
  ClientEventName | ClientRequestName,
  (...args: unknown[]) => void
>;

/** Events the server sends to one player's client. */
export interface ServerToClientEvents {
  "call:snapshot": (snapshot: CallSnapshot) => void;
  "shift:snapshot": (snapshot: ShiftSnapshot) => void;
  "shift:ended": (result: ShiftResult) => void;
  "stats:snapshot": (stats: PlayerStats) => void;
  // The player opened the game in another tab, which took over. This tab is disconnected
  // and doesn't reconnect by itself.
  "session:replaced": () => void;
}
