// Opens Email by itself when the boss's welcome is waiting unread (a Campaign save's first
// time), once the desk shows between shifts. Opened after How to Play, so it's in front.

import { useEffect, useRef } from "react";
import type { DesktopStore } from "@client/ui/desktopStore";
import { useMail } from "@client/state/mailStore";
import { useSaves } from "@client/state/savesStore";
import { useShift } from "@client/state/shiftStore";
import { useTitleMenuShown } from "@client/ui/useTitleMenuShown";

export function useMailPopup(store: DesktopStore): void {
  const { autoOpenId } = useMail();
  const activeSlot = useSaves()?.activeSlot ?? null;
  const menuShown = useTitleMenuShown(store);
  const shiftStatus = useShift().snapshot.status;
  // Never mid-shift, on top of a ringing phone.
  const deskShown = !menuShown && shiftStatus === "offShift";
  // The save and email it last opened for, so closing the window doesn't bring it straight
  // back. Ids start again in every save, so the save is part of it.
  const opened = useRef<string | null>(null);

  useEffect(() => {
    const key = `${activeSlot}:${autoOpenId}`;
    if (autoOpenId !== null && deskShown && opened.current !== key) {
      opened.current = key;
      store.openApp("Email");
    }
  }, [activeSlot, autoOpenId, deskShown, store]);
}
