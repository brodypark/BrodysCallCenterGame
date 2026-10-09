// The client's copy of the Characters app's pages, as the server last sent them. Hints the
// player hasn't earned aren't in it.

import type { CharactersSnapshot } from "@shared/types";
import { socket } from "@client/net/socket";
import { createStore, useStore } from "@client/state/createStore";

const characters = createStore<CharactersSnapshot>({ pages: [] });

function onSnapshot(snapshot: CharactersSnapshot): void {
  characters.set(snapshot);
}

socket.on("characters:snapshot", onSnapshot);

// When Vite hot-reloads this module in development, remove the old copy's listener.
import.meta.hot?.dispose(() => {
  socket.off("characters:snapshot", onSnapshot);
});

/** The latest pages; re-renders the component when they change. */
export function useCharacters(): CharactersSnapshot {
  return useStore(characters);
}
