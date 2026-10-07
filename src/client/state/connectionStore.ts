// Whether the client is connected to the game server, kept outside React so any component
// can read it with useConnection().

import { useSyncExternalStore } from "react";
import { socket } from "@client/net/socket";

export type ConnectionStatus = "connecting" | "connected" | "disconnected";

export interface ConnectionState {
  status: ConnectionStatus;
}

// Starts from the socket's real state, since in development Vite can re-run this module
// while the socket is already connected.
let state: ConnectionState = { status: socket.connected ? "connected" : "connecting" };
const listeners = new Set<() => void>();

function update(changes: Partial<ConnectionState>): void {
  state = { ...state, ...changes };
  for (const listener of listeners) {
    listener();
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): ConnectionState {
  return state;
}

function onConnect(): void {
  update({ status: "connected" });
}

function onDisconnect(): void {
  update({ status: "disconnected" });
}

socket.on("connect", onConnect);
socket.on("disconnect", onDisconnect);
socket.on("connect_error", onDisconnect);

// When Vite hot-reloads this module in development, remove the old copy's socket listeners
// so they don't pile up.
import.meta.hot?.dispose(() => {
  socket.off("connect", onConnect);
  socket.off("disconnect", onDisconnect);
  socket.off("connect_error", onDisconnect);
});

/** The current connection state; re-renders the component when it changes. */
export function useConnection(): ConnectionState {
  return useSyncExternalStore(subscribe, getSnapshot);
}
