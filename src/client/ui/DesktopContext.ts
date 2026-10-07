// Gives every part of one desktop its store, and the screen element for measuring drags.

import { createContext, type RefObject, use, useSyncExternalStore } from "react";
import type { DesktopState, DesktopStore } from "@client/ui/desktopStore";

export interface DesktopContextValue {
  store: DesktopStore;
  // The 16:9 screen. Drags measure it to turn pixels into fractions of the desktop.
  screenRef: RefObject<HTMLDivElement | null>;
}

export const DesktopContext = createContext<DesktopContextValue | null>(null);

/** The desktop this component is inside. */
export function useDesktop(): DesktopContextValue {
  const desktop = use(DesktopContext);
  if (desktop === null) {
    throw new Error("useDesktop() must be used inside <Desktop>.");
  }
  return desktop;
}

/** The desktop's current state; re-renders the component when it changes. */
export function useDesktopState(): DesktopState {
  const { store } = useDesktop();
  return useSyncExternalStore(store.subscribe, store.getState);
}
