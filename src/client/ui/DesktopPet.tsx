// The pet the player bought in the Shop, living along the bottom of the desktop, in front of
// the icons and windows. It sits, wanders and naps (ui/petRules), and clicking it gets a
// reaction. Gizmo the Desk Buddy also hands out advice nobody asked for. Under
// prefers-reduced-motion pets stay put. Only drawn on this player's own screen.

import {
  type CSSProperties,
  memo,
  type ReactElement,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { Config } from "@shared/Config";
import type { VisiblePetId } from "@shared/cosmetics";
import { MsPerSecond, secondsToMs } from "@shared/time";
import { getUpgrade } from "@shared/Upgrades";
import { useStats } from "@client/state/statsStore";
import { cx } from "@client/ui/classNames";
import { percent } from "@client/ui/layout";
import { type PetMode, type PetState, startPet, stepPet, wakePet } from "@client/ui/petRules";
import { PetSprites, rowRuns, type Sprite } from "@client/ui/petSprites";
import styles from "@client/ui/DesktopPet.module.css";

// What each pet says when clicked.
const Reactions: Record<VisiblePetId, readonly string[]> = {
  pixelCat: ["Mrrp!", "Purrrr...", "Meow?", "♥", "*stares at your coffee*"],
  petRock: ["...", "(It's a rock.)", "*rock noises*", "Still a rock."],
  deskBuddy: [
    "It looks like you're running a scam. Want help with that?",
    "Tip: callers love it when you remember their name!",
    "Have you tried turning the caller off and on again?",
    "I'm not spyware. Probably.",
    "Quota looking low? Have you tried earning more money?",
    `Fun fact: I was free! Wait, no. You paid $${Config.Shop.CosmeticPrices.deskBuddy}.`,
    "Grandmas love a polite caller. So I've heard.",
  ],
};
// Shown over a napping pet.
const NapBubble = "Zz";
// Near an edge, a bubble lines up with the pet's side instead of its middle, so it isn't cut
// off. As a fraction of the desktop's width.
const BubbleEdge = 0.15;
// The pet's size, for the CSS.
const StripStyle = { "--pet-height": Config.Pets.Height } as CSSProperties;

type BubbleSide = "middle" | "left" | "right";

interface Bubble {
  text: string;
  side: BubbleSide;
  // New for every bubble, so saying the same thing twice still shows it for the full time.
  id: number;
}

interface PetView {
  mode: PetMode;
  facing: 1 | -1;
  // Which walking step is showing.
  step: 0 | 1;
}

function pick<T>(items: readonly T[]): T | undefined {
  return items[Math.floor(Math.random() * items.length)];
}

function between([min, max]: readonly [number, number]): number {
  return min + (max - min) * Math.random();
}

function sideFor(x: number): BubbleSide {
  if (x < BubbleEdge) {
    return "left";
  }
  return x > 1 - BubbleEdge ? "right" : "middle";
}

/** The equipped pet, if any. Remounts when the pet changes, so a new pet starts fresh. */
export function DesktopPet(): ReactElement | null {
  const { pet } = useStats();
  return pet === "noPet" ? null : <WanderingPet key={pet} pet={pet} />;
}

function WanderingPet({ pet }: { pet: VisiblePetId }): ReactElement {
  const behavior = Config.Pets.Behaviors[pet];
  const art = PetSprites[pet];
  const name = getUpgrade(pet)?.name ?? "your pet";
  const petRef = useRef<HTMLDivElement>(null);
  const [start] = useState(() => startPet(behavior, Math.random));
  const stateRef = useRef<PetState>(start);
  const [view, setView] = useState<PetView>({ mode: start.mode, facing: start.facing, step: 0 });
  const [bubble, setBubble] = useState<Bubble | null>(null);
  // Screen readers hear only what the player's own click got, never the advice or naps.
  const [announcement, setAnnouncement] = useState("");
  const nextBubbleId = useRef(0);

  // Walks the pet every frame. Its position goes straight to the element; React only
  // re-renders when its pose changes.
  useEffect(() => {
    const stillMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let last = performance.now();
    let walked = 0;
    let frame = requestAnimationFrame(tick);

    function tick(now: number): void {
      const seconds = Math.min((now - last) / MsPerSecond, Config.Pets.MaxFrameSeconds);
      last = now;
      const moves = stillMotion.matches ? { ...behavior, speed: 0 } : behavior;
      const state = stepPet(stateRef.current, moves, seconds, Math.random);
      stateRef.current = state;
      if (petRef.current) {
        petRef.current.style.left = percent(state.x);
      }
      walked = state.mode === "walking" ? walked + seconds : 0;
      const step = Math.floor(walked / Config.Pets.StepSeconds) % 2 === 0 ? 0 : 1;
      setView((shown) =>
        shown.mode === state.mode && shown.facing === state.facing && shown.step === step
          ? shown
          : { mode: state.mode, facing: state.facing, step },
      );
      frame = requestAnimationFrame(tick);
    }
    return () => cancelAnimationFrame(frame);
  }, [behavior]);

  // A speech bubble goes away after a while.
  useEffect(() => {
    if (bubble === null) {
      return;
    }
    const timer = setTimeout(() => setBubble(null), secondsToMs(Config.Pets.BubbleSeconds));
    return () => clearTimeout(timer);
  }, [bubble]);

  const say = useCallback((text: string | undefined): void => {
    if (text !== undefined) {
      nextBubbleId.current += 1;
      setBubble({ text, side: sideFor(stateRef.current.x), id: nextBubbleId.current });
    }
  }, []);

  // Gizmo pipes up with advice every so often.
  useEffect(() => {
    if (pet !== "deskBuddy") {
      return;
    }
    let timer: ReturnType<typeof setTimeout>;
    const schedule = (): void => {
      timer = setTimeout(
        () => {
          say(pick(Reactions.deskBuddy));
          schedule();
        },
        secondsToMs(between(Config.Pets.AdviceSeconds)),
      );
    };
    schedule();
    return () => clearTimeout(timer);
  }, [pet, say]);

  function onClick(): void {
    stateRef.current = wakePet(stateRef.current, behavior, Math.random);
    const reaction = pick(Reactions[pet]);
    say(reaction);
    setAnnouncement(reaction ?? "");
  }

  const sprite =
    view.mode === "walking"
      ? art.walking[view.step]
      : view.mode === "napping"
        ? art.napping
        : art.sitting;
  const shown: Bubble | null =
    bubble ?? (view.mode === "napping" ? { text: NapBubble, side: "middle", id: 0 } : null);

  return (
    <div className={styles.strip} style={StripStyle}>
      <div ref={petRef} className={styles.pet} style={{ left: percent(start.x) }}>
        {shown !== null && (
          <span key={shown.id} className={cx(styles.bubble, styles[shown.side])} aria-hidden="true">
            {shown.text}
          </span>
        )}
        <button
          type="button"
          className={cx(styles.button, pet === "deskBuddy" && styles.floats)}
          aria-label={`Pet ${name}`}
          onClick={onClick}
        >
          <span className={styles.body}>
            <PetPicture sprite={sprite} palette={art.palette} flipped={view.facing < 0} />
          </span>
        </button>
      </div>
      <span className={styles.announcer} role="status">
        {announcement}
      </span>
    </div>
  );
}

const PetPicture = memo(function PetPicture({
  sprite,
  palette,
  flipped,
}: {
  sprite: Sprite;
  palette: Readonly<Record<string, string>>;
  flipped: boolean;
}): ReactElement {
  const height = sprite.rows.length;
  const width = sprite.rows[0]?.length ?? 0;
  const style = { "--pet-aspect": width / Math.max(height, 1) } as CSSProperties;
  return (
    <svg
      className={cx(styles.picture, flipped && styles.flipped)}
      style={style}
      viewBox={`0 0 ${width} ${height}`}
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      {sprite.rows.flatMap((row, y) =>
        rowRuns(row).map(({ start, length, pixel }) => (
          <rect
            key={`${y}-${start}`}
            x={start}
            y={y}
            width={length}
            height={1}
            fill={palette[pixel]}
          />
        )),
      )}
    </svg>
  );
});
