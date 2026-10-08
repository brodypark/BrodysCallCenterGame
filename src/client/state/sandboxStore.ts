// The client's copy of the Sandbox control panel: its settings and who can call, as the
// server last sent them. null outside Sandbox (or before the server has said).

import type { SandboxSnapshot } from "@shared/sandbox";
import type { SavesSnapshot } from "@shared/types";
import { socket } from "@client/net/socket";
import { createStore, useStore } from "@client/state/createStore";

const sandbox = createStore<SandboxSnapshot | null>(null);

function onSnapshot(snapshot: SandboxSnapshot): void {
  sandbox.set(snapshot);
}

// Leaving Sandbox forgets the panel, so nothing stale lingers in Campaign.
function onSaves(saves: SavesSnapshot): void {
  if (saves.mode !== "sandbox") {
    sandbox.set(null);
  }
}

socket.on("sandbox:snapshot", onSnapshot);
socket.on("saves:snapshot", onSaves);

// When Vite hot-reloads this module in development, remove the old copy's listener.
import.meta.hot?.dispose(() => {
  socket.off("sandbox:snapshot", onSnapshot);
  socket.off("saves:snapshot", onSaves);
});

/** The latest control panel state; re-renders the component when it changes. */
export function useSandbox(): SandboxSnapshot | null {
  return useStore(sandbox);
}
