// Opens How to Play by itself when the player picks a save whose tutorial they've never
// closed, and tells the server once they close it.

import { useEffect, useRef } from "react";
import type { DesktopStore } from "@client/ui/desktopStore";
import { tutorialSeen } from "@client/net/tutorialActions";
import { useSaves } from "@client/state/savesStore";
import { useStats } from "@client/state/statsStore";

export function useTutorialPopup(store: DesktopStore): void {
  const activeSlot = useSaves()?.activeSlot ?? null;
  const { tutorialSeen: seen } = useStats();
  // Read when a save is picked, not watched: the server sends a save's stats before the
  // saves snapshot that picks it, and default stats (seen false) when leaving one.
  const seenRef = useRef(seen);
  // The save that was picked last, so it only opens when the pick changes.
  const pickedSlot = useRef<number | null>(null);

  useEffect(() => {
    seenRef.current = seen;
  }, [seen]);

  useEffect(() => {
    const newlyPicked = activeSlot !== null && activeSlot !== pickedSlot.current;
    pickedSlot.current = activeSlot;
    if (newlyPicked && !seenRef.current) {
      store.openApp("Tutorial");
    }
  }, [activeSlot, store]);

  // Closing the window (by any means) marks it seen.
  useEffect(() => {
    let wasOpen = store.getState().openOrder.includes("Tutorial");
    return store.subscribe(() => {
      const isOpen = store.getState().openOrder.includes("Tutorial");
      if (wasOpen && !isOpen) {
        tutorialSeen();
      }
      wasOpen = isOpen;
    });
  }, [store]);
}
