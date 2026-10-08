// Whether the title menu covers the desktop right now, and resetting the desk between saves. Takes the store, so the desktop
// itself can ask too (it isn't inside its own context).

import { useEffect, useSyncExternalStore } from "react";
import { useSaves } from "@client/state/savesStore";
import { useShift } from "@client/state/shiftStore";
import type { DesktopStore } from "@client/ui/desktopStore";
import { isTitleMenuShown } from "@client/ui/titleMenuRules";

export function useTitleMenuShown(store: DesktopStore): boolean {
  const { snapshot, result } = useShift();
  const activeSlot = useSaves()?.activeSlot ?? null;
  const titleMenuOpen = useSyncExternalStore(store.subscribe, () => store.getState().titleMenuOpen);
  return isTitleMenuShown({
    shiftStatus: snapshot.status,
    showingResult: result !== null,
    activeSlot,
    titleMenuOpen,
  });
}

/** Clears the desk whenever the player leaves a save: closes its windows and reopens the
 * menu, so the next save starts fresh on the menu (with no frame of desk in between). Used
 * once, by the desktop. */
export function useTitleMenuReset(store: DesktopStore): void {
  const activeSlot = useSaves()?.activeSlot ?? null;
  useEffect(() => {
    if (activeSlot === null) {
      for (const id of store.getState().openOrder) {
        store.closeApp(id);
      }
      store.setTitleMenuOpen(true);
    }
  }, [activeSlot, store]);
}
