// How a desktop pet moves: it sits for a while, walks somewhere along the bottom of the
// desktop, and now and then takes a nap. Plain functions on a small state, stepped every
// frame by ui/DesktopPet, so they're tested without a browser. Numbers are in Config.Pets.

import { Config, type PetBehavior } from "@shared/Config";

export type PetMode = "sitting" | "walking" | "napping";

export interface PetState {
  // Where the pet's middle is, as a fraction of the desktop's width.
  x: number;
  // 1 faces right, -1 faces left.
  facing: 1 | -1;
  mode: PetMode;
  // Where a walking pet is headed.
  targetX: number;
  // Until a sitting or napping pet gets up.
  secondsLeft: number;
}

// A number from 0 up to 1, e.g. Math.random.
export type Random = () => number;

function between([min, max]: readonly [number, number], random: Random): number {
  return min + (max - min) * random();
}

function clampX(x: number): number {
  const margin = Config.Pets.EdgeMargin;
  return Math.min(1 - margin, Math.max(margin, x));
}

/** A pet sitting somewhere along the bottom of the desktop. */
export function startPet(behavior: PetBehavior, random: Random): PetState {
  const x = clampX(random());
  return {
    x,
    facing: 1,
    mode: "sitting",
    targetX: x,
    secondsLeft: between(behavior.sitSeconds, random),
  };
}

/** Somewhere at least MinWalkDistance away, on whichever side has room. */
function pickTarget(x: number, random: Random): number {
  const margin = Config.Pets.EdgeMargin;
  const reach = Config.Pets.MinWalkDistance;
  const left: [number, number] = [margin, x - reach];
  const right: [number, number] = [x + reach, 1 - margin];
  const leftRoom = Math.max(0, left[1] - left[0]);
  const rightRoom = Math.max(0, right[1] - right[0]);
  const pick = random() * (leftRoom + rightRoom);
  return clampX(pick < leftRoom ? left[0] + pick : right[0] + (pick - leftRoom));
}

/** What a resting pet does next: walk somewhere (or, now and then, nap). A pet that can't
 * move just sits a while longer. */
function getUp(state: PetState, behavior: PetBehavior, random: Random): PetState {
  if (behavior.speed <= 0) {
    return { ...state, mode: "sitting", secondsLeft: between(behavior.sitSeconds, random) };
  }
  if (state.mode === "sitting" && random() < behavior.napChance) {
    return { ...state, mode: "napping", secondsLeft: between(behavior.napSeconds, random) };
  }
  const targetX = pickTarget(state.x, random);
  return { ...state, mode: "walking", targetX, facing: targetX < state.x ? -1 : 1, secondsLeft: 0 };
}

/** The pet `seconds` later. */
export function stepPet(
  state: PetState,
  behavior: PetBehavior,
  seconds: number,
  random: Random,
): PetState {
  if (state.mode !== "walking") {
    const secondsLeft = state.secondsLeft - seconds;
    return secondsLeft > 0 ? { ...state, secondsLeft } : getUp(state, behavior, random);
  }
  const distance = state.targetX - state.x;
  const travel = behavior.speed * seconds;
  // A pet that can't move any more (e.g. reduced motion switched on mid-walk) sits down.
  if (behavior.speed <= 0 || Math.abs(distance) <= travel) {
    return {
      ...state,
      x: behavior.speed <= 0 ? state.x : state.targetX,
      mode: "sitting",
      secondsLeft: between(behavior.sitSeconds, random),
    };
  }
  return { ...state, x: state.x + Math.sign(distance) * travel };
}

/** Clicking a napping pet wakes it up (it sits a while); anything else carries on. */
export function wakePet(state: PetState, behavior: PetBehavior, random: Random): PetState {
  return state.mode === "napping"
    ? { ...state, mode: "sitting", secondsLeft: between(behavior.sitSeconds, random) }
    : state;
}
