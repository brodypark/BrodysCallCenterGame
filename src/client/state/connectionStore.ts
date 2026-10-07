// Connection status and the server's last hello, kept outside React so any component can
// read it with useConnection().

import { useSyncExternalStore } from "react";
import { socket } from "@client/net/socket";
import type { HelloPayload } from "@shared/events";

export type ConnectionStatus = "connecting" | "connected" | "disconnected";

export interface ConnectionState {
  status: ConnectionStatus;
  serverMessage: string | null;
}

// Starts from the socket's real state, since in development Vite can re-run this module
// while the socket is already connected.
let state: ConnectionState = {
  status: socket.connected ? "connected" : "connecting",
  serverMessage: null,
};
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
  update({ status: "disconnected", serverMessage: null });
}

function onConnectError(): void {
  update({ status: "disconnected" });
}

function onHello(payload: HelloPayload): void {
  update({ serverMessage: payload.message });
}

socket.on("connect", onConnect);
socket.on("disconnect", onDisconnect);
socket.on("connect_error", onConnectError);
socket.on("hello", onHello);

// When Vite hot-reloads this module in development, remove the old copy's socket listeners
// so they don't pile up.
import.meta.hot?.dispose(() => {
  socket.off("connect", onConnect);
  socket.off("disconnect", onDisconnect);
  socket.off("connect_error", onConnectError);
  socket.off("hello", onHello);
});

/** The current connection state; re-renders the component when it changes. */
export function useConnection(): ConnectionState {
  return useSyncExternalStore(subscribe, getSnapshot);
}
