// The desktop shake when a victim hangs up. It belongs to the whole desktop rather than one
// window: anything can ask for one, and the Desktop plays it on its own box, so it
// never moves anything outside the desktop.

import { useEffect, type RefObject } from "react";
import { Config } from "@shared/Config";
import { secondsToMs } from "@shared/time";
import { createStore } from "@client/state/createStore";

// Goes up by one per shake asked for.
const shakes = createStore(0);

/** Shakes the desktop for a moment. */
export function shakeDesktop(): void {
  shakes.set(shakes.get() + 1);
}

// Offsets as fractions of Config.Effects.ShakeAmount, dying down toward the end.
const ShakePath = [0, 1, -1, 0.8, -0.8, 0.5, -0.5, 0.2, 0];
const Percent = 100;

/** Shakes `target` whenever shakeDesktop is called (not with reduced motion). */
export function useDesktopShake(target: RefObject<HTMLElement | null>): void {
  useEffect(
    () =>
      shakes.subscribe(() => {
        const element = target.current;
        if (!element || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
          return;
        }
        const amount = Config.Effects.ShakeAmount * Percent;
        element.animate(
          ShakePath.map((offset, index) => ({
            transform: `translate(${offset * amount}%, ${(index % 2 ? -offset : offset) * amount}%)`,
          })),
          { duration: secondsToMs(Config.Effects.ShakeSeconds) },
        );
      }),
    [target],
  );
}
