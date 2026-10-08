// Whether the client is connected to the game server, or has been replaced by another tab.

import { socket } from "@client/net/socket";
import { createStore, useStore } from "@client/state/createStore";

// Replaced: the game was opened in another tab, which took over. This tab stays
// disconnected until the player chooses to play here again.
export type ConnectionStatus = "connecting" | "connected" | "disconnected" | "replaced";

export interface ConnectionState {
  status: ConnectionStatus;
}

// Starts from the socket's real state, since in development Vite can re-run this module
// while the socket is already connected.
const connection = createStore<ConnectionState>({
  status: socket.connected ? "connected" : "connecting",
});

function onConnect(): void {
  connection.set({ status: "connected" });
}

function onDisconnect(): void {
  // Being replaced ends with a disconnect too; keep showing why.
  if (connection.get().status !== "replaced") {
    connection.set({ status: "disconnected" });
  }
}

function onReplaced(): void {
  connection.set({ status: "replaced" });
}

socket.on("connect", onConnect);
socket.on("disconnect", onDisconnect);
socket.on("connect_error", onDisconnect);
socket.on("session:replaced", onReplaced);

// When Vite hot-reloads this module in development, remove the old copy's socket listeners
// so they don't pile up.
import.meta.hot?.dispose(() => {
  socket.off("connect", onConnect);
  socket.off("disconnect", onDisconnect);
  socket.off("connect_error", onDisconnect);
  socket.off("session:replaced", onReplaced);
});

/** The current connection state; re-renders the component when it changes. */
/** The connection state, and changes to it, for code outside React (e.g. sound cues). */
export const connectionStore: Pick<typeof connection, "get" | "subscribe"> = connection;

export function useConnection(): ConnectionState {
  return useStore(connection);
}

/** Connecting again after being replaced takes this tab back from the other one. */
export function markReconnecting(): void {
  connection.set({ status: "connecting" });
}
