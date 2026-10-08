// Small animated pieces for the feedback moments in docs/design.md ("Look and feel"): a
// rubber stamp that slams down, coins bursting out of a button, and a number that rolls up
// to its new value. They animate with CSS (timings from Config.Effects), stay inside
// whatever they're placed in, and calm down under prefers-reduced-motion.

import { type CSSProperties, type ReactElement, useEffect, useMemo, useRef, useState } from "react";
import { Config } from "@shared/Config";
import { MsPerSecond } from "@shared/time";
import { cx } from "@client/ui/classNames";
import styles from "@client/ui/Effects.module.css";

export type StampTone = "good" | "bad";

/** A big tilted word like a rubber stamp (e.g. PROMOTED), slammed down after `delaySeconds`.
 * With `fades`, it holds for a moment and then fades away. Remount it (a new key) to slam
 * it again. */
export function Stamp({
  text,
  tone,
  fades = false,
  delaySeconds = 0,
  className,
}: {
  text: string;
  tone: StampTone;
  fades?: boolean;
  delaySeconds?: number;
  className?: string;
}): ReactElement {
  const { StampStartScale, SlamSeconds, StampRotationDegrees, StampHoldSeconds, StampFadeSeconds } =
    Config.Effects;
  const style = {
    "--stamp-scale": StampStartScale,
    "--stamp-rotation": `${StampRotationDegrees}deg`,
    "--slam-seconds": `${SlamSeconds}s`,
    "--slam-delay": `${delaySeconds}s`,
    "--fade-delay": `${delaySeconds + SlamSeconds + StampHoldSeconds}s`,
    "--fade-seconds": `${StampFadeSeconds}s`,
  } as CSSProperties;
  return (
    <p className={cx(styles.stamp, styles[tone], fades && styles.fades, className)} style={style}>
      {text}
    </p>
  );
}

const FullTurnDegrees = 360;
// Coins fly up and out in this fan around straight up, in degrees either side.
const CoinSpreadDegrees = 70;
// Each coin flies between this fraction of the full distance and all of it.
const CoinMinTravel = 0.5;

/** A number from 0 up to 1 that looks random but is always the same for `n`, so a burst
 * renders the same every time (rendering must be pure). */
function scatter(n: number): number {
  const value = Math.sin(n * 12.9898) * 43758.5453;
  return value - Math.floor(value);
}

/** A handful of coins thrown up and out from the middle of its parent, fading as they go.
 * Remount it (a new key) for another burst; a different `seed` scatters them differently. */
export function CoinBurst({ seed }: { seed: number }): ReactElement {
  const coins = useMemo(
    () =>
      Array.from({ length: Config.Effects.CoinCount }, (_, index) => {
        const n = seed * Config.Effects.CoinCount + index;
        const angle = ((scatter(n) * 2 - 1) * CoinSpreadDegrees - 90) * (Math.PI / 180);
        const travel = CoinMinTravel + scatter(n + 0.5) * (1 - CoinMinTravel);
        return {
          x: Math.cos(angle) * travel,
          y: Math.sin(angle) * travel,
          spin: (scatter(n + 0.25) * 2 - 1) * FullTurnDegrees,
        };
      }),
    [seed],
  );
  return (
    <span className={styles.coins} aria-hidden="true">
      {coins.map((coin, index) => (
        <span
          key={index}
          className={styles.coin}
          style={
            {
              "--coin-x": coin.x,
              "--coin-y": coin.y,
              "--coin-spin": `${coin.spin}deg`,
              "--coin-seconds": `${Config.Effects.CoinSeconds}s`,
              "--coin-travel": `${Config.Effects.CoinTravel * 100}cqh`,
            } as CSSProperties
          }
        />
      ))}
    </span>
  );
}

/** `value` shown with `format`, rolling up to each bigger value: fast at first, slowing
 * into the final number. Drops (e.g. a new shift starting at 0) and reduced motion jump
 * straight there. */
export function RollingNumber({
  value,
  format,
}: {
  value: number;
  format: (value: number) => string;
}): ReactElement {
  const [shown, setShown] = useState(value);
  const shownRef = useRef(value);

  useEffect(() => {
    const from = shownRef.current;
    if (from === value) {
      return;
    }
    if (value < from || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      shownRef.current = value;
      setShown(value);
      return;
    }
    const start = performance.now();
    const duration = Config.Effects.RollSeconds * MsPerSecond;
    let frame = requestAnimationFrame(function step(now: number): void {
      // The first frame's time can be a touch before `start`.
      const progress = Math.min(Math.max((now - start) / duration, 0), 1);
      const eased = 1 - (1 - progress) ** 3;
      const next = Math.round(from + (value - from) * eased);
      shownRef.current = next;
      setShown(next);
      if (progress < 1) {
        frame = requestAnimationFrame(step);
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [value]);

  return <>{format(shown)}</>;
}
