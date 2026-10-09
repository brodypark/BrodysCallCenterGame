// Socket.IO events between the client and the server. Every client event has a Zod schema:
// the server parses each payload with it and ignores anything that doesn't match. Clients
// only send intent; the server decides what happens.

import { z } from "zod";
import { Config } from "@shared/Config";
import { MaxUnitsPerCharacter } from "@shared/messageText";
import { SandboxCheats, SandboxSettingsChangeSchema, type SandboxSnapshot } from "@shared/sandbox";
import type {
  CallSnapshot,
  CharactersSnapshot,
  MailSnapshot,
  PlayerStats,
  SavesSnapshot,
  RedeemResult,
  ShiftResult,
  ShopResult,
  ShiftSnapshot,
} from "@shared/types";

const slotSchema = z.strictObject({
  slot: z.number().int().min(1).max(Config.Saves.SlotCount),
});

const clientEventSchemas = {
  // Play the save in a slot.
  "saves:continue": slotSchema,
  // Start a fresh save in an empty slot and play it.
  "saves:new": slotSchema,
  "saves:delete": slotSchema,
  // Stop playing the current save and go back to the slot picker (off shift only).
  "saves:leave": z.undefined(),
  "shift:clockIn": z.undefined(),
  // End the shift early (only once the quota is met; the server checks).
  "shift:clockOut": z.undefined(),
  // The player closed How to Play.
  "tutorial:seen": z.undefined(),
  // The player opened an email.
  "mail:read": z.strictObject({ id: z.number().int().min(0) }),
  // The player closed the shift report.
  "shift:resultSeen": z.undefined(),
  "call:answer": z.undefined(),
  "call:decline": z.undefined(),
  "call:hangUp": z.undefined(),
  // A rough length check; cleanMessage() does the exact one.
  "call:send": z.strictObject({
    text: z.string().max(Config.Call.MaxTypedMessageLength * MaxUnitsPerCharacter),
  }),
  // Sandbox mode: play the Sandbox save, and its control panel. The server ignores these
  // outside Sandbox.
  "sandbox:enter": z.undefined(),
  "sandbox:settings": SandboxSettingsChangeSchema,
  "sandbox:ringNow": z.undefined(),
  // Sets the trust bar during a call, 0 to 100.
  "sandbox:trust": z.strictObject({
    percent: z.number().min(0).max(Config.Sandbox.TrustSliderMax),
  }),
  "sandbox:cheat": z.strictObject({ cheat: z.enum(SandboxCheats) }),
  // Puts on a wallpaper or theme by id; the server checks it exists.
  "sandbox:wear": z.strictObject({ id: z.string().max(Config.Shop.MaxUpgradeIdLength) }),
  "sandbox:reset": z.undefined(),
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
// Shop item ids are short; the server checks they exist.
const upgradeIdSchema = z.strictObject({ id: z.string().max(Config.Shop.MaxUpgradeIdLength) });

const clientRequestSchemas = {
  "redeem:code": z.strictObject({ code: z.string().max(Config.Redeem.MaxCodeInputLength) }),
  // Charge `amount` dollars to a Wobblebucks Card. RedeemService checks the amount's range.
  "wobblebucks:charge": z.strictObject({
    card: z.string().max(Config.Redeem.MaxCodeInputLength),
    amount: z.number(),
  }),
  "shop:buy": upgradeIdSchema,
  "shop:equip": upgradeIdSchema,
} satisfies Record<string, z.ZodType>;

export type ClientRequestName = keyof typeof clientRequestSchemas;

export type ClientRequestPayload<R extends ClientRequestName> = z.output<
  (typeof clientRequestSchemas)[R]
>;

/** What the server answers each request with. */
export interface ClientRequestResponses {
  "redeem:code": RedeemResult;
  "wobblebucks:charge": RedeemResult;
  "shop:buy": ShopResult;
  "shop:equip": ShopResult;
}

const shopResultSchema = z.strictObject({ success: z.boolean(), message: z.string() });
const redeemResultSchema = z.strictObject({
  success: z.boolean(),
  payout: z.number(),
  triesRemaining: z.number().nullable(),
  message: z.string(),
});

/** The shape of each answer, so the client can check what it got back. */
export const ClientRequestResponseSchemas: {
  readonly [R in ClientRequestName]: z.ZodType<ClientRequestResponses[R]>;
} = {
  "redeem:code": redeemResultSchema,
  "wobblebucks:charge": redeemResultSchema,
  "shop:buy": shopResultSchema,
  "shop:equip": shopResultSchema,
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
  "saves:snapshot": (saves: SavesSnapshot) => void;
  "sandbox:snapshot": (snapshot: SandboxSnapshot) => void;
  "characters:snapshot": (snapshot: CharactersSnapshot) => void;
  "mail:snapshot": (snapshot: MailSnapshot) => void;
  // The player opened the game in another tab, which took over. This tab is disconnected
  // and doesn't reconnect by itself.
  "session:replaced": () => void;
}
