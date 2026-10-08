// The client's copy of the player's stats: the last copy the server sent.

import type { PlayerStats } from "@shared/types";
import { socket } from "@client/net/socket";
import { createStore, useStore } from "@client/state/createStore";

const stats = createStore<PlayerStats>({
  money: 0,
  xp: 0,
  callsCompleted: 0,
  successfulCalls: 0,
  shiftsPassed: 0,
  shiftsFailed: 0,
});

function onStats(next: PlayerStats): void {
  stats.set(next);
}

socket.on("stats:snapshot", onStats);

// When Vite hot-reloads this module in development, remove the old copy's listener.
import.meta.hot?.dispose(() => {
  socket.off("stats:snapshot", onStats);
});

/** The latest stats; re-renders the component when they change. */
export function useStats(): PlayerStats {
  return useStore(stats);
}
