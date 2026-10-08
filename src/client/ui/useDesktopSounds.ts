// The desktop's own sounds: a click for any button pressed on it, and a sound when a window
// opens or closes (however it happened: an icon, the start menu, a call popping it up).

import { type RefObject, useEffect } from "react";
import type { DesktopStore } from "@client/ui/desktopStore";
import { playSound } from "@client/ui/sounds";

export function useDesktopSounds(store: DesktopStore, screen: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    let openCount = store.getState().openOrder.length;
    return store.subscribe(() => {
      const count = store.getState().openOrder.length;
      if (count > openCount) {
        playSound("window-open");
      } else if (count < openCount) {
        playSound("window-close");
      }
      openCount = count;
    });
  }, [store]);

  useEffect(() => {
    const element = screen.current;
    if (!element) {
      return;
    }
    const onPointerDown = (event: PointerEvent): void => {
      const button = event.target instanceof Element ? event.target.closest("button") : null;
      if (button && !button.disabled) {
        playSound("click");
      }
    };
    element.addEventListener("pointerdown", onPointerDown);
    return () => element.removeEventListener("pointerdown", onPointerDown);
  }, [screen]);
}
