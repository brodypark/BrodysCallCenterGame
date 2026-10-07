// Socket.IO event types used by both the client and the server. Zod schemas for client
// events arrive with the first one the client sends (step 2).

export interface HelloPayload {
  message: string;
}

/** Events the server sends to one player's client. */
export interface ServerToClientEvents {
  hello: (payload: HelloPayload) => void;
}

/** Events a client sends to the server: intent only, validated before use. None yet. */
export type ClientToServerEvents = Record<never, never>;
