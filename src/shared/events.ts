// Socket.IO event types used by both the client and the server. Zod schemas for client
// events arrive with the first one the client sends (step 2).

/** Events the server sends to one player's client. None yet. */
export type ServerToClientEvents = Record<never, never>;

/** Events a client sends to the server: intent only, validated before use. None yet. */
export type ClientToServerEvents = Record<never, never>;
