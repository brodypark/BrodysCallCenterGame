// The client's copy of the player's save slots, and which one this session is playing.
// null until the server first says.

import type { GameMode } from "@shared/sandbox";
import type { SavesSnapshot } from "@shared/types";
import { socket } from "@client/net/socket";
import { createStore, useStore } from "@client/state/createStore";

const saves = createStore<SavesSnapshot | null>(null);

function onSnapshot(snapshot: SavesSnapshot): void {
  saves.set(snapshot);
}

socket.on("saves:snapshot", onSnapshot);

// When Vite hot-reloads this module in development, remove the old copy's listener.
import.meta.hot?.dispose(() => {
  socket.off("saves:snapshot", onSnapshot);
});

/** The latest save slots, and changes to them, for code outside React (e.g. sound cues). */
export const savesStore: Pick<typeof saves, "get" | "subscribe"> = saves;

/** The latest save slots, or null before the server has sent them. */
export function useSaves(): SavesSnapshot | null {
  return useStore(saves);
}

/** Which way the player is playing (Campaign or Sandbox), or null before they pick. */
export function useGameMode(): GameMode | null {
  return useStore(saves)?.mode ?? null;
}
