// The client's copy of the player's shift: the last snapshot the server sent.

import type { ShiftSnapshot } from "@shared/types";
import { socket } from "@client/net/socket";
import { createStore, useStore } from "@client/state/createStore";

const shift = createStore<ShiftSnapshot>({ earnings: 0 });

function onSnapshot(snapshot: ShiftSnapshot): void {
  shift.set(snapshot);
}

socket.on("shift:snapshot", onSnapshot);

// When Vite hot-reloads this module in development, remove the old copy's listener.
import.meta.hot?.dispose(() => {
  socket.off("shift:snapshot", onSnapshot);
});

/** The latest shift snapshot; re-renders the component when it changes. */
export function useShift(): ShiftSnapshot {
  return useStore(shift);
}
