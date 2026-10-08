// Opens How to Play by itself when the player picks a save whose tutorial they've never
// closed, the first time the desk shows between shifts, and tells the server once they
// close it.

import { useEffect, useRef } from "react";
import type { DesktopStore } from "@client/ui/desktopStore";
import { tutorialSeen } from "@client/net/tutorialActions";
import { useSaves } from "@client/state/savesStore";
import { useShift } from "@client/state/shiftStore";
import { useStats } from "@client/state/statsStore";
import { useTitleMenuShown } from "@client/ui/useTitleMenuShown";

export function useTutorialPopup(store: DesktopStore): void {
  const activeSlot = useSaves()?.activeSlot ?? null;
  const { tutorialSeen: seen } = useStats();
  const menuShown = useTitleMenuShown(store);
  const shiftStatus = useShift().snapshot.status;
  // Never mid-shift, on top of a ringing phone.
  const deskShown = !menuShown && shiftStatus === "offShift";
  // Read when a save is picked, not watched: the server sends a save's stats before the
  // saves snapshot that picks it, and default stats (seen false) when leaving one.
  const seenRef = useRef(seen);
  // The save that was picked last, and whether it's still waiting to show How to Play.
  const pickedSlot = useRef<number | null>(null);
  const waiting = useRef(false);

  useEffect(() => {
    seenRef.current = seen;
  }, [seen]);

  useEffect(() => {
    if (activeSlot !== pickedSlot.current) {
      pickedSlot.current = activeSlot;
      waiting.current = activeSlot !== null && !seenRef.current;
    }
    if (waiting.current && deskShown) {
      waiting.current = false;
      store.openApp("Tutorial");
    }
  }, [activeSlot, deskShown, store]);

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
