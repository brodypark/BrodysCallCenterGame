// The client's copy of the player's stats: the last copy the server sent.

import { type PlayerStats, PlayerStatsSchema } from "@shared/stats";
import { socket } from "@client/net/socket";
import { createStore, useStore } from "@client/state/createStore";

const stats = createStore<PlayerStats>(PlayerStatsSchema.parse({}));

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
