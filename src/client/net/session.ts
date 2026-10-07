// Opens the connection to the game server. The server only accepts connections from
// browsers with a valid player id cookie, so the client asks for one first, and again
// whenever the server turns the connection down.

import { ApiRoutes } from "@shared/api";
import { Config } from "@shared/Config";
import { secondsToMs } from "@shared/time";
import { socket } from "@client/net/socket";
import { markReconnecting } from "@client/state/connectionStore";

let retryTimer: ReturnType<typeof setTimeout> | null = null;

/** Makes sure this browser has a player id cookie. The page never sees the id (httpOnly). */
async function ensureSession(): Promise<void> {
  try {
    await fetch(ApiRoutes.Session, { method: "POST", credentials: "same-origin" });
  } catch {
    // The server is down. The socket keeps retrying, and this runs again if it's turned down.
  }
}

async function connect(): Promise<void> {
  await ensureSession();
  socket.connect();
}

function onConnectError(): void {
  // A dropped or unreachable server: Socket.IO keeps retrying by itself.
  if (socket.active || retryTimer !== null) {
    return;
  }
  // Turned down by the server (e.g. the cookie expired): get a new one and try again.
  retryTimer = setTimeout(() => {
    retryTimer = null;
    void connect();
  }, secondsToMs(Config.Connection.RetrySeconds));
}

/** Connects for the first time. Call once when the page loads. */
export function startConnection(): void {
  socket.on("connect_error", onConnectError);
  void connect();
}

/** After another tab took over, takes the game back to this tab. */
export function playHere(): void {
  markReconnecting();
  void connect();
}
